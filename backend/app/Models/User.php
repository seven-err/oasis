<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'auth_version'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
            'last_login_at' => 'datetime',
            'auth_version' => 'integer',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function hasPermission(string $permission): bool
    {
        $slug = $this->role?->slug;
        if (! $this->is_active || ! in_array($permission, Role::ACCESS[$slug] ?? [], true)) {
            return false;
        }

        return $slug === 'super-admin' || $this->role->permissions()->where('slug', $permission)->exists();
    }

    public function revokeSessions(): void
    {
        $this->forceFill(['auth_version' => $this->auth_version + 1, 'remember_token' => Str::random(60)])->save();
        if (config('session.driver') === 'database') {
            DB::connection(config('session.connection'))->table(config('session.table'))->where('user_id', $this->id)->delete();
        }
    }
}
