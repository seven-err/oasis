@extends('layouts.app')
@section('title', $user->exists ? 'Edit account' : 'Create account')
@section('content')
<div class="panel narrow">
    <form class="stack" method="post" action="{{ $user->exists ? route('users.update', $user) : route('users.store') }}">
        @csrf @if($user->exists) @method('PUT') @endif
        <x-field name="name" label="Full name" :value="$user->name" required maxlength="255" autocomplete="name" />
        <x-field name="email" label="Email address" type="email" :value="$user->email" required maxlength="255" autocomplete="email" />
        <div class="field"><label for="role_id">Role</label>
            <select id="role_id" name="role_id" required @if($user->id === auth()->id()) disabled @endif @error('role_id') aria-invalid="true" aria-describedby="role_id-error" @enderror>
                @foreach($roles as $role)<option value="{{ $role->id }}" @selected((int) old('role_id', $user->role_id ?? $roles->firstWhere('slug', 'hr')?->id) === $role->id)>{{ $role->name }}</option>@endforeach
            </select>
            <small class="field-error" id="role_id-error">@error('role_id'){{ $message }}@enderror</small>
            @if($user->id === auth()->id())<input type="hidden" name="role_id" value="{{ $user->role_id }}"><small>You cannot change your own role.</small>@endif
        </div>
        <div class="field"><label for="is_active">Account status</label><select id="is_active" name="is_active" required @error('is_active') aria-invalid="true" aria-describedby="is_active-error" @enderror><option value="1" @selected((string) old('is_active', $user->exists ? (int) $user->is_active : 1) === '1')>Active</option><option value="0" @selected((string) old('is_active', $user->exists ? (int) $user->is_active : 1) === '0')>Inactive</option></select><small class="field-error" id="is_active-error">@error('is_active'){{ $message }}@enderror</small></div>
        @if($user->exists && $user->is_active)
            <x-field name="confirmation" label="Deactivation confirmation" hint="If deactivating this account, type DEACTIVATE. Otherwise leave blank." autocomplete="off" />
        @endif
        <x-field name="current_password" label="Confirm your administrator password" type="password" autocomplete="current-password" required />
        @unless($user->exists)<p class="muted">A temporary password will be generated and shown once after creation. Deliver it privately to the user.</p>@endunless
        <div class="actions"><button class="button" type="submit">{{ $user->exists ? 'Save account' : 'Create account' }}</button><a class="text-link" href="{{ route('users.index') }}">Cancel</a></div>
    </form>
</div>
@endsection
