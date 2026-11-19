@extends('layouts.app')
@section('title', $title)
@section('content')
<div class="panel narrow">
    <span class="badge">Not yet available in Laravel</span>
    <h2>This module has not been ported yet</h2>
    <p>The {{ $title }} screen currently runs in the separate React prototype using browser-local data. This Laravel route enforces your access permissions, but does not provide the module or access to those records.</p>
    <a class="button secondary" href="{{ route('dashboard') }}">Back to dashboard</a>
</div>
@endsection
