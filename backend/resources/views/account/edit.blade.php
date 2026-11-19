@extends('layouts.app')
@section('title', 'My Account')
@section('content')
<div class="panel narrow">
    <p class="muted">Your role is {{ auth()->user()->role?->name }}. Contact a Super Admin for access changes.</p>
    <form method="post" action="{{ route('account.update') }}" class="stack">
        @csrf @method('PUT')
        <x-field name="name" label="Full name" :value="auth()->user()->name" required maxlength="255" autocomplete="name" />
        <x-field name="email" label="Email address" type="email" :value="auth()->user()->email" required maxlength="255" autocomplete="email" />
        <x-field name="current_password" label="Confirm your password" type="password" required autocomplete="current-password" />
        <button class="button" type="submit">Save account</button>
    </form>
    <a class="text-link" href="{{ route('password.edit') }}">Change password</a>
</div>
@endsection
