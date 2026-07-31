@echo off
setlocal
title APEX OS 2.0 - Desarrollo
cd /d "%~dp0"

echo ========================================
echo  APEX OS 2.0 - Ambiente de desarrollo
echo ========================================
echo.
echo Iniciando starter controlado de la rama desarrollo...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\start-apexos-desarrollo.ps1"

if errorlevel 1 (
    echo.
    echo ERROR: No fue posible iniciar APEX OS en local.
    echo Revisa el mensaje anterior, corrige el prerequisito indicado y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)

endlocal
