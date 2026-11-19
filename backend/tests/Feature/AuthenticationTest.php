<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use LazilyRefreshDatabase;

    protected $seed = true;

    protected $seeder = RolePermissionSeeder::class;

    #[TestWith(['super-admin'])]
    #[TestWith(['hr'])]
    #[TestWith(['finance'])]
    public function test_active_user_can_log_in_with_remember_me(string $role): void
    {
        $user = User::factory()->withRole($role)->create();
        $this->get('/login')->assertOk();
        $sessionId = session()->getId();
        $this->freezeTime();

        $response = $this->post('/login', ['email' => strtoupper($user->email), 'password' => 'password', 'remember' => 1]);

        $response->assertRedirect(route('dashboard'))->assertSessionHas('auth_version', 0);
        $response->assertCookie(Auth::getRecallerName());
        $this->assertAuthenticatedAs($user);
        $this->assertNotSame($sessionId, session()->getId());
        $this->assertSame(now()->toDateTimeString(), $user->fresh()->last_login_at->toDateTimeString());
        $this->assertDatabaseHas('activity_logs', ['user_id' => $user->id, 'action' => 'auth.login']);
    }

    public function test_incorrect_password_is_rejected_without_being_flashed(): void
    {
        $user = User::factory()->withRole('hr')->create();

        $this->post('/login', ['email' => $user->email, 'password' => 'Wrong-Password1!'])
            ->assertSessionHasErrors(['email' => 'The provided credentials do not match an active account.'])
            ->assertSessionMissing('_old_input.password');

        $this->assertGuest();
        $this->assertNull($user->fresh()->last_login_at);
    }

    public function test_inactive_account_cannot_log_in(): void
    {
        $user = User::factory()->withRole('finance')->create(['is_active' => false]);

        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertSessionHasErrors('email');

        $this->assertGuest();
    }

    public function test_login_validates_email_and_password(): void
    {
        $this->post('/login', ['email' => 'not-an-email'])->assertSessionHasErrors(['email', 'password']);
        $this->assertGuest();
    }

    public function test_login_attempts_are_throttled_then_recover(): void
    {
        $user = User::factory()->withRole('hr')->create();
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->post('/login', ['email' => $user->email, 'password' => 'incorrect'])->assertSessionHasErrors('email');
        }

        $this->post('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertSessionHasErrors(['email' => 'Too many login attempts. Please try again in one minute.']);
        $this->assertGuest();

        $this->travel(61)->seconds();
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect(route('dashboard'));
    }

    public function test_first_login_blocks_all_other_pages_until_password_is_changed(): void
    {
        $user = User::factory()->withRole('super-admin')->temporaryPassword()->create();
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertRedirect(route('password.edit'));
        $this->get('/dashboard')->assertRedirect(route('password.edit'));
        $this->get('/users')->assertRedirect(route('password.edit'));
        $this->get('/account')->assertRedirect(route('password.edit'));
        $this->get('/change-password')->assertOk()->assertDontSee('User Management');
        $this->put('/account', ['name' => 'Changed'])->assertRedirect(route('password.edit'));

        $this->put('/change-password', [
            'current_password' => 'password', 'password' => 'Better-Password2026!', 'password_confirmation' => 'Better-Password2026!',
        ])->assertRedirect(route('dashboard'));

        $this->assertFalse($user->fresh()->must_change_password);
        $this->assertTrue(Hash::check('Better-Password2026!', $user->fresh()->password));
        $this->assertSame(1, $user->fresh()->auth_version);
        $this->get('/dashboard')->assertOk();
    }

    #[TestWith(['wrong-current', 'Better-Password2026!', 'Better-Password2026!', 'current_password'])]
    #[TestWith(['password', 'short', 'short', 'password'])]
    #[TestWith(['password', 'Better-Password2026!', 'Different-Password2026!', 'password'])]
    #[TestWith(['password', 'password', 'password', 'password'])]
    public function test_password_change_rejects_invalid_input(string $current, string $password, string $confirmation, string $error): void
    {
        $user = User::factory()->withRole('hr')->temporaryPassword()->create();
        $this->signIn($user);

        $this->put('/change-password', ['current_password' => $current, 'password' => $password, 'password_confirmation' => $confirmation])
            ->assertSessionHasErrors($error)->assertSessionMissing('_old_input.current_password')->assertSessionMissing('_old_input.password');

        $this->assertTrue($user->fresh()->must_change_password);
        $this->assertTrue(Hash::check('password', $user->fresh()->password));
    }

    public function test_established_user_can_change_password_and_log_out(): void
    {
        $user = User::factory()->withRole('finance')->create();
        $this->signIn($user);
        $oldToken = session()->token();

        $this->get('/account')->assertOk();
        $this->put('/change-password', [
            'current_password' => 'password', 'password' => 'Better-Password2026!', 'password_confirmation' => 'Better-Password2026!',
        ])->assertRedirect(route('dashboard'));
        $this->post('/logout')->assertRedirect(route('login'));

        $this->assertGuest();
        $this->assertNotSame($oldToken, session()->token());
        $this->assertDatabaseHas('activity_logs', ['action' => 'password.changed', 'user_id' => $user->id]);
        $this->get('/dashboard')->assertRedirect(route('login'));
    }

    #[TestWith(['is_active', false])]
    #[TestWith(['auth_version', 1])]
    public function test_existing_session_is_rejected_after_account_revocation(string $field, bool|int $value): void
    {
        $user = User::factory()->withRole('finance')->create();
        $this->signIn($user);
        $user->forceFill([$field => $value])->save();

        $this->get('/dashboard')->assertRedirect(route('login'));

        $this->assertGuest();
    }

    public function test_registration_is_not_available(): void
    {
        $this->get('/register')->assertNotFound();
        $this->post('/register', ['name' => 'Intruder'])->assertNotFound();
        $this->get('/login')->assertOk()->assertDontSee('Register');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_login_and_authenticated_responses_are_not_cacheable(): void
    {
        $this->get('/login')->assertHeader('Cache-Control', 'no-store, private');
        $user = User::factory()->withRole('hr')->create();
        $this->signIn($user);

        $this->get('/dashboard')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_remembered_login_receives_session_version(): void
    {
        $user = User::factory()->withRole('hr')->create(['remember_token' => 'valid-remember-token']);
        $cookie = $user->id.'|'.$user->remember_token.'|'.$user->password;

        $this->withCookie(Auth::getRecallerName(), $cookie)->get('/dashboard')
            ->assertOk()->assertSessionHas('auth_version', 0);

        $this->assertAuthenticatedAs($user);
    }

    public function test_revoked_remember_cookie_cannot_restore_access(): void
    {
        $user = User::factory()->withRole('hr')->create(['remember_token' => 'old-token']);
        $cookie = $user->id.'|'.$user->remember_token.'|'.$user->password;
        $user->revokeSessions();

        $this->withCookie(Auth::getRecallerName(), $cookie)->get('/dashboard')->assertRedirect(route('login'));

        $this->assertGuest();
    }

    public function test_login_requires_csrf_token_outside_the_test_environment(): void
    {
        $this->app->instance('env', 'local');

        $this->post('/login', ['email' => 'user@example.com', 'password' => 'password'])->assertStatus(419);

        $this->assertGuest();
    }

    public function test_production_rejects_insecure_credential_transport(): void
    {
        $this->app->instance('env', 'production');

        $this->get('http://localhost/login')->assertForbidden();
        $this->get('https://localhost/login')->assertOk();
    }

    public function test_password_change_stops_if_session_is_revoked_after_initial_validation(): void
    {
        $user = User::factory()->withRole('hr')->temporaryPassword()->create();
        $this->signIn($user);
        $revoked = false;
        Event::listen(TransactionBeginning::class, function () use ($user, &$revoked) {
            if (! $revoked) {
                $revoked = true;
                User::whereKey($user->id)->update(['auth_version' => 1]);
            }
        });

        $this->put('/change-password', [
            'current_password' => 'password', 'password' => 'Better-Password2026!', 'password_confirmation' => 'Better-Password2026!',
        ])->assertSessionHasErrors(['current_password' => 'Your credentials changed. Please sign in again.']);

        $this->assertTrue(Hash::check('password', $user->fresh()->password));
        $this->assertTrue($user->fresh()->must_change_password);
    }

    #[TestWith(["Good-Password2026!\0hidden", 'The password cannot contain null characters.'])]
    #[TestWith(['Aa1!aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'The password must not exceed 72 bytes with the configured password hashing.'])]
    #[TestWith(['Aa1!😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀', 'The password must not exceed 72 bytes with the configured password hashing.'])]
    public function test_password_change_rejects_values_the_hasher_cannot_safely_store(string $password, string $message): void
    {
        $user = User::factory()->withRole('hr')->temporaryPassword()->create();
        $this->signIn($user);

        $this->put('/change-password', [
            'current_password' => 'password', 'password' => $password, 'password_confirmation' => $password,
        ])->assertSessionHasErrors(['password' => $message]);

        $this->assertTrue($user->fresh()->must_change_password);
        $this->assertTrue(Hash::check('password', $user->fresh()->password));
    }
}
