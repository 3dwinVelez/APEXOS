@echo off
setlocal
title APEX Control Tower
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado o no esta en PATH.
  echo Instala Node.js 22 o superior y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

echo Iniciando APEX Control Tower en http://127.0.0.1:4310
echo La torre vigila APEXOS desde fuera de la aplicacion. No hagas push, merge ni deploy desde aqui.
echo Para detenerla usa Ctrl+C.
echo.

start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4310'"

node "apps\control-tower\server.js"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
echo APEX Control Tower finalizo con codigo %EXIT_CODE%.
pause
endlocal
exit /b %EXIT_CODE%
