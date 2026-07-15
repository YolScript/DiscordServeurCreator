@echo off
cd /d "%~dp0"

:loop
echo [%date% %time%] Demarrage du bot... >> bot.log
node src\index.js >> bot.log 2>&1
echo [%date% %time%] Bot arrete (code %errorlevel%), relance dans 5 secondes... >> bot.log
timeout /t 5 /nobreak >nul
goto loop
