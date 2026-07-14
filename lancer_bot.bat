@echo off
cd /d "%~dp0"

:loop
echo [%date% %time%] Demarrage du bot...
node src\index.js
echo [%date% %time%] Bot arrete (code %errorlevel%), relance dans 5 secondes...
timeout /t 5 /nobreak >nul
goto loop
