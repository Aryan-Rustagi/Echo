# ========================================================
#   Echo - Git Push New Branch and Merge to Main
# ========================================================

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$BranchName = "feature/ui-ux-redesign"
$CommitMsg = "feat(ui): redesign website into premium SaaS with Voice Studio fixes"

Write-Host "`n[1/6] Creating and checking out branch: $BranchName..." -ForegroundColor Cyan
try {
    git checkout -b $BranchName
} catch {
    Write-Host "Branch may already exist, checking out..." -ForegroundColor Yellow
    git checkout $BranchName
}

Write-Host "`n[2/6] Staging files..." -ForegroundColor Cyan
git add .

Write-Host "`n[3/6] Committing changes..." -ForegroundColor Cyan
git commit -m "$CommitMsg"

Write-Host "`n[4/6] Pushing $BranchName to origin..." -ForegroundColor Cyan
git push -u origin $BranchName

Write-Host "`n[5/6] Checking out main and merging $BranchName..." -ForegroundColor Cyan
git checkout main
git pull origin main
git merge $BranchName -m "Merge branch '$BranchName' into main"

Write-Host "`n[6/6] Pushing updated main to origin..." -ForegroundColor Cyan
git push origin main

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  SUCCESS! Branch $BranchName pushed and merged into main." -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Green
