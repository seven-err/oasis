<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function create(): View
    {
        return view('auth.login');
    }

    public function store(Request $request): RedirectResponse
    {
        $input = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:1024'],
            'remember' => ['sometimes', 'boolean'],
        ]);
        $email = mb_strtolower(trim($input['email']));
        $key = 'login:'.hash('sha256', $email.'|'.$request->ip());
        $ipKey = 'login-ip:'.hash('sha256', (string) $request->ip());
        if (RateLimiter::tooManyAttempts($key, 5) || RateLimiter::tooManyAttempts($ipKey, 30)) {
            throw ValidationException::withMessages(['email' => 'Too many login attempts. Please try again in one minute.']);
        }
        RateLimiter::hit($key, 60);
        RateLimiter::hit($ipKey, 60);
        if (! Auth::attempt(['email' => $email, 'password' => $input['password'], 'is_active' => true], $request->boolean('remember'))) {
            throw ValidationException::withMessages(['email' => 'The provided credentials do not match an active account.']);
        }
        RateLimiter::clear($key);
        $user = $request->user();
        $request->session()->regenerate();
        $request->session()->put('auth_version', $user->auth_version);
        DB::transaction(function () use ($user) {
            $user->forceFill(['last_login_at' => now()])->save();
            ActivityLog::record($user, 'auth.login', 'Signed in.');
        });

        return redirect()->route($user->must_change_password ? 'password.edit' : 'dashboard');
    }

    public function destroy(Request $request): RedirectResponse|JsonResponse
    {
        ActivityLog::record($request->user(), 'auth.logout', 'Signed out.');
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return $request->expectsJson() ? response()->json(['redirect' => route('login')]) : redirect()->route('login');
    }
}
