<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class AccessControlTest extends TestCase
{
    use LazilyRefreshDatabase;

    protected $seed = true;

    protected $seeder = RolePermissionSeeder::class;

    #[TestWith(['super-admin', ['dashboard', 'hr', 'checks', 'payables', 'receivables', 'users', 'activity', 'settings', 'account']])]
    #[TestWith(['hr', ['dashboard', 'hr', 'checks', 'payables', 'receivables', 'account']])]
    #[TestWith(['finance', ['dashboard', 'checks', 'payables', 'receivables', 'account']])]
    public function test_gate_enforces_the_complete_role_matrix(string $role, array $allowed): void
    {
        $user = User::factory()->withRole($role)->create();

        foreach (array_keys(Role::PERMISSIONS) as $permission) {
            $this->assertSame(in_array($permission, $allowed, true), Gate::forUser($user)->allows($permission), $role.' / '.$permission);
        }
    }

    #[TestWith(['hr', '/users'])]
    #[TestWith(['hr', '/users/create'])]
    #[TestWith(['hr', '/activity-logs'])]
    #[TestWith(['hr', '/settings'])]
    #[TestWith(['finance', '/hr/alphalist'])]
    #[TestWith(['finance', '/users'])]
    #[TestWith(['finance', '/activity-logs'])]
    #[TestWith(['finance', '/settings'])]
    #[TestWith(['hr', '/archives'])]
    #[TestWith(['hr', '/deleted'])]
    public function test_manual_unauthorized_urls_return_403(string $role, string $url): void
    {
        $this->signIn(User::factory()->withRole($role)->create());

        $this->get($url)->assertForbidden();
    }

    #[TestWith(['super-admin', '/hr/alphalist'])]
    #[TestWith(['super-admin', '/checks'])]
    #[TestWith(['super-admin', '/payables'])]
    #[TestWith(['super-admin', '/receivables'])]
    #[TestWith(['hr', '/hr/alphalist'])]
    #[TestWith(['hr', '/checks'])]
    #[TestWith(['hr', '/payables'])]
    #[TestWith(['hr', '/receivables'])]
    #[TestWith(['finance', '/checks'])]
    #[TestWith(['finance', '/payables'])]
    #[TestWith(['finance', '/receivables'])]
    #[TestWith(['finance', '/archives'])]
    #[TestWith(['finance', '/deleted'])]
    #[TestWith(['super-admin', '/archives'])]
    #[TestWith(['super-admin', '/deleted'])]
    public function test_authorized_module_routes_open_the_existing_interface(string $role, string $url): void
    {
        $this->signIn(User::factory()->withRole($role)->create());

        $this->get($url)->assertOk()->assertViewIs('application')->assertSee('id="root"', false);
    }

    #[TestWith(['/dashboard'])]
    #[TestWith(['/account'])]
    #[TestWith(['/users'])]
    #[TestWith(['/checks'])]
    public function test_guests_are_redirected_to_login(string $url): void
    {
        $this->get($url)->assertRedirect(route('login'));
    }

    public function test_super_admin_can_access_administration_screens(): void
    {
        $this->signIn(User::factory()->withRole('super-admin')->create());

        $this->get('/dashboard')->assertOk();
        $this->get('/users')->assertOk();
        $this->get('/users/create')->assertOk();
        $this->get('/activity-logs')->assertOk();
        $this->get('/settings')->assertOk();
    }

    public function test_hr_navigation_includes_monitoring_and_hides_administration(): void
    {
        $this->signIn(User::factory()->withRole('hr')->create());

        $this->get('/dashboard')->assertRedirect(route('modules.hr'));
        $response = $this->get('/hr/alphalist')->assertOk()->assertViewIs('application')->assertViewHas('initialPage', 'employees');
        $this->assertSame(['dashboard', 'hr', 'checks', 'payables', 'receivables', 'account'], $response->viewData('session')['user']['permissions']);
    }

    public function test_finance_navigation_hides_hr_and_administration(): void
    {
        $this->signIn(User::factory()->withRole('finance')->create());

        $response = $this->get('/dashboard')->assertOk()->assertViewIs('application');
        $this->assertSame(['dashboard', 'checks', 'payables', 'receivables', 'account'], $response->viewData('session')['user']['permissions']);
    }

    public function test_finance_record_pages_follow_monitoring_permissions_without_granting_administration(): void
    {
        $role = Role::where('slug', 'finance')->firstOrFail();
        $role->permissions()->sync(Permission::whereIn('slug', ['dashboard', 'account'])->pluck('id'));
        $this->signIn(User::factory()->withRole('finance')->create());
        $this->get('/archives')->assertForbidden();
        $this->get('/deleted')->assertForbidden();

        $role->permissions()->attach(Permission::where('slug', 'payables')->firstOrFail()->id);
        $this->get('/archives')->assertOk()->assertViewHas('initialPage', 'archives');
        $this->get('/deleted')->assertOk()->assertViewHas('initialPage', 'deleted');
        $this->get('/users')->assertForbidden();
        $this->get('/hr/alphalist')->assertForbidden();
        $this->getJson('/business-state')->assertOk()->assertJsonCount(1, 'modules')->assertJsonStructure(['modules' => ['payables']]);
    }

    public function test_permission_edits_cannot_cross_role_boundaries_even_if_database_is_modified(): void
    {
        $user = User::factory()->withRole('hr')->create();
        $user->role->permissions()->attach(Permission::where('slug', 'users')->firstOrFail()->id);

        $this->assertFalse(Gate::forUser($user)->allows('users'));
    }

    public function test_admin_can_restrict_permissions_and_reseeding_preserves_them(): void
    {
        $this->signIn(User::factory()->withRole('super-admin')->create());
        $role = Role::where('slug', 'finance')->firstOrFail();

        $this->put(route('settings.permissions', $role), ['current_password' => 'password', 'permissions' => ['checks']])
            ->assertSessionHasNoErrors()->assertRedirect();

        $finance = User::factory()->withRole('finance')->create();
        $this->assertTrue(Gate::forUser($finance)->allows('checks'));
        $this->assertFalse(Gate::forUser($finance)->allows('payables'));
        $this->assertTrue(Gate::forUser($finance)->allows('account'));
        $this->seed(RolePermissionSeeder::class);
        $this->assertFalse(Gate::forUser($finance)->allows('payables'));
        $this->assertDatabaseHas('activity_logs', ['action' => 'permissions.updated']);
    }

    public function test_permission_settings_reject_administration_and_super_admin_changes(): void
    {
        $this->signIn(User::factory()->withRole('super-admin')->create());
        $hr = Role::where('slug', 'hr')->firstOrFail();
        $admin = Role::where('slug', 'super-admin')->firstOrFail();

        $this->put(route('settings.permissions', $hr), ['current_password' => 'password', 'permissions' => ['users']])
            ->assertSessionHasErrors('permissions.0');
        $this->put(route('settings.permissions', $admin), ['current_password' => 'password'])->assertForbidden();
        $this->assertDatabaseMissing('activity_logs', ['action' => 'permissions.updated']);
    }

    public function test_admin_can_grant_all_monitoring_to_an_existing_restricted_hr_role(): void
    {
        $this->signIn(User::factory()->withRole('super-admin')->create());
        $hr = Role::where('slug', 'hr')->firstOrFail();
        $hr->permissions()->sync(Permission::whereIn('slug', ['dashboard', 'hr', 'account'])->pluck('id'));

        $this->putJson(route('settings.permissions', $hr), [
            'current_password' => 'password',
            'permissions' => ['hr', 'checks', 'payables', 'receivables'],
        ])->assertOk();
        $this->seed(RolePermissionSeeder::class);

        $this->signIn(User::factory()->withRole('hr')->create());
        foreach (['checks', 'payables', 'receivables'] as $module) {
            $this->get('/'.$module)->assertOk()->assertViewIs('application');
        }
        $this->getJson('/business-state')->assertOk()->assertJsonCount(4, 'modules');
        $this->get('/settings')->assertForbidden();
    }

    public function test_inline_settings_load_and_save_with_the_same_access_rules(): void
    {
        $this->signIn(User::factory()->withRole('super-admin')->create());
        $hr = Role::where('slug', 'hr')->firstOrFail();

        $response = $this->getJson('/settings')->assertOk()->assertJsonCount(2, 'roles');
        $hrSettings = collect($response->json('roles'))->firstWhere('id', $hr->id);
        $this->assertSame(['hr', 'checks', 'payables', 'receivables'], array_column($hrSettings['availablePermissions'], 'slug'));
        $this->assertContains('hr', $hrSettings['permissions']);

        $this->putJson(route('settings.permissions', $hr), ['current_password' => 'incorrect', 'permissions' => []])
            ->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->putJson(route('settings.permissions', $hr), ['current_password' => 'password', 'permissions' => ['users']])
            ->assertUnprocessable()->assertJsonValidationErrors('permissions.0');
        $this->putJson(route('settings.permissions', $hr), ['current_password' => 'password', 'permissions' => []])
            ->assertOk()->assertJsonPath('message', $hr->name.' permissions updated.');
        $this->assertEqualsCanonicalizing(['dashboard', 'account'], $hr->permissions()->pluck('slug')->all());

        $this->signIn(User::factory()->withRole('finance')->create());
        $this->getJson('/settings')->assertForbidden();
        $this->putJson(route('settings.permissions', $hr), ['current_password' => 'password', 'permissions' => ['hr']])
            ->assertForbidden();
    }

    public function test_users_cannot_modify_roles_through_personal_settings(): void
    {
        $user = User::factory()->withRole('hr')->create();
        $this->signIn($user);

        $this->put('/account', [
            'name' => $user->name, 'email' => $user->email, 'current_password' => 'password',
            'role_id' => Role::where('slug', 'super-admin')->firstOrFail()->id,
        ])->assertSessionHasErrors('role_id');

        $this->assertSame('hr', $user->fresh()->role->slug);
    }

    public function test_personal_settings_update_only_validated_fields(): void
    {
        $user = User::factory()->withRole('hr')->create();
        $this->signIn($user);

        $this->put('/account', [
            'name' => 'Updated Name', 'email' => $user->email, 'current_password' => 'password', 'auth_version' => 99,
        ])->assertSessionHasNoErrors();

        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'Updated Name', 'email' => $user->email, 'auth_version' => 0]);
    }

    public function test_personal_email_change_revokes_other_sessions_but_keeps_current_session(): void
    {
        $user = User::factory()->withRole('hr')->create();
        $this->signIn($user);
        $oldRememberToken = $user->remember_token;

        $this->put('/account', [
            'name' => $user->name, 'email' => 'NEW@example.com', 'current_password' => 'password',
        ])->assertSessionHasNoErrors()->assertSessionHas('auth_version', 1);

        $this->assertDatabaseHas('users', ['id' => $user->id, 'email' => 'new@example.com', 'auth_version' => 1, 'email_verified_at' => null]);
        $this->assertNotSame($oldRememberToken, $user->fresh()->remember_token);
        $this->get('/hr/alphalist')->assertOk();
    }
}
