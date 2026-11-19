@extends('layouts.app')
@section('title', 'Change password')
@section('content')
<div class="panel narrow">
    @if(auth()->user()->must_change_password)
        <div class="notice">You must replace your temporary password before accessing the application.</div>
    @endif
    <p class="muted">Use at least 12 characters, with uppercase and lowercase letters, a number, and a symbol.</p>
    <form method="post" action="{{ route('password.update') }}" class="stack">
        @csrf @method('PUT')
        <x-field name="current_password" label="Current password" type="password" autocomplete="current-password" required />
        <x-field name="password" label="New password" type="password" autocomplete="new-password" required minlength="12" maxlength="1024" />
        <x-field name="password_confirmation" label="Confirm new password" type="password" autocomplete="new-password" required minlength="12" maxlength="1024" />
        <button class="button" type="submit">Save new password</button>
    </form>
</div>
@endsection
