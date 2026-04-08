@echo off
echo.
echo ========================================
echo   Speed Gifts - Build and Deploy
echo ========================================
echo.

echo [1/4] Minifying app.js...
call npx terser app.js --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output app.min.js

if %errorlevel% neq 0 (
    echo ERROR: JS Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! app.min.js updated.
echo.

echo [2/4] Minifying style.css...
call npx clean-css-cli -o style.min.css style.css

if %errorlevel% neq 0 (
    echo ERROR: CSS Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! style.min.css updated.
echo.

echo [3/4] Minifying index.dev.html...
call npx html-minifier-terser --collapse-whitespace --remove-comments --minify-css true --minify-js true -o index.html index.dev.html

if %errorlevel% neq 0 (
    echo ERROR: HTML Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! index.html updated.
echo.

echo [4/4] Deploying to Firebase Hosting...
call firebase deploy --only hosting

if %errorlevel% neq 0 (
    echo ERROR: Firebase deploy failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Deploy Complete! Site is live.
echo ========================================
echo.
pause
