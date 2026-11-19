@extends('layouts.app')
@section('title', 'Activity Logs')
@section('content')
<div class="panel table-wrap">
    <table><caption class="sr-only">System activity</caption><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Description</th></tr></thead><tbody>
        @forelse($logs as $log)<tr><td>{{ $log->created_at->format('Y-m-d H:i:s') }}</td><td>{{ $log->user?->name ?? 'System' }}</td><td>{{ $log->action }}</td><td>{{ $log->description }}</td></tr>
        @empty<tr><td colspan="4">No activity recorded.</td></tr>@endforelse
    </tbody></table>
</div>
{{ $logs->links() }}
@endsection
