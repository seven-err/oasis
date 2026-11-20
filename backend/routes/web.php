<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\ApplicationController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BusinessStateController;
use App\Http\Controllers\SystemController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::middleware('private.pages')->group(function () {
    Route::get('/', fn () => redirect()->route(auth()->check() ? 'dashboard' : 'login'));
    Route::middleware('guest')->group(function () {
        Route::get('/login', [AuthController::class, 'create'])->name('login');
        Route::post('/login', [AuthController::class, 'store'])->name('login.store');
    });
    Route::middleware(['auth', 'account.access'])->group(function () {
        Route::post('/logout', [AuthController::class, 'destroy'])->name('logout');
        Route::get('/change-password', [AccountController::class, 'editPassword'])->name('password.edit');
        Route::put('/change-password', [AccountController::class, 'updatePassword'])->middleware('throttle:6,1')->name('password.update');
        Route::get('/auth/session', [ApplicationController::class, 'session'])->name('auth.session');
        Route::get('/business-state', [BusinessStateController::class, 'index']);
        Route::put('/business-state/{module}', [BusinessStateController::class, 'update'])->middleware('throttle:120,1');
        Route::post('/business-files/{module}', [BusinessStateController::class, 'upload'])->middleware('throttle:30,1');
        Route::get('/business-files/{module}/{file}', [BusinessStateController::class, 'download'])->where('file', '[A-Za-z0-9._-]+');
        Route::get('/dashboard', [ApplicationController::class, 'show'])->middleware('can:dashboard')->name('dashboard');
        Route::get('/oasis/{file}', [ApplicationController::class, 'asset'])
            ->where('file', '(assets/[A-Za-z0-9._/-]+|favicon\.png)')->name('application.asset');
        foreach (['profile' => 'account', 'team' => 'users', 'activity' => 'activity', 'archives' => 'users', 'deleted' => 'users', 'reports' => 'users'] as $page => $permission) {
            Route::get('/'.$page, [ApplicationController::class, 'show'])
                ->defaults('page', $page === 'team' ? 'users' : $page)
                ->defaults('permission', $permission)->middleware('can:'.$permission);
        }
        Route::get('/account', [AccountController::class, 'edit'])->middleware('can:account')->name('account.edit');
        Route::put('/account', [AccountController::class, 'update'])->middleware(['can:account', 'throttle:6,1'])->name('account.update');

        foreach (['hr' => '/hr/alphalist', 'checks' => '/checks', 'payables' => '/payables', 'receivables' => '/receivables'] as $permission => $uri) {
            Route::get($uri, [ApplicationController::class, 'show'])
                ->defaults('page', $permission === 'hr' ? 'employees' : $permission)
                ->defaults('permission', $permission)->middleware('can:'.$permission)->name('modules.'.$permission);
        }

        Route::middleware('can:users')->group(function () {
            Route::resource('users', UserController::class)->except('destroy');
            Route::post('/users/{user}/reset-password', [UserController::class, 'resetPassword'])
                ->middleware('throttle:6,1')->name('users.reset-password');
        });
        Route::get('/activity-logs', [SystemController::class, 'activity'])->middleware('can:activity')->name('activity.index');
        Route::get('/settings', [SystemController::class, 'settings'])->middleware('can:settings')->name('settings.edit');
        Route::put('/settings/roles/{role}', [SystemController::class, 'updatePermissions'])
            ->middleware(['can:settings', 'throttle:6,1'])->name('settings.permissions');
    });
});
