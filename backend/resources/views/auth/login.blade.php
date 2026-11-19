@extends('layouts.app')
@section('title', 'Sign in')
@section('content')
<div class="panel">
    <p class="muted">Enter your work email and password to access your account.</p>
    <form method="post" action="{{ route('login.store') }}" class="stack">
        @csrf
        <x-field name="email" label="Email address" type="email" autocomplete="username" required autofocus maxlength="255" />
        <x-field name="password" label="Password" type="password" autocomplete="current-password" required maxlength="1024" />
        <label class="check-label"><input type="checkbox" name="remember" value="1" @checked(old('remember'))> Remember me on this device</label>
        <button class="button" type="submit">Sign in</button>
    </form>
    <p class="muted small">Need an account or a password reset? Contact your Super Admin.</p>
</div>
@endsection
