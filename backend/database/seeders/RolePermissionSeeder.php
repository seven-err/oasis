<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        foreach (Role::PERMISSIONS as $slug => $name) {
            Permission::firstOrCreate(['slug' => $slug], ['name' => $name]);
        }
        foreach (['super-admin' => 'Super Admin', 'hr' => 'HR', 'finance' => 'Finance'] as $slug => $name) {
            $role = Role::firstOrCreate(['slug' => $slug], ['name' => $name]);
            if ($role->wasRecentlyCreated) {
                $role->permissions()->sync(Permission::whereIn('slug', Role::ACCESS[$slug])->pluck('id'));
            }
        }
    }
}
