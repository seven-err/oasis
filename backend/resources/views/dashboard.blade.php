@extends('layouts.app')
@section('title', 'Dashboard')
@section('content')
<div class="panel">
    <h2>Welcome, {{ auth()->user()->name }}</h2>
    <p class="muted">Signed in as {{ auth()->user()->role?->name }}. Choose an available area below.</p>
</div>
<div class="card-grid">
    @foreach(['hr', 'checks', 'payables', 'receivables'] as $module)
        @can($module)
            <div class="panel">
                <span class="badge">Pending Laravel port</span>
                <h2>{{ \App\Models\Role::PERMISSIONS[$module] }}</h2>
                <p class="muted">This module currently exists in the separate React prototype. Its records are not connected to this Laravel application.</p>
                <a class="text-link" href="{{ route('modules.'.$module) }}">View availability</a>
            </div>
        @endcan
    @endforeach
    @can('users')
        <a class="panel card-link" href="{{ route('users.index') }}"><h2>User Management</h2><p class="muted">Create accounts, assign roles, and manage access.</p></a>
    @endcan
    @can('activity')
        <a class="panel card-link" href="{{ route('activity.index') }}"><h2>Activity Logs</h2><p class="muted">Review sign-ins and administrative changes.</p></a>
    @endcan
</div>
@endsection
