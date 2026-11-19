<?php

use App\Http\Controllers\AccountController;
use App\Http\Controllers\AuthController;
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
        Route::get('/dashboard', [SystemController::class, 'dashboard'])->middleware('can:dashboard')->name('dashboard');
        Route::get('/account', [AccountController::class, 'edit'])->middleware('can:account')->name('account.edit');
        Route::put('/account', [AccountController::class, 'update'])->middleware(['can:account', 'throttle:6,1'])->name('account.update');

        foreach (['hr' => '/hr/alphalist', 'checks' => '/checks', 'payables' => '/payables', 'receivables' => '/receivables'] as $permission => $uri) {
            Route::get($uri, [SystemController::class, 'module'])
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
