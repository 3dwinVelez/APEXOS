@echo off
setlocal EnableExtensions
title APEX OS - Inicio local

cd /d "%~dp0"

rem Usa la copia aislada de Node.js 22 instalada para APEX OS.
if exist "%~dp0.tools\node22\node.exe" set "PATH=%~dp0.tools\node22;%PATH%"

echo ========================================
echo          APEX OS - Inicio local
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js no esta instalado.
  echo Instala Node.js 22 LTS y vuelve a ejecutar este archivo.
  goto :error
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if not "%NODE_MAJOR%"=="22" (
  echo ERROR: APEX OS requiere Node.js 22 LTS.
  echo Version detectada:
  node --version
  echo.
  echo Instala o activa Node.js 22 y vuelve a intentarlo.
  goto :error
)

where docker >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker Desktop no esta instalado o no esta en PATH.
  goto :error
)

docker info >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker Desktop no esta iniciado.
  echo Abre Docker Desktop, espera a que termine de arrancar y reintenta.
  goto :error
)

if not exist ".env" (
  echo Creando configuracion local desde .env.example...
  copy /y ".env.example" ".env" >nul
  if errorlevel 1 goto :error
)

if not exist "node_modules\" (
  echo Primera ejecucion: instalando y configurando APEX OS...
  call npm run setup:local
  if errorlevel 1 goto :error
)

echo Cerrando instancias anteriores de APEX OS...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$apexRoot = (Resolve-Path -LiteralPath '.').Path; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like ('*' + $apexRoot + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
if errorlevel 1 (
  echo ERROR: No se pudieron cerrar las instancias anteriores de APEX OS.
  goto :error
)

rem Espera a que npm, nodemon y concurrently terminen de cerrar sus procesos hijos.
ping 127.0.0.1 -n 2 >nul

echo Liberando puertos de APEX OS...
call :free_port 3000
if errorlevel 1 goto :error
call :free_port 3001
if errorlevel 1 goto :error
echo.

echo Iniciando servicios e interfaz...
echo Web: http://localhost:3001
echo API: http://localhost:3000/health
echo.
echo Para detener la aplicacion, presiona Ctrl+C.
echo.
call npm run start:local
if errorlevel 1 goto :error

goto :end

:free_port
set "APEX_PORT=%~1"
set "APEX_FOUND="
for /f "tokens=5" %%P in ('netstat -ano -p tcp ^| findstr /R /C:":%APEX_PORT% .*LISTENING"') do (
  set "APEX_FOUND=1"
  echo Cerrando proceso %%P que usa el puerto %APEX_PORT%...
  taskkill /PID %%P /T /F >nul 2>&1
  if errorlevel 1 (
    echo ERROR: No se pudo cerrar el proceso %%P del puerto %APEX_PORT%.
    exit /b 1
  )
)

if defined APEX_FOUND (
  rem Da tiempo a Windows para liberar el socket despues de cerrar el proceso.
  ping 127.0.0.1 -n 2 >nul
)

netstat -ano -p tcp | findstr /R /C:":%APEX_PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo ERROR: El puerto %APEX_PORT% continua ocupado.
  exit /b 1
)
exit /b 0

:error
echo.
echo No se pudo iniciar APEX OS. Revisa el mensaje anterior.
pause
exit /b 1

:end
endlocal
