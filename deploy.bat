@echo off
echo ========================================
echo   PoseAI Website Deployment Script
echo ========================================
echo.

echo Starting local development server...
echo.
echo The website will be available at: http://localhost:8000
echo Press Ctrl+C to stop the server
echo.

REM Try Python 3 first
python -m http.server 8000 2>nul
if %errorlevel% neq 0 (
    echo Python 3 not found, trying Python 2...
    python -m SimpleHTTPServer 8000 2>nul
    if %errorlevel% neq 0 (
        echo Python not found. Please install Python or use another method.
        echo.
        echo Alternative deployment options:
        echo 1. Drag index.html to your browser
        echo 2. Use Node.js: npx serve .
        echo 3. Use PHP: php -S localhost:8000
        echo 4. Deploy to Netlify/Vercel/GitHub Pages
        pause
    )
)
