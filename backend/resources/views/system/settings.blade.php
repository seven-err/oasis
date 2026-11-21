@extends('layouts.app')
@section('title', 'System Settings')
@section('content')
<div class="panel"><h2>Role permissions</h2><p class="muted">Restrict module access within each role. HR can access all monitoring modules. Finance access is limited to financial monitoring. Dashboard and personal account access are always retained. Super Admin access is fixed.</p></div>
<div class="card-grid">
    @foreach($roles as $role)
        <section class="panel">
            <h2>{{ $role->name }}</h2>
            <form class="stack" method="post" action="{{ route('settings.permissions', $role) }}">
                @csrf @method('PUT')
                @foreach(array_diff(\App\Models\Role::assignablePermissions($role->slug), ['dashboard', 'account']) as $permission)
                    <label class="check-label"><input type="checkbox" name="permissions[]" value="{{ $permission }}" @checked($role->permissions->contains('slug', $permission))>{{ \App\Models\Role::PERMISSIONS[$permission] }}</label>
                @endforeach
                <div class="field">
                    <label for="password-{{ $role->id }}">Confirm your administrator password</label>
                    <div class="input-group">
                        <input id="password-{{ $role->id }}" type="password" name="current_password" autocomplete="current-password" required>
                        <button class="password-toggle" type="button" data-password-toggle="password-{{ $role->id }}" aria-controls="password-{{ $role->id }}" aria-pressed="false" aria-label="Show confirm your administrator password">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                                <circle cx="12" cy="12" r="3" />
                                <path data-password-slash d="m3 3 18 18" visibility="hidden" />
                            </svg>
                        </button>
                    </div>
                </div>
                <button class="button" type="submit">Save {{ $role->name }} permissions</button>
            </form>
        </section>
    @endforeach
</div>
@endsection
