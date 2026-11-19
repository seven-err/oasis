@extends('layouts.app')
@section('title', 'Temporary credentials')
@section('content')
<div class="panel narrow">
    <div class="notice" role="status">These credentials are shown only in this response. They cannot be retrieved later.</div>
    <p>Deliver the temporary password privately to {{ $user->name }} through your approved secure channel. The user must replace it after signing in.</p>
    <dl class="details"><dt>Email address</dt><dd>{{ $user->email }}</dd><dt>Temporary password</dt><dd><code class="credential">{{ $temporaryPassword }}</code></dd></dl>
    <p class="muted">Account status: {{ $user->is_active ? 'Active' : 'Inactive — activate before signing in' }}.</p>
    <a class="button" href="{{ route('users.show', $user) }}">Done</a>
</div>
@endsection
