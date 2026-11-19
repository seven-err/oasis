<?php

namespace Database\Seeders;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use RuntimeException;

class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        $credentials = config('oasis.initial_admin');
        if (! array_filter($credentials)) {
            $this->command?->warn('Initial administrator not created. Set OASIS_ADMIN_NAME, OASIS_ADMIN_EMAIL and OASIS_ADMIN_PASSWORD.');

            return;
        }
        $this->call(RolePermissionSeeder::class);
        Validator::make($credentials, [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', Password::defaults()],
        ])->validate();

        DB::transaction(function () use ($credentials) {
            $role = Role::where('slug', 'super-admin')->lockForUpdate()->firstOrFail();
            $email = mb_strtolower(trim($credentials['email']));
            $existing = User::whereRaw('LOWER(email) = ?', [$email])->first();
            if ($existing) {
                if ($existing->role_id !== $role->id) {
                    throw new RuntimeException('Initial administrator email belongs to an existing account; no privileges were changed.');
                }

                return;
            }
            if (User::where('role_id', $role->id)->exists()) {
                throw new RuntimeException('An administrator already exists. Create additional accounts through User Management.');
            }
            $user = new User($credentials);
            $user->email = $email;
            $user->forceFill(['role_id' => $role->id, 'is_active' => true, 'must_change_password' => true])->save();
            ActivityLog::record(null, 'admin.seeded', "Initial administrator #{$user->id} created.");
        });
    }
}
