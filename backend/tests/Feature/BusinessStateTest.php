<?php

namespace Tests\Feature;

use App\Http\Controllers\BusinessStateController;
use App\Models\Permission;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BusinessStateTest extends TestCase
{
    use LazilyRefreshDatabase;

    protected $seed = true;

    protected $seeder = RolePermissionSeeder::class;

    private function checks(array $records = []): array
    {
        return ['oasis.checks.v1' => $records, 'oasis.check-attachments.v1' => [], 'oasis.check-activity.v1' => []];
    }

    public function test_business_state_requires_an_active_authenticated_account(): void
    {
        $this->getJson('/business-state')->assertUnauthorized();
        $this->putJson('/business-state/checks', [])->assertUnauthorized();
        $user = User::factory()->withRole('finance')->temporaryPassword()->create();
        $this->signIn($user)->getJson('/business-state')->assertRedirect(route('password.edit'));
        $user->forceFill(['is_active' => false])->save();
        $this->getJson('/business-state')->assertUnauthorized();
    }

    public function test_departments_can_only_read_and_write_their_permitted_modules(): void
    {
        $hr = User::factory()->withRole('hr')->create();
        $hr->role->permissions()->sync(Permission::whereIn('slug', ['dashboard', 'hr', 'account'])->pluck('id'));
        $this->signIn($hr);
        $this->getJson('/business-state')->assertOk()->assertJsonCount(1, 'modules')->assertJsonPath('modules.hr.version', 0);
        $this->putJson('/business-state/checks', ['version' => 0, 'data' => $this->checks()])->assertForbidden();
        $this->signIn(User::factory()->withRole('finance')->create());
        $this->getJson('/business-state')->assertOk()->assertJsonCount(3, 'modules')->assertJsonMissingPath('modules.hr');
        $this->putJson('/business-state/hr', [])->assertForbidden();
        $this->putJson('/business-state/users', [])->assertNotFound();
    }

    public function test_local_and_public_hosts_share_records_and_record_the_real_actor(): void
    {
        $user = User::factory()->withRole('finance')->create();
        $this->signIn($user)->withHeader('Host', '127.0.0.1:5173');
        $data = $this->checks([['id' => 42, 'checkNumber' => 'SYNC-42', 'checkAmount' => 1250]]);
        $this->putJson('/business-state/checks', ['version' => 0, 'data' => $data])->assertOk()->assertJsonPath('version', 1);
        $response = $this->withHeader('Host', 'office.ngrok-free.dev')->getJson('/business-state')->assertOk();
        $this->assertSame('SYNC-42', $response->json('modules.checks.data')['oasis.checks.v1'][0]['checkNumber']);
        $this->assertDatabaseHas('activity_logs', ['user_id' => $user->id, 'action' => 'business.saved']);
        $this->assertDatabaseHas('business_states', ['module' => 'checks', 'version' => 1, 'updated_by' => $user->id]);
    }

    public function test_stale_browser_cannot_overwrite_newer_records(): void
    {
        $this->signIn(User::factory()->withRole('finance')->create());
        $first = $this->checks([['id' => 1, 'checkNumber' => 'KEEP-ME']]);
        $this->putJson('/business-state/checks', ['version' => 0, 'data' => $first])->assertOk();
        $this->putJson('/business-state/checks', ['version' => 0, 'data' => $this->checks()])->assertConflict();
        $this->assertSame('KEEP-ME', $this->getJson('/business-state')->json('modules.checks.data')['oasis.checks.v1'][0]['checkNumber']);
        $this->getJson('/business-state?versions[checks]=1')->assertJsonMissingPath('modules.checks');
        $this->putJson('/business-state/checks', ['version' => 1, 'data' => $this->checks()])->assertOk()->assertJsonPath('version', 2);
    }

    public function test_invalid_or_cross_module_payloads_do_not_change_saved_data(): void
    {
        $this->signIn(User::factory()->withRole('finance')->create());
        foreach ([
            ['version' => -1, 'data' => $this->checks()],
            ['version' => 0, 'data' => ['oasis.checks.v1' => []]],
            ['version' => 0, 'data' => $this->checks([['id' => 1], ['id' => 1]])],
            ['version' => 0, 'data' => [...$this->checks(), 'oasis.employees.v2' => []]],
            ['version' => 0, 'data' => $this->checks([['id' => 1, 'checkAmount' => -5]])],
            ['version' => 0, 'data' => [...$this->checks(), 'oasis.check-attachments.v1' => [['id' => 'att_1', 'previewDataUrl' => 'https://example.test/tracker']]]],
        ] as $invalid) {
            $this->putJson('/business-state/checks', $invalid)->assertUnprocessable();
        }
        $this->assertDatabaseCount('business_states', 0);
    }

    public function test_repeated_acknowledged_save_is_idempotent_and_invalid_versions_do_not_create_rows(): void
    {
        $this->signIn(User::factory()->withRole('finance')->create());
        $this->putJson('/business-state/checks', ['version' => 9, 'data' => $this->checks()])->assertConflict();
        $this->assertDatabaseCount('business_states', 0);
        $payload = ['version' => 0, 'data' => $this->checks([['id' => 1, 'checkAmount' => 100]])];
        $this->putJson('/business-state/checks', $payload)->assertOk()->assertJsonPath('version', 1);
        $this->putJson('/business-state/checks', $payload)->assertOk()->assertJsonPath('version', 1);
        $this->assertDatabaseCount('activity_logs', 1);
        $this->getJson('/business-state?versions[checks][]=1')->assertUnprocessable();
    }

    public function test_payments_and_collections_are_shared_with_their_parent_records(): void
    {
        $this->signIn(User::factory()->withRole('finance')->create());
        $payables = array_fill_keys(BusinessStateController::KEYS['payables'], []);
        $payables['oasis.payables.v1'] = [['id' => 10, 'invoiceNumber' => 'INV-10', 'totalAmount' => 500]];
        $payables['oasis.payable-payments.v1'] = [['id' => 'pay_10', 'payableId' => 10, 'amountPaid' => 200]];
        $this->putJson('/business-state/payables', ['version' => 0, 'data' => $payables])->assertOk();
        $receivables = array_fill_keys(BusinessStateController::KEYS['receivables'], []);
        $receivables['oasis.receivables.v1'] = [['id' => 20, 'invoiceNumber' => 'INV-20', 'totalReceivableAmount' => 800]];
        $receivables['oasis.receivable-collections.v1'] = [['id' => 'col_20', 'receivableId' => 20, 'amountCollected' => 300]];
        $this->putJson('/business-state/receivables', ['version' => 0, 'data' => $receivables])->assertOk();
        $shared = $this->getJson('/business-state')->assertOk()->json('modules');
        $this->assertSame($payables, $shared['payables']['data']);
        $this->assertSame($receivables, $shared['receivables']['data']);
    }

    public function test_hr_active_and_deleted_records_are_saved_together_and_keys_match_the_client(): void
    {
        $keys = json_decode(file_get_contents(base_path('../frontend/src/businessKeys.json')), true);
        $this->assertSame(BusinessStateController::KEYS, $keys);
        $this->signIn(User::factory()->withRole('hr')->create());
        $directory = ['employees' => [['id' => 1, 'name' => 'Employee']], 'deletedEmployees' => [['id' => 2, 'name' => 'Deleted']]];
        $this->putJson('/business-state/hr', ['version' => 0, 'data' => ['oasis.employees.v2' => $directory]])->assertOk();
        $this->assertSame($directory, $this->getJson('/business-state')->json('modules.hr.data')['oasis.employees.v2']);
    }

    public function test_shared_attachments_are_private_and_downloadable_by_the_correct_department(): void
    {
        $sharedDisk = Storage::fake('business');
        $this->signIn(User::factory()->withRole('finance')->create());
        $uploaded = $this->post('/business-files/checks', ['file' => UploadedFile::fake()->create('receipt.pdf', 10, 'application/pdf')])
            ->assertCreated()->json();
        Storage::disk('business')->assertExists($uploaded['storageKey']);
        config(['filesystems.disks.business.root' => $sharedDisk->path('')]);
        Storage::forgetDisk('business');
        $this->get($uploaded['previewDataUrl'])->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $hr = User::factory()->withRole('hr')->create();
        $this->signIn($hr);
        $this->get($uploaded['previewDataUrl'])->assertOk();
        $hr->role->permissions()->detach(Permission::where('slug', 'checks')->firstOrFail()->id);
        $this->get($uploaded['previewDataUrl'])->assertForbidden();
        $this->post('/business-files/checks', ['file' => UploadedFile::fake()->create('file.pdf')])->assertForbidden();
        $this->signIn(User::factory()->withRole('finance')->create());
        $this->get('/business-files/receivables/'.basename($uploaded['storageKey']))->assertNotFound();
        $this->post('/business-files/checks', ['file' => UploadedFile::fake()->create('huge.pdf', 10241)])->assertSessionHasErrors('file');
    }
}
