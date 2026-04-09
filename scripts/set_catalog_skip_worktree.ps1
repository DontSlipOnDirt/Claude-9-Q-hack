# Tell Git to ignore local edits under frontend/public/catalog (skip-worktree).
# Use before merging/committing so bugged or experimental images are not staged.
# To pull catalog updates from origin/main, run unset_catalog_skip_worktree.ps1 first.
Set-Location (Split-Path $PSScriptRoot -Parent)
git ls-files "frontend/public/catalog" | ForEach-Object {
    git update-index --skip-worktree -- $_
}
Write-Host "skip-worktree set on catalog files."
