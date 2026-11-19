<?php

namespace App\Http\Middleware;

use App\Models\ActivityLog;
use App\Models\Role;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user()->refresh()->load('role');
        $restoredSession = Auth::viaRemember() && ! $request->session()->has('auth_version');
        if ($restoredSession) {
            $request->session()->put('auth_version', $user->auth_version);
        }
        if (! $user->is_active || ! array_key_exists($user->role?->slug ?? '', Role::ACCESS)
            || $request->session()->get('auth_version') !== $user->auth_version) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            if ($request->expectsJson()) {
                return response()->json(['message' => 'Your session has expired or your account is unavailable.'], 401);
            }

            return redirect()->route('login')->withErrors(['email' => 'Your session has expired or your account is unavailable.']);
        }
        if ($restoredSession) {
            DB::transaction(function () use ($user) {
                $user->forceFill(['last_login_at' => now()])->save();
                ActivityLog::record($user, 'auth.login', 'Signed in using a remembered device.');
            });
        }
        if ($user->must_change_password && ! $request->routeIs('password.edit', 'password.update', 'logout', 'auth.session')) {
            return redirect()->route('password.edit');
        }

        return $next($request);
    }
}
