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
            <div class="login-content">
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
    </main>
</body>
</html>
