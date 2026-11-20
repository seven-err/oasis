[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://[a-z0-9-]+\.ngrok-free\.(dev|app)$')]
    [string] $PublicUrl,
    [string] $PhpCgiPath,
    [switch] $Watch
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'OASIS\office-server'
$revisionFile = Join-Path $runtimeRoot 'deployed-revision.txt'
$launcher = Join-Path $PSScriptRoot 'start-office-server.ps1'

function Invoke-Checked([string] $Command, [string[]] $Arguments) {
    & $Command @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "$Command failed (exit $LASTEXITCODE). Deployment stopped; fix the error and rerun this updater." }
}

foreach ($command in @('git', 'php', 'composer', 'npm', 'npx', 'powershell.exe')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command '$command' was not found. Install the README prerequisites and reopen PowerShell. The server was left alone."
    }
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
# One updater owns the shared server, even if a second terminal is opened.
$lock = [IO.File]::Open((Join-Path $runtimeRoot 'update.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
Push-Location $repoRoot
try {
    Write-Output 'Updating the office server from origin/main. Keep this checkout for hosting only.'
    do {
        $branch = & git branch --show-current
        if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') { throw 'The office checkout must be on main. Use a separate clone for UI development.' }
        $changes = & git status --porcelain
        if ($LASTEXITCODE -ne 0 -or $changes) { throw 'The office checkout has local changes. Commit or move them before updating; nothing was overwritten.' }

        & git fetch origin main
        if ($LASTEXITCODE -ne 0) {
            if (-not $Watch) { throw 'Could not fetch origin/main. The running server was left alone.' }
            Write-Warning 'Could not reach origin/main; retrying in 30 seconds. The running server was left alone.'
            Start-Sleep -Seconds 30
            continue
        }
        $revision = & git rev-parse origin/main
        if ($LASTEXITCODE -ne 0) { throw 'Could not resolve origin/main.' }
        & git merge-base --is-ancestor HEAD $revision
        if ($LASTEXITCODE -ne 0) { throw 'The office checkout has diverged from origin/main. Resolve it manually; nothing was overwritten.' }

        $deployed = if (Test-Path -LiteralPath $revisionFile) { (Get-Content -LiteralPath $revisionFile -Raw).Trim() } else { '' }
        if ($deployed -ne "$repoRoot|$PublicUrl|$revision" -or -not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'state.json'))) {
            Invoke-Checked 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $launcher, '-Stop')
            Invoke-Checked 'git' @('merge', '--ff-only', $revision)

            $previousEnvironment = @{}
            foreach ($name in @('APP_ENV', 'APP_DEBUG', 'APP_URL', 'VITE_TEAM_URL', 'CI')) {
                $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
            }
            try {
                $env:APP_ENV = 'production'
                $env:APP_DEBUG = 'false'
                $env:APP_URL = $PublicUrl
                $env:VITE_TEAM_URL = ''
                $env:CI = 'true'
                Push-Location (Join-Path $repoRoot 'backend')
                try {
                    Invoke-Checked 'composer' @('install', '--no-interaction', '--prefer-dist', '--optimize-autoloader')
                    Invoke-Checked 'php' @('artisan', 'config:clear', '--no-interaction')
                    Invoke-Checked 'php' @('artisan', 'migrate', '--force', '--no-interaction')
                    Invoke-Checked 'php' @('artisan', 'db:seed', '--class=RolePermissionSeeder', '--force', '--no-interaction')
                    Invoke-Checked 'php' @('artisan', 'view:clear', '--no-interaction')
                    Invoke-Checked 'npm' @('ci', '--ignore-scripts')
                    Invoke-Checked 'npm' @('run', 'build')
                    if (Test-Path -LiteralPath 'public/hot') { Remove-Item -LiteralPath 'public/hot' }
                }
                finally { Pop-Location }

                Push-Location (Join-Path $repoRoot 'frontend')
                try {
                    Invoke-Checked 'npx' @('--yes', 'pnpm@10.34.3', 'install', '--frozen-lockfile')
                    Invoke-Checked 'npx' @('--yes', 'pnpm@10.34.3', 'build')
                }
                finally { Pop-Location }

                $startArguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $launcher, '-PublicUrl', $PublicUrl)
                if ($PhpCgiPath) { $startArguments += @('-PhpCgiPath', $PhpCgiPath) }
                Invoke-Checked 'powershell.exe' $startArguments
                "$repoRoot|$PublicUrl|$revision" | Set-Content -LiteralPath $revisionFile -Encoding UTF8
                Write-Output "Deployed $revision to $PublicUrl/login. Refresh the browser to see UI changes."
            }
            finally {
                foreach ($name in $previousEnvironment.Keys) {
                    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
                }
            }
        }

        if ($Watch) { Start-Sleep -Seconds 30 }
    } while ($Watch)
}
finally {
    Pop-Location
    $lock.Dispose()
}
