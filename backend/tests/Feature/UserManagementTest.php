<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SuperAdminSeeder;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\TestWith;
use RuntimeException;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use LazilyRefreshDatabase;

    protected $seed = true;

    protected $seeder = RolePermissionSeeder::class;

    private function payload(User $user, array $changes = []): array
    {
        return array_merge([
            'name' => $user->name, 'email' => $user->email, 'role_id' => $user->role_id,
            'is_active' => (int) $user->is_active, 'current_password' => 'password',
        ], $changes);
    }

    public function test_admin_creates_account_with_hashed_temporary_password_shown_once(): void
    {
        $admin = User::factory()->withRole('super-admin')->create();
        $this->signIn($admin);

        $response = $this->post('/users', [
            'name' => 'New HR', 'email' => 'NEWHR@example.com',
            'role_id' => Role::where('slug', 'hr')->firstOrFail()->id,
            'is_active' => 1, 'current_password' => 'password',
        ]);

        $response->assertOk()->assertViewIs('users.credentials')->assertHeader('Cache-Control', 'no-store, private');
        $temporary = $response->viewData('temporaryPassword');
        $user = User::where('email', 'newhr@example.com')->firstOrFail();
        $this->assertTrue(Hash::check($temporary, $user->password));
        $this->assertTrue($user->must_change_password);
        $this->assertSame('hr', $user->role->slug);
        $this->assertStringNotContainsString($temporary, json_encode(session()->all()));
        $this->assertStringNotContainsString($temporary, ActivityLog::all()->toJson());
        $this->get(route('users.show', $user))->assertOk()->assertDontSee($temporary);
        $this->assertDatabaseHas('activity_logs', ['action' => 'user.created', 'user_id' => $admin->id]);
    }

    #[TestWith(['hr'])]
    #[TestWith(['finance'])]
    public function test_non_admins_cannot_write_user_accounts(string $role): void
    {
        $user = User::factory()->withRole($role)->create();
        $target = User::factory()->withRole('finance')->create();
        $this->signIn($user);

        $this->post('/users', $this->payload($target, ['email' => 'intruder@example.com']))->assertForbidden();
        $this->put(route('users.update', $target), $this->payload($target, ['name' => 'Hacked']))->assertForbidden();
        $this->post(route('users.reset-password', $target), ['current_password' => 'password', 'confirmation' => 'RESET'])->assertForbidden();
        $this->get(route('users.show', $target))->assertForbidden();
        $this->get(route('users.edit', $target))->assertForbidden();

        $this->assertSame($target->name, $target->fresh()->name);
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('activity_logs', 0);
    }

    public function test_admin_can_edit_role_deactivate_and_reactivate_account(): void
    {
        $admin = User::factory()->withRole('super-admin')->create();
        $target = User::factory()->withRole('hr')->create();
        $this->signIn($admin);

        $this->put(route('users.update', $target), $this->payload($target, [
            'name' => 'Updated Finance', 'role_id' => Role::where('slug', 'finance')->firstOrFail()->id,
            'is_active' => 0, 'confirmation' => 'DEACTIVATE',
        ]))->assertRedirect(route('users.show', $target));

        $target->refresh();
        $this->assertSame('finance', $target->role->slug);
        $this->assertFalse($target->is_active);
        $this->assertSame(1, $target->auth_version);

        $this->put(route('users.update', $target), $this->payload($target, ['is_active' => 1]))->assertSessionHasNoErrors();
        $this->assertTrue($target->fresh()->is_active);
    }

    public function test_admin_cannot_change_own_role(): void
    {
        $admin = User::factory()->withRole('super-admin')->create();
        $this->signIn($admin);

        $this->put(route('users.update', $admin), $this->payload($admin, [
            'role_id' => Role::where('slug', 'finance')->firstOrFail()->id,
        ]))->assertSessionHasErrors(['role_id' => 'You cannot change your own role.']);

        $this->assertSame('super-admin', $admin->fresh()->role->slug);
    }

    public function test_last_active_admin_cannot_be_deactivated(): void
    {
        $admin = User::factory()->withRole('super-admin')->create();
        User::factory()->withRole('super-admin')->create(['is_active' => false]);
        $this->signIn($admin);

        $this->put(route('users.update', $admin), $this->payload($admin, ['is_active' => 0, 'confirmation' => 'DEACTIVATE']))
            ->assertSessionHasErrors(['is_active' => 'The last active Super Admin cannot be deactivated or demoted.']);

        $this->assertTrue($admin->fresh()->is_active);
    }

    public function test_sensitive_administration_requires_password_and_explicit_confirmation(): void
    {
        $this->signIn(User::factory()->withRole('super-admin')->create());
        $target = User::factory()->withRole('finance')->create();

        $this->put(route('users.update', $target), $this->payload($target, ['current_password' => 'wrong']))
            ->assertSessionHasErrors('current_password');
        $this->put(route('users.update', $target), $this->payload($target, ['is_active' => 0]))
            ->assertSessionHasErrors('confirmation');
        $this->post(route('users.reset-password', $target), ['current_password' => 'password'])
            ->assertSessionHasErrors('confirmation');

        $this->assertTrue($target->fresh()->is_active);
        $this->assertSame(0, $target->fresh()->auth_version);
    }

    public function test_confirmation_errors_explain_exactly_what_to_type(): void
    {
        $this->signIn(User::factory()->withRole('super-admin')->create());
        $target = User::factory()->withRole('finance')->create();

        $this->postJson(route('users.reset-password', $target), ['current_password' => 'password', 'confirmation' => 'wrong'])
            ->assertUnprocessable()->assertJsonPath('errors.confirmation.0', 'Type RESET exactly to confirm.');
        $this->putJson(route('users.update', $target), $this->payload($target, ['is_active' => 0, 'confirmation' => 'wrong']))
            ->assertUnprocessable()->assertJsonPath('errors.confirmation.0', 'Type DEACTIVATE exactly to confirm.');
    }

    public function test_admin_can_demote_another_admin_when_one_active_admin_remains(): void
    {
        $admin = User::factory()->withRole('super-admin')->create();
        $target = User::factory()->withRole('super-admin')->create();
        $this->signIn($admin);

        $this->put(route('users.update', $target), $this->payload($target, [
            'role_id' => Role::where('slug', 'hr')->firstOrFail()->id,
        ]))->assertSessionHasNoErrors();

        $this->assertSame('hr', $target->fresh()->role->slug);
        $this->assertSame('super-admin', $admin->fresh()->role->slug);
        $this->assertTrue($admin->fresh()->is_active);
    }

    public function test_password_reset_revokes_database_sessions_and_remember_token(): void
    {
        config(['session.driver' => 'database']);
        $admin = User::factory()->withRole('super-admin')->create();
        $this->post('/login', ['email' => $admin->email, 'password' => 'password'])->assertRedirect(route('dashboard'));
        $target = User::factory()->withRole('finance')->create();
        $oldToken = $target->remember_token;
        DB::table('sessions')->insert(['id' => 'target-session', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);

        $response = $this->post(route('users.reset-password', $target), ['current_password' => 'password', 'confirmation' => 'RESET']);

        $response->assertOk()->assertViewIs('users.credentials');
        $target->refresh();
        $this->assertTrue($target->must_change_password);
        $this->assertTrue(Hash::check($response->viewData('temporaryPassword'), $target->password));
        $this->assertSame(1, $target->auth_version);
        $this->assertNotSame($oldToken, $target->remember_token);
        $this->assertDatabaseMissing('sessions', ['id' => 'target-session']);
        $this->assertDatabaseHas('activity_logs', ['action' => 'user.password_reset']);
    }

    public function test_account_creation_rejects_duplicate_email_and_protected_fields(): void
    {
        $admin = User::factory()->withRole('super-admin')->create();
        $this->signIn($admin);

        $this->post('/users', $this->payload($admin, ['email' => strtoupper($admin->email)]))->assertSessionHasErrors('email');
        $this->post('/users', $this->payload($admin, ['email' => 'new@example.com', 'must_change_password' => false, 'password' => 'Injected']))
            ->assertSessionHasErrors(['password', 'must_change_password']);
        $this->post('/users', [])->assertSessionHasErrors(['name', 'email', 'role_id', 'is_active', 'current_password']);

        $this->assertDatabaseCount('users', 1);
    }

    public function test_user_list_search_filters_and_output_escaping(): void
    {
        $admin = User::factory()->withRole('super-admin')->create();
        $target = User::factory()->withRole('hr')->create(['name' => '<script>alert(1)</script>', 'email' => 'match@example.com']);
        User::factory()->withRole('finance')->create(['name' => 'Excluded User', 'is_active' => false]);
        $this->signIn($admin);

        $this->getJson('/users?search=match&role=hr&status=active')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', $target->name)
            ->assertJsonPath('data.0.email', 'match@example.com')->assertDontSee('Excluded User');
        $this->get(route('users.show', $target))->assertOk()->assertDontSee('<script>alert(1)</script>', false);
        $this->get('/users?role=invalid&status=unknown')->assertSessionHasErrors(['role', 'status']);
        $this->get('/users?search=%27%20OR%201%3D1--')->assertOk()->assertDontSee('Excluded User');
    }

    public function test_user_list_search_accepts_zero(): void
    {
        $admin = User::factory()->withRole('super-admin')->create(['name' => 'Admin', 'email' => 'admin@example.com']);
        $target = User::factory()->withRole('hr')->create(['name' => 'User 0', 'email' => 'zero@example.com']);
        $this->signIn($admin);

        $this->getJson('/users?search=0')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $target->id);
    }

    public function test_user_list_sorts_all_matching_accounts_by_name(): void
    {
        $admin = User::factory()->withRole('super-admin')->create(['name' => 'Middle']);
        $first = User::factory()->withRole('hr')->create(['name' => 'Alpha']);
        $last = User::factory()->withRole('hr')->create(['name' => 'Zulu']);
        $this->signIn($admin);

        $this->getJson('/users')->assertOk()->assertJsonPath('data.0.id', $first->id);
        $this->getJson('/users?sort=desc')->assertOk()->assertJsonPath('data.0.id', $last->id);
        $this->getJson('/users?sort=invalid')->assertUnprocessable()->assertJsonValidationErrors('sort');
    }

    public function test_account_report_returns_all_filtered_accounts_without_sensitive_fields(): void
    {
        $admin = User::factory()->withRole('super-admin')->create();
        User::factory()->count(25)->withRole('hr')->create(['name' => 'Report Match', 'last_login_at' => '2026-01-02 03:04:05']);
        User::factory()->withRole('hr')->create(['name' => 'Report Match', 'is_active' => false]);
        User::factory()->withRole('finance')->create(['name' => 'Report Match']);
        $this->signIn($admin);

        $response = $this->getJson('/users/report?search=Report%20Match&role=hr&status=active&sort=desc')
            ->assertOk()->assertJsonCount(25, 'data')
            ->assertJsonPath('data.0.role', 'HR')->assertJsonPath('data.0.status', 'Active')
            ->assertJsonPath('data.0.last_login_at', '2026-01-02T03:04:05.000000Z');
        $this->assertSame(['name', 'email', 'role', 'status', 'last_login_at'], array_keys($response->json('data.0')));
        $response->assertJsonMissingPath('data.0.password')->assertJsonMissingPath('data.0.remember_token')
            ->assertJsonMissingPath('data.0.auth_version');

        $this->signIn(User::factory()->withRole('finance')->create());
        $this->getJson('/users/report')->assertForbidden();
    }

    public function test_user_pages_share_the_monitoring_application_shell(): void
    {
        $admin = User::factory()->withRole('super-admin')->create();
        $target = User::factory()->withRole('finance')->create();
        $this->signIn($admin);

        foreach (['/users', '/users/create', '/users/'.$target->id, '/users/'.$target->id.'/edit'] as $url) {
            $this->get($url)->assertOk()->assertViewIs('application')->assertViewHas('initialPage', 'users')
                ->assertSee('id="root"', false)->assertDontSee('class="sidebar"', false);
        }
        $this->getJson('/users/create')->assertOk()->assertJsonCount(3, 'roles');
        $this->getJson('/users/'.$target->id.'/edit')->assertOk()->assertJsonPath('user.id', $target->id)
            ->assertJsonCount(3, 'roles')->assertJsonMissingPath('user.password')->assertJsonMissingPath('user.auth_version');
        $this->getJson('/users/'.$target->id)->assertOk()->assertJsonPath('user.email', $target->email)
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_json_account_actions_keep_validation_and_one_time_credentials(): void
    {
        $admin = User::factory()->withRole('super-admin')->create();
        $this->signIn($admin);

        $this->postJson('/users', $this->payload($admin, ['email' => 'new@example.com', 'current_password' => 'wrong']))
            ->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $created = $this->postJson('/users', $this->payload($admin, ['email' => 'new@example.com']))
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonMissingPath('user.password');
        $target = User::findOrFail($created->json('user.id'));
        $this->assertTrue(Hash::check($created->json('temporaryPassword'), $target->password));
        $this->putJson('/users/'.$target->id, $this->payload($target, ['name' => 'Updated user']))
            ->assertOk()->assertJsonPath('message', 'Account updated.');
        $reset = $this->postJson('/users/'.$target->id.'/reset-password', ['confirmation' => 'RESET', 'current_password' => 'password'])
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonMissingPath('user.password');
        $this->assertTrue(Hash::check($reset->json('temporaryPassword'), $target->fresh()->password));
        $this->getJson('/users/'.$target->id)->assertOk()->assertDontSee($reset->json('temporaryPassword'));
        $this->assertStringNotContainsString($reset->json('temporaryPassword'), json_encode(session()->all()));
        $this->assertStringNotContainsString($reset->json('temporaryPassword'), ActivityLog::all()->toJson());
    }

    public function test_initial_admin_seeder_is_idempotent_and_never_resets_password(): void
    {
        config(['oasis.initial_admin' => ['name' => 'Initial Admin', 'email' => 'admin@example.com', 'password' => 'Initial-Password2026!']]);

        $this->seed(SuperAdminSeeder::class);
        $first = User::where('email', 'admin@example.com')->firstOrFail();
        $hash = $first->password;
        $this->seed(SuperAdminSeeder::class);

        $this->assertDatabaseCount('users', 1);
        $this->assertSame($hash, $first->fresh()->password);
        $this->assertSame('super-admin', $first->role->slug);
        $this->assertTrue($first->must_change_password);
        $this->assertTrue(Hash::check('Initial-Password2026!', $first->password));
        $this->assertDatabaseCount('activity_logs', 1);
    }

    public function test_default_seeding_does_not_create_known_test_credentials(): void
    {
        config(['oasis.initial_admin' => ['name' => null, 'email' => null, 'password' => null]]);

        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('roles', 3);
    }

    public function test_initial_seeder_refuses_to_promote_an_existing_account(): void
    {
        $user = User::factory()->withRole('hr')->create();
        config(['oasis.initial_admin' => ['name' => 'Admin', 'email' => $user->email, 'password' => 'Initial-Password2026!']]);

        try {
            $this->seed(SuperAdminSeeder::class);
            $this->fail('Expected a collision to stop initial administrator setup.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('no privileges were changed', $exception->getMessage());
        }

        $this->assertSame('hr', $user->fresh()->role->slug);
    }
}
