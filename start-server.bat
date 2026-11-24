@echo off
echo Starting LUMORA_BACKBORN Server...
echo -----------------------------------

:: Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this computer!
    echo Please install Node.js from https://nodejs.org/ to run this project.
    pause
    exit /b
)

:: Check if node_modules exists. If not, install dependencies.
if not exist "node_modules\" (
    echo [INFO] First time running on this machine or drive.
    echo [INFO] Installing required project files... please wait.
    call npm install
) else (
    echo [INFO] Project files found.
    :: Optional: You can uncomment the next line to force an update every time, 
    :: but it will make startup slower.
    :: call npm install
)

echo -----------------------------------
echo [INFO] Starting the development server...
echo -----------------------------------
call npm run dev

pause
