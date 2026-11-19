[CmdletBinding(DefaultParameterSetName = 'Start')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Start')]
    [ValidatePattern('^https://[a-z0-9-]+\.ngrok-free\.(dev|app)$')]
    [string] $PublicUrl,
    [Parameter(ParameterSetName = 'Start')]
    [string] $PhpCgiPath,
    [Parameter(ParameterSetName = 'Start')]
    [switch] $ResetToken,
    [Parameter(Mandatory = $true, ParameterSetName = 'Stop')]
    [switch] $Stop
)

$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'OASIS\office-server'
$stateFile = Join-Path $runtimeRoot 'state.json'

if ($Stop) {
    if (Test-Path -LiteralPath $stateFile) {
        $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        foreach ($service in $state.processes) {
            $process = Get-Process -Id $service.id -ErrorAction SilentlyContinue
            if ($process -and $process.Path -eq $service.path -and $process.StartTime.ToUniversalTime().ToString('o') -eq $service.startedAt) {
                Stop-Process -Id $process.Id
            }
        }
        Remove-Item -LiteralPath $stateFile
    }
    Write-Output 'OASIS office server stopped.'
    return
}

$backendRoot = $PSScriptRoot
$frontendRoot = Join-Path (Split-Path $backendRoot -Parent) 'frontend'
$caddy = Join-Path $runtimeRoot 'caddy.exe'
$ngrok = Join-Path $runtimeRoot 'ngrok.exe'
$configFile = Join-Path $runtimeRoot 'ngrok.yml'
foreach ($required in @($caddy, $ngrok, (Join-Path $backendRoot '.env'), (Join-Path $backendRoot 'public\build\manifest.json'), (Join-Path $frontendRoot 'dist\.vite\manifest.json'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing required file: $required. Follow the office-server setup in README.md." }
}
if (-not $PhpCgiPath) {
    $PhpCgiPath = (Get-Command php-cgi.exe -ErrorAction SilentlyContinue).Source
    if (-not $PhpCgiPath) {
        $PhpCgiPath = Get-ChildItem -Path 'D:\laragon\bin\php\*\php-cgi.exe', 'C:\laragon\bin\php\*\php-cgi.exe' -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
}
if (-not $PhpCgiPath -or -not (Test-Path -LiteralPath $PhpCgiPath)) { throw 'Provide -PhpCgiPath pointing to PHP 8.3+ php-cgi.exe.' }

$busyPorts = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() |
    Where-Object { $_.Port -in @(8081, 9001, 4041) }
if ($busyPorts) { throw 'An office-server port is busy. Run this script with -Stop before restarting.' }

if ($ResetToken -or -not (Test-Path -LiteralPath $configFile)) {
    $secret = Read-Host 'Paste your ngrok authtoken or copied add-authtoken command (input hidden)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
        $token = ($token -replace '^ngrok\s+config\s+add-authtoken\s+', '').Trim('"').Trim("'")
        if ($token -notmatch '^[A-Za-z0-9_-]{20,200}$') { throw 'The pasted token format is invalid. No configuration was saved.' }
        $account = [Security.Principal.WindowsIdentity]::GetCurrent().User
        & "$env:SystemRoot\System32\icacls.exe" $runtimeRoot /inheritance:r /grant:r ("*" + $account.Value + ':(OI)(CI)F') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the agent configuration folder to your Windows account.' }
        @"
version: "3"
agent:
  authtoken: "$token"
  web_addr: "127.0.0.1:4041"
"@ | Set-Content -LiteralPath $configFile -Encoding UTF8
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $token = $null
        $secret.Dispose()
    }
}

& $ngrok config check --config $configFile
if ($LASTEXITCODE -ne 0) { throw 'ngrok configuration validation failed.' }

$env:OASIS_PUBLIC_ROOT = (Join-Path $backendRoot 'public').Replace('\', '/')
$env:OASIS_PUBLIC_URL = $PublicUrl
$env:APP_ENV = 'production'
$env:APP_DEBUG = 'false'
$env:APP_URL = $PublicUrl
$env:SESSION_SECURE_COOKIE = 'true'
$env:SESSION_ENCRYPT = 'true'
$env:PHP_FCGI_MAX_REQUESTS = '0'

& $caddy validate --config (Join-Path $backendRoot 'Caddyfile') --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddy configuration validation failed.' }

$services = @()
try {
    $services += Start-Process -FilePath $PhpCgiPath -ArgumentList '-b 127.0.0.1:9001 -d cgi.force_redirect=0 -d expose_php=Off' -WorkingDirectory (Split-Path $PhpCgiPath -Parent) -WindowStyle Hidden -PassThru
    $services += Start-Process -FilePath $caddy -ArgumentList @('run', '--config', ('"' + (Join-Path $backendRoot 'Caddyfile') + '"'), '--adapter', 'caddyfile') -WorkingDirectory $backendRoot -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $runtimeRoot 'caddy.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8081/login' -Headers @{ Host = ([uri]$PublicUrl).Host; 'X-Forwarded-Proto' = 'https' } -TimeoutSec 3
            if ($response.StatusCode -eq 200 -and $response.Content -match 'Sign in') { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) { throw 'The production web server did not pass its login-page check.' }
    $services += Start-Process -FilePath $ngrok -ArgumentList @('http', 'http://127.0.0.1:8081', ('--url=' + $PublicUrl), '--inspect=false', '--config', ('"' + $configFile + '"'), '--log', ('"' + (Join-Path $runtimeRoot 'ngrok.log') + '"'), '--log-format=json') -WindowStyle Hidden -PassThru
    $online = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $tunnels = Invoke-RestMethod -Uri 'http://127.0.0.1:4041/api/tunnels' -TimeoutSec 3
            if ($tunnels.tunnels.public_url -contains $PublicUrl) { $online = $true; break }
        } catch {}
        if ($services[-1].HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $online) {
        $errorCodes = Select-String -LiteralPath (Join-Path $runtimeRoot 'ngrok.log') -Pattern 'ERR_NGROK_[0-9]+' -AllMatches -ErrorAction SilentlyContinue |
            ForEach-Object { $_.Matches.Value } | Select-Object -Last 1
        if ($errorCodes -in @('ERR_NGROK_105', 'ERR_NGROK_107')) { throw "ngrok rejected its authtoken ($errorCodes). Copy the current token and rerun with -ResetToken." }
        throw "ngrok did not connect. Check $(Join-Path $runtimeRoot 'ngrok.log')."
    }

    $records = @($services | ForEach-Object {
        $_.Refresh()
        @{ id = $_.Id; path = $_.Path; startedAt = $_.StartTime.ToUniversalTime().ToString('o') }
    })
    @{ url = $PublicUrl; processes = $records } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8
    Write-Output "OASIS team login: $PublicUrl/login"
    Write-Output 'Keep MySQL running and this PC awake. To stop: .\backend\start-office-server.ps1 -Stop'
}
catch {
    foreach ($service in $services) { if (-not $service.HasExited) { Stop-Process -Id $service.Id -ErrorAction SilentlyContinue } }
    throw
}
