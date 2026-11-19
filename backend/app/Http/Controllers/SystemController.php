<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class SystemController extends Controller
{
    public function dashboard(): View
    {
        Gate::authorize('dashboard');

        return view('dashboard');
    }

    public function module(Request $request): Response
    {
        $permission = $request->route()->defaults['permission'];
        Gate::authorize($permission);

        return response()->view('module-unavailable', ['title' => Role::PERMISSIONS[$permission]], 501);
    }

    public function activity(Request $request): View
    {
        Gate::authorize('activity');

        return view('system.activity', [
            'logs' => ActivityLog::with('user')->orderByDesc('id')->paginate(30),
        ]);
    }

    public function settings(): View
    {
        Gate::authorize('settings');

        return view('system.settings', ['roles' => Role::with('permissions')->whereIn('slug', ['hr', 'finance'])->get()]);
    }

    public function updatePermissions(Request $request, Role $role): RedirectResponse
    {
        Gate::authorize('settings');
        abort_unless(in_array($role->slug, ['hr', 'finance'], true), 403);
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::in(array_diff(Role::ACCESS[$role->slug], ['dashboard', 'account']))],
        ]);
        DB::transaction(function () use ($request, $role, $data) {
            Role::where('slug', 'super-admin')->lockForUpdate()->firstOrFail();
            Gate::forUser($request->user()->fresh())->authorize('settings');
            $permissions = array_merge(['dashboard', 'account'], $data['permissions'] ?? []);
            $role->permissions()->sync(Permission::whereIn('slug', $permissions)->pluck('id'));
            ActivityLog::record($request->user(), 'permissions.updated', "Updated {$role->slug} permissions: ".implode(', ', $permissions).'.');
        });

        return back()->with('status', 'Role permissions updated.');
    }
}
