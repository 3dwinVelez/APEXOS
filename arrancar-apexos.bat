@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "NODE_DIR=C:\Program Files\nodejs"
if exist "%NODE_DIR%\node.exe" (
  set "PATH=%NODE_DIR%;%PATH%"
)

echo.
echo ========================================
echo  APEXOS - Arranque local
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta disponible en PATH.
  echo Instala Node.js LTS desde https://nodejs.org y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm.cmd no esta disponible.
  echo Reinstala Node.js LTS marcando la opcion Add to PATH.
  pause
  exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker no esta disponible.
  echo Instala o abre Docker Desktop antes de arrancar el proyecto.
  pause
  exit /b 1
)

echo [1/5] Verificando Docker Desktop...
docker info >nul 2>nul
if errorlevel 1 (
  echo Docker no responde. Intentando iniciar Docker Desktop...
  docker desktop start
  echo Esperando a Docker Desktop...
  timeout /t 20 /nobreak >nul
)

docker info >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker Desktop aun no responde.
  echo Abre Docker Desktop manualmente, espera a que termine de iniciar y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    echo [2/5] Creando .env desde .env.example...
    copy ".env.example" ".env" >nul
  ) else (
    echo [ERROR] No existe .env ni .env.example.
    pause
    exit /b 1
  )
) else (
  echo [2/5] .env encontrado.
)

if not exist "node_modules" (
  echo [3/5] Instalando dependencias...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] Fallo npm install.
    pause
    exit /b 1
  )
) else (
  echo [3/5] Dependencias ya instaladas.
)

echo [4/6] Validando ambiente local...
call npm.cmd run check:local
if errorlevel 1 (
  echo [ERROR] La validacion local fallo.
  pause
  exit /b 1
)

echo [5/6] Preparando Prisma y base de datos...
call npm.cmd run prisma:generate
if errorlevel 1 (
  echo [ERROR] Fallo prisma:generate.
  echo Revisa tu conexion a internet si Prisma necesita descargar motores binarios.
  pause
  exit /b 1
)

call npm.cmd run db:push
if errorlevel 1 (
  echo [ERROR] Fallo db:push.
  pause
  exit /b 1
)

echo [6/6] Arrancando APEXOS...
echo.
echo Web: http://localhost:3001
echo API: http://localhost:3000/health
echo BRAIN: http://localhost:8000/health
echo.
echo Deja esta ventana abierta mientras uses el proyecto.
echo.

call npm.cmd run start:local

pause
