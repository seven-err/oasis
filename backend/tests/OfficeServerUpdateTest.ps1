$ErrorActionPreference = 'Stop'
$updater = Join-Path (Split-Path $PSScriptRoot -Parent) 'update-office-server.ps1'
$originalLocalAppData = $env:LOCALAPPDATA
$originalAppEnvironment = $env:APP_ENV
$originalCi = $env:CI
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('oasis-update-test-' + [guid]::NewGuid())
$env:LOCALAPPDATA = $testRoot
$env:APP_ENV = 'local'
$env:CI = 'previous-value'
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
    if ($args[0] -eq 'worktree' -and $args[1] -eq 'add') {
        New-Item -ItemType Directory -Path (Join-Path $args[3] 'frontend') -Force | Out-Null
    }
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
        if ($scenario -eq 'launcher-handoff') {
            & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -File (Join-Path $testRoot 'launcher-handoff.ps1')
        }
    }
}
function composer { $global:LASTEXITCODE = 0; $calls.Add('composer ' + ($args -join ' ')) }
function php { $global:LASTEXITCODE = 0; $calls.Add('php ' + ($args -join ' ')) }
function npm { $global:LASTEXITCODE = 0; $calls.Add('npm ' + ($args -join ' ')) }
function npx {
    $global:LASTEXITCODE = 0
    $calls.Add('npx ' + ($args -join ' '))
    Assert ($env:CI -eq 'true') 'Package installation must not prompt when switching pnpm versions.'
    if ($scenario -eq 'build-failure' -and $args[-1] -eq 'build') { $global:LASTEXITCODE = 1 }
}
function Get-Command([string] $Name) {
    if ($scenario -eq 'missing-tool' -and $Name -eq 'npx') { return }
    Microsoft.PowerShell.Core\Get-Command $Name -ErrorAction SilentlyContinue
}

try {
    & $updater -PublicUrl 'https://oasis-test.ngrok-free.dev'
    Assert ($calls -contains 'npx --yes pnpm@10.34.3 build') 'React must be rebuilt without requiring global pnpm.'
    Assert ($calls -contains 'npx --yes pnpm@10.34.3 install --frozen-lockfile') 'Frontend dependencies must use the pinned pnpm version.'
    Assert ($calls -contains 'npm run build') 'Laravel assets must be rebuilt.'
    Assert ($calls -contains 'php artisan migrate --force --no-interaction') 'Migrations must run without clearing data.'
    Assert ($calls -contains 'php artisan db:seed --class=RolePermissionSeeder --force --no-interaction') 'Only permissions should be seeded on the host.'
    Assert (-not ($calls -match 'setup|fresh|LocalDevelopmentSeeder|key:generate')) 'Deployment must preserve accounts, database and app key.'
    Assert ($env:APP_ENV -eq 'local') 'Deployment environment must be restored.'
    Assert ($env:CI -eq 'previous-value') 'CI environment must be restored.'
    Assert (Test-Path -LiteralPath (Join-Path $runtimeRoot 'deployed-revision.txt')) 'Success must record the deployed revision.'

    $calls.Clear()
    & $updater -PublicUrl 'https://oasis-test.ngrok-free.dev'
    Assert (-not ($calls -match '^launcher ')) 'An unchanged revision must not interrupt the server.'

    foreach ($scenario in @('dirty', 'branch', 'diverged', 'network', 'missing-tool')) {
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
    Assert (-not ($calls -match '^launcher .* -Stop$')) 'A failed preflight must leave the running site alone.'
    Assert (-not ($calls -match '^git merge --ff-only')) 'A failed preflight must leave the live checkout alone.'
    Assert (-not ($calls -match '-PublicUrl')) 'A broken build must not be started.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'deployed-revision.txt'))) 'A failed build must not be marked deployed.'

    $scenario = 'success'
    & $updater -PublicUrl 'https://oasis-test.ngrok-free.dev'
    Assert (Test-Path -LiteralPath (Join-Path $runtimeRoot 'deployed-revision.txt')) 'Rerunning must retry an unsuccessful revision.'

    Remove-Item -LiteralPath (Join-Path $runtimeRoot 'deployed-revision.txt')
    $scenario = 'launcher-handoff'
    @'
$child = Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile -Command Start-Sleep -Seconds 20' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'service.out.log') -RedirectStandardError (Join-Path $PSScriptRoot 'service.err.log')
$child.Id | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'service.pid')
Write-Output 'Test launcher returned with its service running.'
'@ | Set-Content -LiteralPath (Join-Path $testRoot 'launcher-handoff.ps1')
    $elapsed = [Diagnostics.Stopwatch]::StartNew()
    try {
        & $updater -PublicUrl 'https://oasis-test.ngrok-free.dev'
        Assert ($elapsed.Elapsed.TotalSeconds -lt 10) 'Deployment must finish without waiting for launched services to exit.'
        Assert (Test-Path -LiteralPath (Join-Path $runtimeRoot 'deployed-revision.txt')) 'The running service must not prevent recording the deployed revision.'
    }
    finally {
        $serviceId = Get-Content -LiteralPath (Join-Path $testRoot 'service.pid') -ErrorAction SilentlyContinue
        if ($serviceId) { Stop-Process -Id ([int] $serviceId) -ErrorAction SilentlyContinue }
    }
    Write-Output 'Office updater tests passed.'
}
finally {
    $env:LOCALAPPDATA = $originalLocalAppData
    $env:APP_ENV = $originalAppEnvironment
    $env:CI = $originalCi
    $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolvedTestRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedTestRoot -Leaf) -like 'oasis-update-test-*') {
        Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
    }
}
