$ErrorActionPreference = 'Stop'
$updater = Join-Path (Split-Path $PSScriptRoot -Parent) 'update-office-server.ps1'
$originalLocalAppData = $env:LOCALAPPDATA
$originalAppEnvironment = $env:APP_ENV
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('oasis-update-test-' + [guid]::NewGuid())
$env:LOCALAPPDATA = $testRoot
$env:APP_ENV = 'local'
$runtimeRoot = Join-Path $testRoot 'OASIS/office-server'
$calls = [Collections.Generic.List[string]]::new()
$scenario = 'success'

function Assert($Condition, [string] $Message) {
    if (-not $Condition) { throw $Message }
}

function git {
    $global:LASTEXITCODE = 0
    $command = $args -join ' '
    $calls.Add('git ' + $command)
    switch ($command) {
        'branch --show-current' { if ($scenario -eq 'branch') { 'feature/ui' } else { 'main' } }
        'status --porcelain' { if ($scenario -eq 'dirty') { ' M frontend/src/App.tsx' } }
        'fetch origin main' { if ($scenario -eq 'network') { $global:LASTEXITCODE = 1 } }
        'rev-parse origin/main' { 'test-revision' }
        'merge-base --is-ancestor HEAD test-revision' { if ($scenario -eq 'diverged') { $global:LASTEXITCODE = 1 } }
    }
}

function powershell.exe {
    $global:LASTEXITCODE = 0
    $calls.Add('launcher ' + ($args -join ' '))
    if ($args -contains '-PublicUrl') {
        '{}' | Set-Content -LiteralPath (Join-Path $runtimeRoot 'state.json')
    }
}
function composer { $global:LASTEXITCODE = 0; $calls.Add('composer ' + ($args -join ' ')) }
function php { $global:LASTEXITCODE = 0; $calls.Add('php ' + ($args -join ' ')) }
function npm { $global:LASTEXITCODE = 0; $calls.Add('npm ' + ($args -join ' ')) }
function pnpm {
    $global:LASTEXITCODE = 0
    $calls.Add('pnpm ' + ($args -join ' '))
    if ($scenario -eq 'build-failure' -and $args[0] -eq 'build') { $global:LASTEXITCODE = 1 }
}

try {
    & $updater -PublicUrl 'https://oasis-test.ngrok-free.dev'
    Assert ($calls -contains 'pnpm build') 'React must be rebuilt.'
    Assert ($calls -contains 'npm run build') 'Laravel assets must be rebuilt.'
    Assert ($calls -contains 'php artisan migrate --force --no-interaction') 'Migrations must run without clearing data.'
    Assert ($calls -contains 'php artisan db:seed --class=RolePermissionSeeder --force --no-interaction') 'Only permissions should be seeded on the host.'
    Assert (-not ($calls -match 'setup|fresh|LocalDevelopmentSeeder|key:generate')) 'Deployment must preserve accounts, database and app key.'
    Assert ($env:APP_ENV -eq 'local') 'Deployment environment must be restored.'
    Assert (Test-Path -LiteralPath (Join-Path $runtimeRoot 'deployed-revision.txt')) 'Success must record the deployed revision.'

    $calls.Clear()
    & $updater -PublicUrl 'https://oasis-test.ngrok-free.dev'
    Assert (-not ($calls -match '^launcher ')) 'An unchanged revision must not interrupt the server.'

    foreach ($scenario in @('dirty', 'branch', 'diverged', 'network')) {
        $calls.Clear()
        $failed = $false
        try { & $updater -PublicUrl 'https://oasis-test.ngrok-free.dev' } catch { $failed = $true }
        Assert $failed "$scenario must refuse deployment."
        Assert (-not ($calls -match '^launcher ')) "$scenario must leave the running server alone."
    }

    Remove-Item -LiteralPath (Join-Path $runtimeRoot 'deployed-revision.txt')
    $scenario = 'build-failure'
    $calls.Clear()
    $failed = $false
    try { & $updater -PublicUrl 'https://oasis-test.ngrok-free.dev' } catch { $failed = $true }
    Assert $failed 'A failed build must stop deployment.'
    Assert (-not ($calls -match '-PublicUrl')) 'A broken build must not be started.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'deployed-revision.txt'))) 'A failed build must not be marked deployed.'

    $scenario = 'success'
    & $updater -PublicUrl 'https://oasis-test.ngrok-free.dev'
    Assert (Test-Path -LiteralPath (Join-Path $runtimeRoot 'deployed-revision.txt')) 'Rerunning must retry an unsuccessful revision.'
    Write-Output 'Office updater tests passed.'
}
finally {
    $env:LOCALAPPDATA = $originalLocalAppData
    $env:APP_ENV = $originalAppEnvironment
    $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTestRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedTestRoot -Leaf) -like 'oasis-update-test-*') {
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
}
