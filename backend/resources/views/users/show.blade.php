@extends('layouts.app')
@section('title', 'Account details')
@section('description', 'View account information and manage sign-in access.')
@section('breadcrumb')
<a class="text-link mb-4 text-sm" href="{{ route('users.index') }}">&larr; Back to accounts</a>
@endsection
@section('content')
<div class="user-details-grid">
    <section class="panel account-overview" aria-labelledby="account-name">
        <header class="account-summary">
            <div class="min-w-0">
                <h2 id="account-name" class="mb-1 break-words">{{ $user->name }}</h2>
                <p class="muted mb-0 text-sm">{{ $user->role?->name ?? 'Unassigned' }} account</p>
            </div>
            <span class="account-status {{ $user->is_active ? 'is-active' : '' }}">{{ $user->is_active ? 'Active' : 'Inactive' }}</span>
        </header>
        <h3 class="account-section-title">Account information</h3>
        <dl class="account-details">
            <dt>User ID</dt><dd>{{ $user->id }}</dd>
            <dt>Email</dt><dd>{{ $user->email }}</dd>
            <dt>Role</dt><dd>{{ $user->role?->name ?? 'Unassigned' }}</dd>
            <dt>Created at (UTC)</dt><dd>{{ $user->created_at->format('Y-m-d H:i') }}</dd>
            <dt>Last login (UTC)</dt><dd>{{ $user->last_login_at?->format('Y-m-d H:i') ?? 'Never' }}</dd>
            <dt>Password change required</dt><dd>{{ $user->must_change_password ? 'Yes — at next login' : 'No' }}</dd>
        </dl>
        <footer class="account-footer"><a class="button" href="{{ route('users.edit', $user) }}">Edit account</a></footer>
    </section>
    <section class="panel account-reset" aria-labelledby="reset-password-heading">
        <p class="account-section-title">Sign-in security</p>
        <h2 id="reset-password-heading">Reset password</h2>
        <p class="muted text-sm">This replaces the current password, signs out existing sessions, and requires a password change on the next login.</p>
        <form class="stack" method="post" action="{{ route('users.reset-password', $user) }}">
            @csrf
            <x-field name="confirmation" label="Type RESET to confirm" required autocomplete="off" />
            <x-field name="current_password" label="Confirm your administrator password" type="password" required autocomplete="current-password" />
            <div class="account-reset-actions"><button class="button danger" type="submit">Reset password</button></div>
        </form>
    </section>
</div>
@endsection
