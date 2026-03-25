@echo off
title MyVolleyScout - Server di sviluppo
echo.
echo ========================================
echo   MyVolleyScout - Avvio server locale
echo ========================================
echo.
cd /d "%~dp0"
echo Avvio del server sulla porta 3000...
echo Apri il browser su: http://localhost:3000
echo.
echo Premi CTRL+C per fermare il server.
echo.
npx serve -l 3000 .
pause
