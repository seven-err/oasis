<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>OASIS</title>
    @php
        $manifestPath = base_path('../frontend/dist/.vite/manifest.json');
        $manifest = is_file($manifestPath) ? json_decode(file_get_contents($manifestPath), true) : [];
        $entry = $manifest['index.html'] ?? null;
    @endphp
    @foreach($entry['css'] ?? [] as $css)
        <link rel="stylesheet" href="{{ route('application.asset', ['file' => $css]) }}">
    @endforeach
</head>
<body>
    <div id="root"></div>
    <script>
        window.__OASIS_SESSION__ = {{ \Illuminate\Support\Js::from($session) }};
        window.__OASIS_PAGE__ = {{ \Illuminate\Support\Js::from($initialPage) }};
    </script>
    @if($entry)
        <script type="module" src="{{ route('application.asset', ['file' => $entry['file']]) }}"></script>
    @else
        <p>The OASIS interface has not been built. Run <code>pnpm build</code> in <code>frontend/</code>, then reload.</p>
    @endif
    <noscript>Enable JavaScript to use OASIS.</noscript>
</body>
</html>
