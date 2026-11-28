[CmdletBinding()]
param(
    [switch] $Watch,
    [int] $IntervalSeconds = 5,
    [switch] $SkipNgrokUpdate
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
if (-not $repoRoot) { $repoRoot = 'e:\OASIS' }

$script:lastNgrokCheck = [DateTime]::MinValue

function Update-NgrokCli {
    if ($SkipNgrokUpdate) { return }
    # Check once every 30 minutes to maintain strict zero-delay git monitoring
    if ((Get-Date) - $script:lastNgrokCheck -lt [TimeSpan]::FromMinutes(30)) {
        return
    }
    $script:lastNgrokCheck = Get-Date

    if (Get-Command ngrok -ErrorAction SilentlyContinue) {
        Write-Host "Checking for ngrok CLI updates..."
        try {
            $prevEAP = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            $updateResult = & ngrok update 2>&1
            $ErrorActionPreference = $prevEAP
            if ($updateResult) {
                Write-Host ($updateResult -join "`n")
            }
        }
        catch {
            Write-Host "ngrok is up to date or encountered notice: $_"
        }
    }
}

function Run-SyncAndReviewPass {
    Set-Location $repoRoot

    # 1. Update ngrok
    Update-NgrokCli

    # 2. Strict fetch from GitHub
    Write-Host "Fetching latest refs from GitHub (strict no-delay sync)..."
    git fetch --all --prune

    # 3. Fast-forward local main if remote is ahead
    $currentBranch = (git branch --show-current).Trim()
    if ($currentBranch -eq 'main') {
        $behindMain = [int](git rev-list --count HEAD..origin/main 2>$null)
        if ($behindMain -gt 0) {
            Write-Host "Local main is behind origin/main by $behindMain commit(s). Fast-forwarding now..."
            git pull --ff-only origin main
        }
    }

    # 4. List open non-draft PRs
    Write-Host "Checking open PRs on GitHub..."
    $prJson = gh pr list --state open --json number,title,headRefName,baseRefName,isDraft | ConvertFrom-Json
    $openPRs = @($prJson | Where-Object { -not $_.isDraft })

    # 5. List remote branches excluding main, staging, HEAD, gh-pages
    $remoteBranches = git branch -r | ForEach-Object { $_.Trim() } |
        Where-Object { $_ -match '^origin/' } |
        Where-Object { $_ -notmatch 'origin/(main|staging|HEAD|gh-pages)$' }

    $targetBase = 'main'
    git show-ref --verify --quiet refs/remotes/origin/staging 2>$null
    if ($LASTEXITCODE -eq 0) { $targetBase = 'staging' }

    # 6. Identify unmerged branches (ahead of target base)
    $unmergedBranches = @()
    foreach ($branch in $remoteBranches) {
        $ahead = [int](git rev-list --count "origin/$targetBase..$branch" 2>$null)
        if ($ahead -gt 0) {
            $unmergedBranches += $branch
        }
    }

    # 7. Create PR for each unmerged branch without an open PR
    foreach ($branch in $unmergedBranches) {
        $branchName = $branch.Substring('origin/'.Length)
        $hasPR = $openPRs | Where-Object { $_.headRefName -eq $branchName }
        if (-not $hasPR) {
            Write-Host "Creating PR for $branchName -> $targetBase..."
            gh pr create --base $targetBase --head $branchName --fill
        }
    }

    # 8. Refresh PR list after possible creations
    $prJson = gh pr list --state open --json number,title,headRefName,baseRefName,isDraft | ConvertFrom-Json
    $openPRs = @($prJson | Where-Object { -not $_.isDraft })

    # 9. Process each open PR
    foreach ($pr in $openPRs) {
        $prNumber = $pr.number
        $baseRef = $pr.baseRefName
        $headRef = $pr.headRefName
        Write-Host "Processing PR #$prNumber ($headRef -> $baseRef)..."

        $wtDir = Join-Path $repoRoot "wt-pr-$prNumber"
        if (Test-Path $wtDir) { Remove-Item -Recurse -Force $wtDir }
        git worktree add $wtDir $headRef

        Set-Location $wtDir
        try {
            $env:RUN_CHECKS = '1'
            $env:BASE_REF = "origin/$baseRef"
            $env:HEAD_REF = "origin/$headRef"

            # Run ponytail review
            $reviewOutput = node frontend/scripts/ponytail-review.mjs 2>&1

            # Run build
            $buildOutput = pnpm build 2>&1

            # Prepare comment file
            $commentPath = "comment_pr_$prNumber.txt"
            $commentContent = "Ponytail Review Summary:`n$reviewOutput`n`nBuild Output:`n$buildOutput"
            Set-Content -Path $commentPath -Value $commentContent -Encoding UTF8

            # Post comment on PR
            gh pr comment $prNumber --body-file $commentPath

            # Determine merge eligibility (PRs into main require manual merge)
            $hasMustFix = $reviewOutput -match 'Must Fix'
            $buildSuccess = $buildOutput -notmatch 'error'
            if ($baseRef -ne 'main' -and -not $hasMustFix -and $buildSuccess) {
                Write-Host "Merging PR #$prNumber..."
                gh pr merge $prNumber --merge --delete-branch
            } elseif ($baseRef -eq 'main') {
                Write-Host "PR #$prNumber targets main; waiting for manual merge."
            } else {
                Write-Host "PR #$prNumber not merged due to issues."
            }
        }
        finally {
            Set-Location $repoRoot
            git worktree remove $wtDir --force
            if (Test-Path $commentPath) { Remove-Item $commentPath -Force -ErrorAction SilentlyContinue }
        }
    }

    # 10. Ensure local main is fast-forwarded to latest origin/main
    Write-Host "Ensuring local main is up to date..."
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    git checkout main 2>$null
    git pull --ff-only origin main
    $ErrorActionPreference = $prevEAP

    Write-Host "Cycle complete. Local main is synced with GitHub."
}

# Main execution loop
do {
    try {
        Run-SyncAndReviewPass
    }
    catch {
        Write-Warning "Sync error encountered: $_"
    }

    if ($Watch) {
        Write-Host "Monitoring GitHub strictly with no delay (polling every ${IntervalSeconds}s). Press Ctrl+C to stop..."
        Start-Sleep -Seconds $IntervalSeconds
    }
} while ($Watch)
