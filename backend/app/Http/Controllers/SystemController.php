<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class SystemController extends Controller
{
    public function activity(Request $request): View|JsonResponse
    {
        Gate::authorize('activity');

        $logs = ActivityLog::with('user')->orderByDesc('id')->paginate(30);

        return $request->expectsJson() ? response()->json($logs) : view('system.activity', compact('logs'));
    }

    public function settings(Request $request): View|JsonResponse
    {
        Gate::authorize('settings');

        $roles = Role::with('permissions')->whereIn('slug', ['hr', 'finance'])->get();
        if ($request->expectsJson()) {
            return response()->json(['roles' => $roles->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'permissions' => $role->permissions->pluck('slug'),
                'availablePermissions' => collect(array_diff(Role::ACCESS[$role->slug], ['dashboard', 'account']))
                    ->map(fn (string $slug) => ['slug' => $slug, 'name' => Role::PERMISSIONS[$slug]])->values(),
            ])]);
        }

        return view('system.settings', compact('roles'));
    }

    public function updatePermissions(Request $request, Role $role): RedirectResponse|JsonResponse
    {
        Gate::authorize('settings');
        abort_unless(in_array($role->slug, ['hr', 'finance'], true), 403);
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::in(array_diff(Role::ACCESS[$role->slug], ['dashboard', 'account']))],
        ]);
        DB::transaction(function () use ($request, $role, $data) {
            Role::where('slug', 'super-admin')->lockForUpdate()->firstOrFail();
            Gate::forUser($request->user()->fresh())->authorize('settings');
            $permissions = array_merge(['dashboard', 'account'], $data['permissions'] ?? []);
            $role->permissions()->sync(Permission::whereIn('slug', $permissions)->pluck('id'));
            ActivityLog::record($request->user(), 'permissions.updated', "Updated {$role->slug} permissions: ".implode(', ', $permissions).'.');
        });

        return $request->expectsJson()
            ? response()->json(['message' => "{$role->name} permissions updated."])
            : back()->with('status', 'Role permissions updated.');
    }
}
