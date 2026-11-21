<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AccountController extends Controller
{
    public function edit(): View
    {
        Gate::authorize('account');

        return view('account.edit');
    }

    public function update(Request $request): RedirectResponse|JsonResponse
    {
        Gate::authorize('account');
        $request->merge(['email' => mb_strtolower(trim((string) $request->input('email')))]);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($request->user()->id)],
            'current_password' => ['required', 'current_password'],
            'role_id' => ['prohibited'], 'is_active' => ['prohibited'], 'password' => ['prohibited'],
        ]);
        $user = DB::transaction(function () use ($request, $data) {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            if (! $user->is_active || $user->auth_version !== $request->session()->get('auth_version')
                || ! Hash::check($data['current_password'], $user->password)) {
                throw ValidationException::withMessages(['current_password' => 'Your credentials changed. Please sign in again.']);
            }
            $emailChanged = $data['email'] !== $user->email;
            $user->fill(['name' => $data['name'], 'email' => $data['email']]);
            if ($emailChanged) {
                $user->email_verified_at = null;
                $user->revokeSessions();
            } else {
                $user->save();
            }
            ActivityLog::record($user, 'account.updated', 'Updated personal account information.');

            return $user;
        });
        $request->session()->regenerate(true);
        $request->session()->put('auth_version', $user->auth_version);

        return $request->expectsJson() ? response()->json(['message' => 'Account updated.'])
            : back()->with('status', 'Account updated.');
    }

    public function updatePassword(Request $request): RedirectResponse|JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'string', 'max:1024', 'confirmed', 'different:current_password', Password::defaults()],
        ]);
        $user = DB::transaction(function () use ($request, $data) {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            if (! $user->is_active || $user->auth_version !== $request->session()->get('auth_version')
                || ! Hash::check($data['current_password'], $user->password)) {
                throw ValidationException::withMessages(['current_password' => 'Your credentials changed. Please sign in again.']);
            }
            $user->forceFill(['password' => $data['password'], 'must_change_password' => false])->save();
            $user->revokeSessions();
            ActivityLog::record($user, 'password.changed', 'Changed password; other sessions revoked.');

            return $user;
        });
        $request->session()->regenerate(true);
        $request->session()->put('auth_version', $user->auth_version);

        return $request->expectsJson()
            ? response()->json(['message' => 'Password changed. Other sessions have been signed out.', 'csrfToken' => csrf_token()])
            : redirect()->route('dashboard')->with('status', 'Password changed. Other sessions have been signed out.');
    }
}
