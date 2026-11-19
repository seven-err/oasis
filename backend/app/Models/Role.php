<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

#[Fillable(['name', 'slug'])]
class Role extends Model
{
    public const PERMISSIONS = [
        'dashboard' => 'Dashboard', 'hr' => 'HR Alphalist',
        'checks' => 'Check Monitoring', 'payables' => 'Payable Monitoring',
        'receivables' => 'Receivable Monitoring', 'users' => 'User Management',
        'activity' => 'Activity Logs', 'settings' => 'System Settings', 'account' => 'My Account',
    ];

    public const ACCESS = [
        'super-admin' => ['dashboard', 'hr', 'checks', 'payables', 'receivables', 'users', 'activity', 'settings', 'account'],
        'hr' => ['dashboard', 'hr', 'account'],
        'finance' => ['dashboard', 'checks', 'payables', 'receivables', 'account'],
    ];

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permissions')->withTimestamps();
    }
}
