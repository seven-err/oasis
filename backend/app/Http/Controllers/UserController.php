<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveUserRequest;
use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    public function index(Request $request): View|JsonResponse
    {
        Gate::authorize('users');
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'role' => ['nullable', Rule::in(array_keys(Role::ACCESS))],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ]);
        if (! $request->expectsJson()) {
            return app(ApplicationController::class)->show($request, 'users');
        }
        $users = User::with('role')
            ->when($filters['search'] ?? null, fn ($query, $search) => $query->where(fn ($query) => $query
                ->where('name', 'like', '%'.$search.'%')->orWhere('email', 'like', '%'.$search.'%')))
            ->when($filters['role'] ?? null, fn ($query, $role) => $query->whereHas('role', fn ($query) => $query->where('slug', $role)))
            ->when($filters['status'] ?? null, fn ($query, $status) => $query->where('is_active', $status === 'active'))
            ->orderByDesc('id')->paginate(20)->withQueryString();

        return response()->json($users);
    }

    public function create(Request $request): View|JsonResponse
    {
        Gate::authorize('users');

        return $request->expectsJson()
            ? response()->json(['roles' => Role::orderBy('id')->get()])
            : app(ApplicationController::class)->show($request, 'users');
    }

    public function store(SaveUserRequest $request): Response|JsonResponse
    {
        Gate::authorize('users');
        $temporaryPassword = Str::password(24);
        $user = DB::transaction(function () use ($request, $temporaryPassword) {
            Role::where('slug', 'super-admin')->lockForUpdate()->firstOrFail();
            Gate::forUser($request->user()->fresh())->authorize('users');
            $data = $request->validated();
            $user = new User(['name' => $data['name'], 'email' => $data['email'], 'password' => $temporaryPassword]);
            $user->forceFill([
                'role_id' => $data['role_id'], 'is_active' => $request->boolean('is_active'), 'must_change_password' => true,
            ])->save();
            ActivityLog::record($request->user(), 'user.created', "Created account #{$user->id}.");

            return $user;
        });

        return $request->expectsJson()
            ? response()->json(compact('user', 'temporaryPassword'))
            : response()->view('users.credentials', compact('user', 'temporaryPassword'));
    }

    public function show(Request $request, User $user): View|JsonResponse
    {
        Gate::authorize('users');

        return $request->expectsJson()
            ? response()->json(['user' => $user->load('role')])
            : app(ApplicationController::class)->show($request, 'users');
    }

    public function edit(Request $request, User $user): View|JsonResponse
    {
        Gate::authorize('users');

        return $request->expectsJson()
            ? response()->json(['user' => $user->load('role'), 'roles' => Role::orderBy('id')->get()])
            : app(ApplicationController::class)->show($request, 'users');
    }

    public function update(SaveUserRequest $request, User $user): RedirectResponse|JsonResponse
    {
        Gate::authorize('users');
        DB::transaction(function () use ($request, $user) {
            $adminRole = Role::where('slug', 'super-admin')->lockForUpdate()->firstOrFail();
            Gate::forUser($request->user()->fresh())->authorize('users');
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $data = $request->validated();
            $newRole = (int) $data['role_id'];
            $active = $request->boolean('is_active');
            if ($request->user()->id === $user->id && $newRole !== $user->role_id) {
                throw ValidationException::withMessages(['role_id' => 'You cannot change your own role.']);
            }
            if ($user->role_id === $adminRole->id && $user->is_active && (! $active || $newRole !== $adminRole->id)
                && ! User::where('role_id', $adminRole->id)->where('is_active', true)->where('id', '!=', $user->id)->exists()) {
                throw ValidationException::withMessages(['is_active' => 'The last active Super Admin cannot be deactivated or demoted.']);
            }
            if ($user->is_active && ! $active) {
                $request->validate(['confirmation' => ['required', Rule::in(['DEACTIVATE'])]]);
            }
            $changes = [
                'role_id' => $newRole, 'is_active' => $active,
                'name' => $data['name'], 'email' => $data['email'],
            ];
            $securityChange = $newRole !== $user->role_id || $active !== $user->is_active || $data['email'] !== $user->email;
            if ($data['email'] !== $user->email) {
                $changes['email_verified_at'] = null;
            }
            $user->forceFill($changes)->save();
            if ($securityChange) {
                $user->revokeSessions();
            }
            ActivityLog::record($request->user(), 'user.updated',
                "Updated account #{$user->id}; role #{$newRole}; status ".($active ? 'active.' : 'inactive.'));
        });

        return $request->expectsJson()
            ? response()->json(['message' => 'Account updated.'])
            : redirect()->route('users.show', $user)->with('status', 'Account updated.');
    }

    public function resetPassword(Request $request, User $user): Response|JsonResponse
    {
        Gate::authorize('users');
        $request->validate([
            'current_password' => ['required', 'current_password'],
            'confirmation' => ['required', Rule::in(['RESET'])],
        ]);
        $temporaryPassword = Str::password(24);
        DB::transaction(function () use ($request, $user, $temporaryPassword) {
            Role::where('slug', 'super-admin')->lockForUpdate()->firstOrFail();
            Gate::forUser($request->user()->fresh())->authorize('users');
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $user->forceFill(['password' => $temporaryPassword, 'must_change_password' => true])->save();
            $user->revokeSessions();
            ActivityLog::record($request->user(), 'user.password_reset', "Reset password for account #{$user->id}; sessions revoked.");
        });

        return $request->expectsJson()
            ? response()->json(compact('user', 'temporaryPassword'))
            : response()->view('users.credentials', compact('user', 'temporaryPassword'));
    }
}
