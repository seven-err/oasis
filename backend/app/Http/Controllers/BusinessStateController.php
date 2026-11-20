<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BusinessStateController extends Controller
{
    public const KEYS = [
        'hr' => ['oasis.employees.v2'],
        'checks' => ['oasis.checks.v1', 'oasis.check-attachments.v1', 'oasis.check-activity.v1'],
        'payables' => ['oasis.payables.v1', 'oasis.payable-payments.v1', 'oasis.payable-categories.v1', 'oasis.payable-activity.v1'],
        'receivables' => ['oasis.receivables.v1', 'oasis.receivable-collections.v1', 'oasis.receivable-customers.v1', 'oasis.receivable-followups.v1', 'oasis.receivable-attachments.v1', 'oasis.receivable-activity.v1'],
    ];

    public function index(Request $request): JsonResponse
    {
        $request->validate(['versions' => ['sometimes', 'array:hr,checks,payables,receivables'], 'versions.*' => ['integer', 'min:0']]);
        $modules = array_values(array_filter(array_keys(self::KEYS), fn (string $module): bool => $request->user()->hasPermission($module)));
        $saved = DB::table('business_states')->whereIn('module', $modules)->get()->keyBy('module');
        $result = [];
        foreach ($modules as $module) {
            $row = $saved->get($module);
            $version = $row ? (int) $row->version : 0;
            if ((string) $request->input('versions.'.$module, -1) !== (string) $version) {
                $result[$module] = ['version' => $version, 'data' => $row ? json_decode($row->data, true, flags: JSON_THROW_ON_ERROR) : null];
            }
        }

        return response()->json(['modules' => (object) $result]);
    }

    public function update(Request $request, string $module): JsonResponse
    {
        abort_unless(isset(self::KEYS[$module]), 404);
        Gate::authorize($module);
        $rules = ['version' => ['required', 'integer', 'min:0'], 'data' => ['required', 'array', function (string $attribute, mixed $value, \Closure $fail) use ($module): void {
            if (is_array($value) && array_diff(array_keys($value), self::KEYS[$module])) {
                $fail('The data contains records from an unexpected module.');
            }
        }]];
        foreach (self::KEYS[$module] as $key) {
            $field = 'data.'.str_replace('.', '\\.', $key);
            $rules[$field] = ['present', 'array', 'max:10000'];
            if ($module === 'hr') {
                $rules[$field] = ['required', 'array:employees,deletedEmployees'];
                foreach (['employees', 'deletedEmployees'] as $list) {
                    $rules[$field.'.'.$list] = ['present', 'array', 'list', 'max:10000'];
                    $rules[$field.'.'.$list.'.*.id'] = ['required', 'integer', 'min:1', 'distinct'];
                }
            } else {
                $rules[$field][] = 'list';
                $rules[$field.'.*.id'] = ['required', 'regex:/^[A-Za-z0-9_-]{1,100}$/', 'distinct'];
                foreach (['checkAmount', 'totalAmount', 'totalReceivableAmount', 'amountPaid', 'amountCollected'] as $amount) {
                    $rules[$field.'.*.'.$amount] = ['sometimes', 'numeric', 'gt:0'];
                }
                if (str_contains($key, 'attachments')) {
                    $rules[$field.'.*.previewDataUrl'] = ['sometimes', 'nullable', 'regex:~^/business-files/'.$module.'/[A-Za-z0-9._-]+$~'];
                }
            }
        }
        $validated = $request->validate($rules);
        $encoded = json_encode($request->input('data'), JSON_THROW_ON_ERROR);
        if (strlen($encoded) > 6 * 1024 * 1024) {
            throw ValidationException::withMessages(['data' => 'This module exceeds the 6 MB record limit. Upload files separately.']);
        }

        return DB::transaction(function () use ($request, $module, $validated, $encoded): JsonResponse {
            if ((int) $validated['version'] === 0) {
                DB::table('business_states')->insertOrIgnore([
                    'module' => $module, 'data' => '{}', 'version' => 0, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            $row = DB::table('business_states')->where('module', $module)->lockForUpdate()->first();
            if ($row && $row->data === $encoded) {
                return response()->json(['version' => (int) $row->version]);
            }
            if (! $row || (int) $row->version !== (int) $validated['version']) {
                // shortcut: Concurrent edits in one module require reload; use record-level updates if collisions become frequent.
                return response()->json(['message' => 'Someone else updated this module. Download your unsaved copy, then reload the latest records.'], 409);
            }
            $version = (int) $row->version + 1;
            DB::table('business_states')->where('module', $module)->update([
                'data' => $encoded, 'version' => $version, 'updated_by' => $request->user()->id, 'updated_at' => now(),
            ]);
            ActivityLog::record($request->user(), 'business.saved', ucfirst($module).' records saved (version '.$version.').');

            return response()->json(['version' => $version]);
        }, 3);
    }

    public function upload(Request $request, string $module): JsonResponse
    {
        abort_unless(in_array($module, ['checks', 'receivables'], true), 404);
        Gate::authorize($module);
        $request->validate(['file' => ['required', 'file', 'max:10240']]);
        $path = $request->file('file')->store($module, 'business');
        abort_unless($path, 500);

        return response()->json(['storageKey' => $path, 'previewDataUrl' => '/business-files/'.$module.'/'.basename($path)], 201);
    }

    public function download(string $module, string $file): StreamedResponse
    {
        abort_unless(in_array($module, ['checks', 'receivables'], true), 404);
        Gate::authorize($module);
        $path = $module.'/'.$file;
        abort_unless(Storage::disk('business')->exists($path), 404);

        return Storage::disk('business')->download($path, headers: ['X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'no-store, private']);
    }
}
