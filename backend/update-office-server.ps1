[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^https://[a-z0-9-]+\.ngrok-free\.(dev|app)$')]
    [string] $PublicUrl,
    [ValidateSet('main', 'staging')]
    [string] $Branch = 'main',
    [string] $PhpCgiPath,
    [switch] $Watch,
    [switch] $Rollback,
    [ValidatePattern('^[0-9a-fA-F]{7,40}$')]
    [string] $Revision
)

$ErrorActionPreference = 'Stop'
if ($Rollback -and $Watch) {
    throw 'Cannot combine -Rollback with -Watch. Stop the watcher, roll back, then revert the bad commit on GitHub before resuming -Watch.'
}
if ($Revision -and -not $Rollback) {
    throw '-Revision can only be used with -Rollback.'
}

$repoRoot = Split-Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'OASIS\office-server'
$revisionFile = Join-Path $runtimeRoot 'deployed-revision.txt'
$previousRevisionFile = Join-Path $runtimeRoot 'previous-revision.txt'
$launcher = Join-Path $PSScriptRoot 'start-office-server.ps1'

function Invoke-Checked([string] $Command, [string[]] $Arguments) {
    # A pipeline waits for inherited output handles held by the launched web services.
    & $Command @Arguments
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
    $rejectedRevision = ''
    if ($Rollback) {
        Write-Output "Rolling back the office server on branch '$Branch'."
    } else {
        Write-Output "Updating the office server from origin/$Branch. Keep this checkout for hosting only."
    }
    do {
        $currentBranch = & git branch --show-current
        if ($LASTEXITCODE -ne 0 -or $currentBranch -ne $Branch) { throw "The office checkout must be on $Branch. Use a separate clone for UI development." }
        $changes = & git status --porcelain
        if ($LASTEXITCODE -ne 0 -or $changes) { throw 'The office checkout has local changes. Commit or move them before updating; nothing was overwritten.' }

        $deployed = if (Test-Path -LiteralPath $revisionFile) { (Get-Content -LiteralPath $revisionFile -Raw).Trim() } else { '' }
        if ($Rollback) {
            $targetRef = $Revision
            if (-not $targetRef) {
                $previous = if (Test-Path -LiteralPath $previousRevisionFile) { (Get-Content -LiteralPath $previousRevisionFile -Raw).Trim() } else { '' }
                $parts = $previous -split '\|'
                if ($parts.Count -lt 3 -or $parts[0] -ne $repoRoot -or -not $parts[2]) {
                    throw 'No previous deployed revision recorded for this checkout. Pass -Revision <commit> explicitly.'
                }
                $targetRef = $parts[2]
            }
            $targetRevision = & git rev-parse --verify "$targetRef^{commit}"
            if ($LASTEXITCODE -ne 0 -or -not $targetRevision) { throw "Could not resolve rollback revision '$targetRef'. The running server was left alone." }
        }
        else {
            & git fetch origin $Branch
            if ($LASTEXITCODE -ne 0) {
                if (-not $Watch) { throw "Could not fetch origin/$Branch. The running server was left alone." }
                Write-Warning "Could not reach origin/$Branch; retrying in 30 seconds. The running server was left alone."
                Start-Sleep -Seconds 30
                continue
            }
            $targetRevision = & git rev-parse "origin/$Branch"
            if ($LASTEXITCODE -ne 0) { throw "Could not resolve origin/$Branch." }
            & git merge-base --is-ancestor HEAD $targetRevision
            if ($LASTEXITCODE -ne 0) { throw "The office checkout has diverged from origin/$Branch. Resolve it manually; nothing was overwritten." }
        }

        if ($targetRevision -eq $rejectedRevision) {
            Start-Sleep -Seconds 30
            continue
        }
        if ($Rollback -or $deployed -ne "$repoRoot|$PublicUrl|$targetRevision" -or -not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'state.json'))) {
            $candidate = Join-Path $runtimeRoot ('build-check-' + [guid]::NewGuid())
            $previousCi = $env:CI
            $previousTeamUrl = $env:VITE_TEAM_URL
            try {
                Invoke-Checked 'git' @('worktree', 'add', '--detach', $candidate, $targetRevision)
                $env:CI = 'true'
                $env:VITE_TEAM_URL = ''
                Push-Location (Join-Path $candidate 'frontend')
                try {
                    Invoke-Checked 'npx' @('--yes', 'pnpm@10.34.3', 'install', '--frozen-lockfile')
                    Invoke-Checked 'npx' @('--yes', 'pnpm@10.34.3', 'exec', 'tsc', '--noEmit')
                    Invoke-Checked 'npx' @('--yes', 'pnpm@10.34.3', 'build')
                }
                finally { Pop-Location }
            }
            catch {
                if (-not $Watch) { throw }
                $rejectedRevision = $targetRevision
                Write-Warning "Preflight failed for $targetRevision. The live site was left alone. $($_.Exception.Message)"
                Start-Sleep -Seconds 30
                continue
            }
            finally {
                $env:CI = $previousCi
                $env:VITE_TEAM_URL = $previousTeamUrl
                $resolvedCandidate = [IO.Path]::GetFullPath($candidate)
                $runtimePrefix = [IO.Path]::GetFullPath($runtimeRoot).TrimEnd('\') + '\'
                if ($resolvedCandidate.StartsWith($runtimePrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedCandidate)) {
                    & git -c core.longpaths=true worktree remove --force $resolvedCandidate
                    if ($LASTEXITCODE -ne 0 -and (Test-Path -LiteralPath $resolvedCandidate)) {
                        try { Remove-Item -LiteralPath $resolvedCandidate -Recurse -Force }
                        catch { Write-Warning "Could not remove the preflight checkout at $candidate." }
                    }
                }
            }
            Invoke-Checked 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $launcher, '-Stop')
            if ($Rollback) {
                Invoke-Checked 'git' @('reset', '--hard', $targetRevision)
            } else {
                Invoke-Checked 'git' @('merge', '--ff-only', $targetRevision)
            }

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
                $newEntry = "$repoRoot|$PublicUrl|$targetRevision"
                if ($deployed -and $deployed -ne $newEntry) {
                    $deployed | Set-Content -LiteralPath $previousRevisionFile -Encoding UTF8
                }
                $newEntry | Set-Content -LiteralPath $revisionFile -Encoding UTF8
                if ($Rollback) {
                    Write-Output "Rolled back to $targetRevision at $PublicUrl/login. Do not restart -Watch until you push a 'git revert' to origin/$Branch. Restore a pre-deploy SQL backup if the bad release changed the database."
                } else {
                    Write-Output "Deployed $targetRevision to $PublicUrl/login. Refresh the browser to see UI changes."
                }
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
