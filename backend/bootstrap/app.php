<?php

use App\Http\Middleware\EnsureAccountAccess;
use App\Http\Middleware\PreventPageCaching;
use Illuminate\Auth\Middleware\Authorize;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // The office tunnel connects through loopback; remote proxy headers stay untrusted.
        $middleware->trustProxies(at: ['127.0.0.1', '::1']);
        $middleware->alias([
            'account.access' => EnsureAccountAccess::class,
            'private.pages' => PreventPageCaching::class,
        ]);
        $middleware->prependToPriorityList(
            Authorize::class,
            EnsureAccountAccess::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->dontFlash(['current_password', 'password', 'password_confirmation', 'temporary_password']);
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
