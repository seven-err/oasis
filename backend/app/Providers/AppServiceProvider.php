<?php

namespace App\Providers;

use App\Models\Role;
use App\Models\User;
use Closure;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        Password::defaults(fn () => Password::min(12)->max(1024)->mixedCase()->numbers()->symbols()->rules([
            function (string $attribute, mixed $value, Closure $fail): void {
                if (is_string($value) && str_contains($value, "\0")) {
                    $fail('The password cannot contain null characters.');
                }
                if (is_string($value) && config('hashing.driver') === 'bcrypt' && strlen($value) > 72) {
                    $fail('The password must not exceed 72 bytes with the configured password hashing.');
                }
            },
        ]));
        foreach (array_keys(Role::PERMISSIONS) as $permission) {
            Gate::define($permission, fn (User $user) => $user->hasPermission($permission));
        }
    }
}
