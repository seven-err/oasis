<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class ApplicationAccessTest extends TestCase
{
    use LazilyRefreshDatabase;

    protected $seed = true;

    protected $seeder = RolePermissionSeeder::class;

    public function test_session_endpoint_requires_authentication(): void
    {
        $this->getJson('/auth/session')->assertUnauthorized();
    }

    public function test_session_returns_real_user_permissions_without_secrets(): void
    {
        $user = User::factory()->withRole('finance')->create();
        $this->signIn($user);

        $this->getJson('/auth/session')->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.name', $user->name)
            ->assertJsonPath('user.role', 'finance')
            ->assertJsonPath('user.permissions', ['dashboard', 'checks', 'payables', 'receivables', 'account'])
            ->assertJsonMissingPath('user.password')->assertJsonMissingPath('user.auth_version')
            ->assertDontSee($user->password)->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_temporary_password_session_reports_requirement_without_unlocking_modules(): void
    {
        $user = User::factory()->withRole('hr')->temporaryPassword()->create();
        $this->signIn($user);

        $this->getJson('/auth/session')->assertOk()->assertJsonPath('user.mustChangePassword', true);
        $this->get('/hr/alphalist')->assertRedirect(route('password.edit'));
    }

    public function test_inactive_session_returns_401_to_the_existing_app(): void
    {
        $user = User::factory()->withRole('hr')->create();
        $this->signIn($user);
        $user->forceFill(['is_active' => false])->save();

        $this->getJson('/auth/session')->assertUnauthorized();

        $this->assertGuest();
    }

    #[TestWith(['hr', '/hr/alphalist', 'employees'])]
    #[TestWith(['finance', '/checks', 'checks'])]
    #[TestWith(['finance', '/payables', 'payables'])]
    #[TestWith(['finance', '/receivables', 'receivables'])]
    #[TestWith(['super-admin', '/team', 'users'])]
    public function test_direct_route_bootstraps_the_requested_existing_screen(string $role, string $url, string $page): void
    {
        $this->signIn(User::factory()->withRole($role)->create());

        $this->get($url)->assertOk()->assertViewIs('application')->assertViewHas('initialPage', $page)
            ->assertDontSee('This module has not been ported yet');
    }

    public function test_dashboard_escapes_user_data_in_bootstrap_script(): void
    {
        $this->signIn(User::factory()->withRole('hr')->create(['name' => '</script><script>alert(1)</script>']));

        $this->get('/dashboard')->assertOk()->assertDontSee('</script><script>alert(1)</script>', false);
    }

    public function test_application_assets_require_login_and_cannot_traverse_directories(): void
    {
        $this->get('/oasis/assets/app.js')->assertRedirect(route('login'));
        $this->signIn(User::factory()->withRole('hr')->create());

        $this->get('/oasis/assets/missing.js')->assertNotFound();
        $this->get('/oasis/assets/../../../backend/.env')->assertNotFound();
    }

    public function test_admin_user_and_activity_endpoints_work_in_the_existing_interface(): void
    {
        $user = User::factory()->withRole('super-admin')->create();
        $this->signIn($user);

        $this->getJson('/users')->assertOk()->assertJsonPath('data.0.email', $user->email)->assertDontSee($user->password);
        $this->getJson('/activity-logs')->assertOk()->assertJsonPath('data', []);
    }

    public function test_personal_profile_and_logout_work_without_a_second_login_system(): void
    {
        $user = User::factory()->withRole('hr')->create();
        $this->signIn($user);

        $this->putJson('/account', ['name' => 'Updated HR', 'email' => $user->email, 'current_password' => 'password'])
            ->assertOk()->assertJsonPath('message', 'Account updated.');
        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'Updated HR']);
        $this->postJson('/logout')->assertOk();
        $this->getJson('/auth/session')->assertUnauthorized();
    }

    public function test_login_error_is_displayed_once(): void
    {
        $user = User::factory()->withRole('hr')->create();

        $response = $this->followingRedirects()->from('/login')->post('/login', ['email' => $user->email, 'password' => 'incorrect']);

        $response->assertOk();
        $response->assertSee('id="email-error"', false)->assertSee('aria-invalid="true"', false);
        $this->assertSame(1, substr_count($response->getContent(), 'The provided credentials do not match an active account.'));
    }

    public function test_changed_temporary_password_is_rejected_while_new_password_works(): void
    {
        $user = User::factory()->withRole('hr')->create(['password' => 'New-Password2026!']);

        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertSessionHasErrors('email');
        $this->assertGuest();
        $this->post('/login', ['email' => $user->email, 'password' => 'New-Password2026!'])->assertRedirect(route('dashboard'));
        $this->assertAuthenticatedAs($user);
    }
}
