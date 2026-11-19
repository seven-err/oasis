@extends('layouts.app')
@section('title', 'User Management')
@section('content')
<div class="toolbar"><p class="muted">{{ $users->total() }} matching accounts</p><a class="button" href="{{ route('users.create') }}">Create account</a></div>
<form method="get" action="{{ route('users.index') }}" class="panel filters">
    <x-field name="search" label="Search name or email" :value="request('search', '')" maxlength="255" />
    <div class="field"><label for="role">Role</label><select name="role" id="role"><option value="">All roles</option>
        @foreach($roles as $role)<option value="{{ $role->slug }}" @selected(request('role') === $role->slug)>{{ $role->name }}</option>@endforeach
    </select></div>
    <div class="field"><label for="status">Account status</label><select id="status" name="status"><option value="">All statuses</option><option value="active" @selected(request('status') === 'active')>Active</option><option value="inactive" @selected(request('status') === 'inactive')>Inactive</option></select></div>
    <button class="button secondary" type="submit">Filter</button><a class="text-link" href="{{ route('users.index') }}">Clear</a>
</form>
<div class="panel table-wrap">
    <table><caption class="sr-only">User accounts</caption><thead><tr><th>ID</th><th>Full name</th><th>Email address</th><th>Role</th><th>Status</th><th>Created at</th><th>Last login</th><th>Actions</th></tr></thead><tbody>
    @forelse($users as $user)
        <tr><td>{{ $user->id }}</td><td>{{ $user->name }}</td><td>{{ $user->email }}</td><td>{{ $user->role?->name ?? 'Unassigned' }}</td>
            <td><span class="badge">{{ $user->is_active ? 'Active' : 'Inactive' }}</span></td><td>{{ $user->created_at->format('Y-m-d H:i') }} UTC</td><td>{{ $user->last_login_at ? $user->last_login_at->format('Y-m-d H:i').' UTC' : 'Never' }}</td>
            <td><a class="text-link" href="{{ route('users.show', $user) }}">View #{{ $user->id }}</a></td></tr>
    @empty<tr><td colspan="8">No accounts match these filters.</td></tr>@endforelse
    </tbody></table>
</div>
{{ $users->links() }}
@endsection
