@echo off
echo ========================================================
echo   Echo - Git Push New Branch and Merge to Main
echo ========================================================

cd /d "%~dp0"

set BRANCH_NAME=feature/ui-ux-redesign
set COMMIT_MSG=feat(ui): redesign website into premium SaaS with Voice Studio fixes

echo.
echo [1/6] Creating and checking out branch: %BRANCH_NAME%...
git checkout -b %BRANCH_NAME%
if %ERRORLEVEL% NEQ 0 (
    echo Switching to existing branch %BRANCH_NAME%...
    git checkout %BRANCH_NAME%
)

echo.
echo [2/6] Staging modified files...
git add .

echo.
echo [3/6] Committing changes...
git commit -m "%COMMIT_MSG%"

echo.
echo [4/6] Pushing %BRANCH_NAME% to origin...
git push -u origin %BRANCH_NAME%
if %ERRORLEVEL% NEQ 0 (
    echo Error pushing branch %BRANCH_NAME%. Please check your credentials/network.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [5/6] Checking out main and merging %BRANCH_NAME%...
git checkout main
git pull origin main
git merge %BRANCH_NAME% -m "Merge branch '%BRANCH_NAME%' into main"

echo.
echo [6/6] Pushing updated main to origin...
git push origin main
if %ERRORLEVEL% NEQ 0 (
    echo Error pushing main. Please check your credentials/network.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo ========================================================
echo   SUCCESS! Branch %BRANCH_NAME% created, pushed, and merged into main.
echo ========================================================
pause
