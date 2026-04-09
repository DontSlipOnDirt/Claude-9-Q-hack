# Clear skip-worktree on catalog so git pull / merge can update those files.
Set-Location (Split-Path $PSScriptRoot -Parent)
git ls-files "frontend/public/catalog" | ForEach-Object {
    git update-index --no-skip-worktree -- $_
}
Write-Host "skip-worktree cleared on catalog files."
