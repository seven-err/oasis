<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\LocalDevelopmentSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\TestWith;
use RuntimeException;
use Tests\TestCase;

class LocalDevelopmentSeederTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_local_accounts_can_log_in_with_the_printed_passwords(): void
    {
        $this->assertDatabaseCount('users', 0);
        $this->app['env'] = 'local';
        $this->assertSame(0, Artisan::call('db:seed', ['--class' => LocalDevelopmentSeeder::class]));
        $text = Artisan::output();
        $this->app['env'] = 'testing';

        foreach (['super-admin', 'hr', 'finance'] as $slug) {
            $email = $slug.'@oasis.test';
            preg_match('/'.preg_quote($email, '/').' temporary password \(shown once\): (.+)/', $text, $matches);
            $this->assertArrayHasKey(1, $matches);
            $password = trim($matches[1]);
            $user = User::where('email', $email)->firstOrFail();
            $this->assertSame($slug, $user->role->slug);
            $this->assertTrue($user->is_active);
            $this->assertTrue($user->must_change_password);
            $this->assertTrue(Hash::check($password, $user->password));
            $this->post('/login', ['email' => $email, 'password' => $password])->assertRedirect(route('password.edit'));
            $this->assertAuthenticatedAs($user);
            $this->post('/logout');
        }

        $this->assertDatabaseCount('users', 3);
    }

    public function test_reseeding_preserves_existing_passwords_roles_and_status(): void
    {
        $this->seed(RolePermissionSeeder::class);
        $existing = User::factory()->withRole('hr')->create(['email' => 'SUPER-ADMIN@oasis.test', 'is_active' => false])->fresh();
        $this->app['env'] = 'local';

        $this->seed(LocalDevelopmentSeeder::class);
        $this->seed(LocalDevelopmentSeeder::class);

        $this->assertDatabaseCount('users', 3);
        $this->assertSame($existing->getAttributes(), $existing->fresh()->getAttributes());
    }

    #[TestWith(['production'])]
    #[TestWith(['staging'])]
    #[TestWith(['testing'])]
    public function test_development_seeding_is_refused_outside_local(string $environment): void
    {
        $roleCount = Role::count();
        $this->app['env'] = $environment;

        try {
            $this->app->make(LocalDevelopmentSeeder::class)->run();
            $this->fail('Expected development seeding to be refused.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Development accounts can only be created with APP_ENV=local.', $exception->getMessage());
        }

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('roles', $roleCount);
    }
}
