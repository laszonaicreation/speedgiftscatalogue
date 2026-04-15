@echo off
echo.
echo ========================================
echo   Speed Gifts - Build and Deploy
echo ========================================
echo.

echo [1/5] Minifying app.js...
call npx terser app.js --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output app.min.js

if %errorlevel% neq 0 (
    echo ERROR: JS Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! app.min.js updated.
echo.

echo [1a] Minifying app-slider.js...
call npx terser app-slider.js --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output app-slider.min.js

if %errorlevel% neq 0 (
    echo ERROR: app-slider.js Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! app-slider.min.js updated.
echo.

echo [1ab] Minifying app-spotlight.js...
call npx terser app-spotlight.js --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output app-spotlight.min.js

if %errorlevel% neq 0 (
    echo ERROR: app-spotlight.js Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! app-spotlight.min.js updated.
echo.

echo [1b] Minifying app-insights.js...
call npx terser app-insights.js --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output app-insights.min.js

if %errorlevel% neq 0 (
    echo ERROR: app-insights.js Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! app-insights.min.js updated.
echo.

echo [1c] Minifying app-popup.js...
call npx terser app-popup.js --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output app-popup.min.js

if %errorlevel% neq 0 (
    echo ERROR: app-popup.js Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! app-popup.min.js updated.
echo.

echo [2/6] Minifying home-ui.js...
call npx terser home-ui.js --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output home-ui.min.js

if %errorlevel% neq 0 (
    echo ERROR: Home UI JS Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! home-ui.min.js updated.
echo.

echo [3/6] Minifying shop.js...
call npx terser shop.js --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output shop.min.js

if %errorlevel% neq 0 (
    echo ERROR: Shop JS Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! shop.min.js updated.
echo.

echo [4/7] Minifying product-detail-page.js...
call npx terser product-detail-page.js --module --compress passes=3,drop_console=false,pure_getters=true --mangle --output product-detail-page.min.js

if %errorlevel% neq 0 (
    echo ERROR: Product Detail JS Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! product-detail-page.min.js updated.
echo.

echo [5/7] Minifying style.css...
call npx clean-css-cli -o style.min.css style.css

if %errorlevel% neq 0 (
    echo ERROR: CSS Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! style.min.css updated.
echo.

echo [6/7] Minifying index.dev.html...
call npx html-minifier-terser --collapse-whitespace --remove-comments --minify-css true --minify-js true -o index.html index.dev.html

if %errorlevel% neq 0 (
    echo ERROR: HTML Minification failed! Deploy cancelled.
    pause
    exit /b 1
)
echo Done! index.html updated.
echo.

echo [7/7] Deploying to Firebase Hosting...
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
