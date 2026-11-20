<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\Console\Output\OutputInterface;

class LocalDevelopmentSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        if (! app()->environment('local')) {
            throw new RuntimeException('Development accounts can only be created with APP_ENV=local.');
        }

        $this->call(RolePermissionSeeder::class);

        foreach (['super-admin' => 'Local Admin', 'hr' => 'Local HR', 'finance' => 'Local Finance'] as $slug => $name) {
            $email = $slug.'@oasis.test';
            if (User::whereRaw('LOWER(email) = ?', [$email])->exists()) {
                $this->command?->line($email.' already exists; its password and access were preserved.');

                continue;
            }

            $password = Str::password(24);
            $user = new User(['name' => $name, 'email' => $email, 'password' => $password]);
            $user->forceFill([
                'role_id' => Role::where('slug', $slug)->firstOrFail()->id,
                'is_active' => true,
                'must_change_password' => true,
            ])->save();

            $this->command?->getOutput()->writeln($email.' temporary password (shown once): '.$password, OutputInterface::OUTPUT_RAW);
        }
    }
}
