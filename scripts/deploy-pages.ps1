# Build and force-publish dist/ to the gh-pages branch (no Git LFS pointers).
# Usage: pwsh ./scripts/deploy-pages.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$env:GITHUB_PAGES = "true"
pnpm build

$tmp = Join-Path $PWD ".tmp-gh-pages"
if (Test-Path $tmp) {
  Remove-Item -Recurse -Force $tmp
}
New-Item -ItemType Directory -Path $tmp | Out-Null
Copy-Item -Path (Join-Path $PWD "dist\*") -Destination $tmp -Recurse -Force
Set-Content -Path (Join-Path $tmp ".gitattributes") -Value "* -filter -diff -merge`n" -NoNewline
Set-Content -Path (Join-Path $tmp ".nojekyll") -Value "" -NoNewline

Push-Location $tmp
try {
  git init -b gh-pages | Out-Null
  git -c filter.lfs.smudge= -c filter.lfs.clean= -c filter.lfs.process= -c filter.lfs.required=false add -A
  git -c user.email="pages@oasis.local" -c user.name="oasis-pages" `
    -c filter.lfs.smudge= -c filter.lfs.clean= -c filter.lfs.process= -c filter.lfs.required=false `
    commit -m "deploy oasis site"
  git remote add origin https://github.com/seven-err/oasis.git
  git push -f origin gh-pages
}
finally {
  Pop-Location
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

Write-Host "Published to https://seven-err.github.io/oasis/"
