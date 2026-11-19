@extends('layouts.app')
@section('title', 'Account details')
@section('content')
<div class="card-grid">
    <section class="panel">
        <h2>{{ $user->name }}</h2>
        <dl class="details">
            <dt>User ID</dt><dd>{{ $user->id }}</dd>
            <dt>Email</dt><dd>{{ $user->email }}</dd>
            <dt>Role</dt><dd>{{ $user->role?->name ?? 'Unassigned' }}</dd>
            <dt>Status</dt><dd>{{ $user->is_active ? 'Active' : 'Inactive' }}</dd>
            <dt>Created at (UTC)</dt><dd>{{ $user->created_at->format('Y-m-d H:i') }}</dd>
            <dt>Last login (UTC)</dt><dd>{{ $user->last_login_at?->format('Y-m-d H:i') ?? 'Never' }}</dd>
            <dt>Password change required</dt><dd>{{ $user->must_change_password ? 'Yes' : 'No' }}</dd>
        </dl>
        <a class="button" href="{{ route('users.edit', $user) }}">Edit account</a>
    </section>
    <section class="panel">
        <h2>Reset password</h2>
        <p class="muted">This replaces the current password, signs out existing sessions, and requires a password change on the next login.</p>
        <form class="stack" method="post" action="{{ route('users.reset-password', $user) }}">
            @csrf
            <x-field name="confirmation" label="Type RESET to confirm" required autocomplete="off" />
            <x-field name="current_password" label="Confirm your administrator password" type="password" required autocomplete="current-password" />
            <button class="button danger" type="submit">Reset password</button>
        </form>
    </section>
</div>
<a class="text-link" href="{{ route('users.index') }}">Back to accounts</a>
@endsection
