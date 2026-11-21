<?php

namespace App\Http\Controllers;

use App\Models\Role;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ApplicationController extends Controller
{
    public function dashboard(Request $request): View|RedirectResponse
    {
        if ($request->user()->role->slug === 'hr' && $request->user()->can('hr')) {
            return redirect()->route('modules.hr');
        }

        return $this->show($request);
    }

    public function show(Request $request, ?string $page = null): View
    {
        Gate::authorize($page === 'users' ? 'users' : ($request->route()->defaults['permission'] ?? 'dashboard'));

        return view('application', [
            'session' => $this->sessionData($request),
            'initialPage' => $page ?? $request->route()->defaults['page'] ?? 'dashboard',
        ]);
    }

    public function session(Request $request): JsonResponse
    {
        return response()->json($this->sessionData($request));
    }

    public function editPassword(Request $request): View
    {
        if ($request->user()->must_change_password) {
            return view('account.password');
        }

        return view('application', [
            'session' => $this->sessionData($request),
            'initialPage' => 'password',
        ]);
    }

    private function sessionData(Request $request): array
    {
        $user = $request->user();

        return [
            'csrfToken' => csrf_token(),
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role->slug,
                'roleName' => $user->role->name,
                'mustChangePassword' => $user->must_change_password,
                'permissions' => array_values(array_filter(
                    array_keys(Role::PERMISSIONS),
                    fn (string $permission) => $user->hasPermission($permission),
                )),
            ],
        ];
    }

    public function asset(string $file): BinaryFileResponse
    {
        $root = realpath(base_path('../frontend/dist'));
        $path = $root ? realpath($root.DIRECTORY_SEPARATOR.$file) : false;
        abort_unless($root && $path && str_starts_with($path, $root.DIRECTORY_SEPARATOR) && is_file($path), 404);
        $headers = match (pathinfo($path, PATHINFO_EXTENSION)) {
            'js' => ['Content-Type' => 'application/javascript'],
            'css' => ['Content-Type' => 'text/css'],
            default => [],
        };

        return response()->file($path, $headers);
    }
}
