@extends('layouts.app')
@section('title', 'System Settings')
@section('content')
<div class="panel"><h2>Role permissions</h2><p class="muted">Restrict module access within each role. HR cannot receive Finance access, and Finance cannot receive HR access. Dashboard and personal account access are always retained. Super Admin access is fixed.</p></div>
<div class="card-grid">
    @foreach($roles as $role)
        <section class="panel">
            <h2>{{ $role->name }}</h2>
            <form class="stack" method="post" action="{{ route('settings.permissions', $role) }}">
                @csrf @method('PUT')
                <input type="hidden" name="validation_role" value="{{ $role->slug }}">
                @foreach(array_diff(\App\Models\Role::ACCESS[$role->slug], ['dashboard', 'account']) as $permission)
                    <label class="check-label"><input type="checkbox" name="permissions[]" value="{{ $permission }}" @checked($role->permissions->contains('slug', $permission))>{{ \App\Models\Role::PERMISSIONS[$permission] }}</label>
                @endforeach
                <div class="field"><label for="password-{{ $role->id }}">Confirm your administrator password</label><input id="password-{{ $role->id }}" type="password" name="current_password" autocomplete="current-password" required @if(old('validation_role') === $role->slug && $errors->has('current_password')) aria-invalid="true" aria-describedby="password-{{ $role->id }}-error" @endif><small class="field-error" id="password-{{ $role->id }}-error">@if(old('validation_role') === $role->slug) @error('current_password'){{ $message }}@enderror @endif</small></div>
                <button class="button" type="submit">Save {{ $role->name }} permissions</button>
            </form>
        </section>
    @endforeach
</div>
@endsection
