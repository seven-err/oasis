<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Sign in · OASIS</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="login-page">
    <main class="login-shell">
        <section class="login-card" aria-labelledby="login-title">
            <header class="login-brand">
                <span class="login-logo" role="img" aria-label="OASIS logo"></span>
                <div class="login-brand-copy">
                    <svg aria-label="OASIS" role="img" viewBox="0 0 354 64">
                        <g fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round">
                            <path d="M6 56 40 10 Q46 2 52 10 L86 56" />
                            <path d="M201 10 H128 A12 12 0 0 0 128 34 H191 A11 11 0 0 1 191 56 H112" />
                            <path d="M229 10 V56" />
                            <path d="M344 10 H271 A12 12 0 0 0 271 34 H334 A11 11 0 0 1 334 56 H255" />
                        </g>
                        <circle cx="46" cy="48" r="8" fill="currentColor" />
                    </svg>
                    <span>Diagnostic &amp; Laboratory Center</span>
                </div>
            </header>

            <div class="login-content">
                <p class="login-eyebrow">Office Management System</p>
                <h1 id="login-title">Welcome back</h1>
                <p class="login-description">Sign in to your OASIS account.</p>

                @if(session('status'))
                    <div class="notice" role="status">{{ session('status') }}</div>
                @endif
                @php($otherErrors = collect($errors->getMessages())->except(['email', 'password'])->flatten())
                @if($otherErrors->isNotEmpty())
                    <div class="errors" role="alert">
                        <ul>@foreach($otherErrors as $error)<li>{{ $error }}</li>@endforeach</ul>
                    </div>
                @endif

                <form method="post" action="{{ route('login.store') }}" class="login-form">
                    @csrf
                    <x-field name="email" label="Email address" type="email" autocomplete="username" placeholder="you@company.com" required :autofocus="!$errors->has('password') || $errors->has('email')" maxlength="255" />
                    <x-field name="password" label="Password" type="password" autocomplete="current-password" placeholder="Enter your password" required :autofocus="!$errors->has('email') && $errors->has('password')" maxlength="1024" />
                    <label class="check-label login-remember"><input type="checkbox" name="remember" value="1" @checked(old('remember'))> Remember me on this device</label>
                    <button class="button login-submit" type="submit">Sign in</button>
                </form>
            </div>

            <footer class="login-help">
                Need an account or password reset?<br>
                <strong>Contact your Super Admin.</strong>
            </footer>
        </section>
        <p class="login-password-note">Already changed your temporary password? Use your new password.</p>
    </main>
</body>
</html>
