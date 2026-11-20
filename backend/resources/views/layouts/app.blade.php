<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'OASIS') · OASIS</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
@auth
    <div class="app-shell">
        <aside class="sidebar">
            <a class="brand" href="{{ route('dashboard') }}">OASIS <span>Office Management System</span></a>
            <button class="button secondary menu-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="main-navigation">Menu</button>
            <nav id="main-navigation" aria-label="Main navigation">
                @unless(auth()->user()->must_change_password)
                    @foreach(\App\Models\Role::PERMISSIONS as $permission => $label)
                        @can($permission)
                            @php
                                $routeName = match ($permission) {
                                    'dashboard' => 'dashboard', 'users' => 'users.index',
                                    'activity' => 'activity.index', 'settings' => 'settings.edit',
                                    'account' => 'account.edit', default => 'modules.'.$permission,
                                };
                            @endphp
                            <a href="{{ route($routeName) }}" @if(request()->routeIs($routeName) || ($permission === 'users' && request()->routeIs('users.*'))) aria-current="page" @endif>{{ $label }}</a>
                        @endcan
                    @endforeach
                @endunless
            </nav>
            <div class="sidebar-account">
                <strong>{{ auth()->user()->name }}</strong>
                <span>{{ auth()->user()->role?->name }}</span>
                <form method="post" action="{{ route('logout') }}">@csrf<button class="button secondary" type="submit">Sign out</button></form>
            </div>
        </aside>
        <main id="main-content" class="main-content">
@else
    <main id="main-content" class="guest-content">
        <a class="brand" href="{{ route('login') }}">OASIS <span>Office Management System</span></a>
@endauth
    <header class="page-heading">
        @yield('breadcrumb')
        <p class="eyebrow">OASIS</p>
        <h1>@yield('title')</h1>
        @hasSection('description')<p class="muted mt-2 mb-0 text-sm">@yield('description')</p>@endif
    </header>
    @if(session('status'))<div class="notice" role="status">{{ session('status') }}</div>@endif
    @if($errors->any())
        <div class="errors" role="alert" tabindex="-1">
            <strong>Please check the following:</strong>
            <ul>@foreach($errors->all() as $error)<li>{{ $error }}</li>@endforeach</ul>
        </div>
    @endif
    @yield('content')
    </main>
@auth</div>@endauth
</body>
</html>
