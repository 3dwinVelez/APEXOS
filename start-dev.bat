@echo off
title APEX OS 2.0 - Development
cd /d "%~dp0"
setlocal enabledelayedexpansion

echo ========================================
echo  APEX OS 2.0 - Development Mode
echo ========================================
echo.

:: =============================================================================
:: PRE-FLIGHT CHECKS
:: =============================================================================

echo [Pre-flight] Verificando Node.js 22.x...
node -e "process.exit(+process.versions.node.split('.')[0]===22?0:1)" 2>nul
if errorlevel 1 (
    echo   ERROR: Se requiere Node.js 22.x
    echo   Version actual:
    node --version 2>nul || echo   Node.js no encontrado
    echo.
    echo   Instala con: nvm install 22 ^&^& nvm use 22
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo   %%v OK

echo [Pre-flight] Verificando Docker Desktop...
docker info >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Docker Desktop no esta corriendo.
    echo   Abrelo y espera a que el engine este listo.
    pause
    exit /b 1
)
echo   Docker OK

if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env >nul
        echo [Pre-flight] .env creado desde .env.example
    ) else (
        echo ERROR: No existe .env ni .env.example
        pause
        exit /b 1
    )
)

:: =============================================================================
:: STEP 1 — Instalar dependencias
:: =============================================================================
echo.
echo [1/5] Dependencias npm...
if not exist "node_modules" (
    echo   Instalando...
    call npm install
    if errorlevel 1 (
        echo   ERROR: npm install fallo
        pause
        exit /b 1
    )
    echo   Instaladas
) else (
    echo   OK
)

:: =============================================================================
:: STEP 2 — Generar Prisma Client (con reintento en Windows por bloqueo de archivos)
:: =============================================================================
echo.
echo [2/5] Generando Prisma Client...
set RETRIES=0
:prisma_generate
npx prisma generate --schema=apps/api/prisma/schema.prisma 2>&1
if errorlevel 1 (
    set /a RETRIES+=1
    if !RETRIES! lss 3 (
        echo   Reintentando (!RETRIES!/3)...
        timeout /t 2 /nobreak >nul
        goto prisma_generate
    )
    echo   ERROR: No se pudo generar Prisma Client
    pause
    exit /b 1
)
echo   Prisma Client OK

:: =============================================================================
:: STEP 3 — Levantar infraestructura Docker
:: =============================================================================
echo.
echo [3/5] Infraestructura Docker...
docker compose -f infra/docker-compose.yml up -d postgres redis minio brain 2>&1
if errorlevel 1 (
    echo   ERROR: Docker Compose fallo
    pause
    exit /b 1
)

echo   Esperando PostgreSQL...
set WAIT=0
:wait_pg
timeout /t 2 /nobreak >nul
set /a WAIT+=1
docker compose -f infra/docker-compose.yml exec -T postgres pg_isready -U apex >nul 2>&1
if errorlevel 1 (
    if !WAIT! geq 30 (
        echo   ERROR: PostgreSQL no respondio tras 60s
        pause
        exit /b 1
    )
    goto wait_pg
)
echo   PostgreSQL lista

:: =============================================================================
:: STEP 4 — Sincronizar base de datos
:: =============================================================================
echo.
echo [4/5] Sincronizando base de datos...
npx prisma db push --schema=apps/api/prisma/schema.prisma --skip-generate 2>&1
if errorlevel 1 (
    echo   ERROR: No se pudo sincronizar la base de datos
    pause
    exit /b 1
)
echo   Base de datos sincronizada

:: =============================================================================
:: STEP 5 — Iniciar API y Web
:: =============================================================================
echo.
echo [5/5] Iniciando servicios...

:: Liberar puertos anteriores si estan ocupados
echo   Limpiando puertos 3000, 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R ":3000 .*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R ":3001 .*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo   Iniciando API (puerto 3000)...
start "APEX API" cmd /c "title APEX API && cd /d "%~dp0" && npm run dev:api"

echo   Iniciando Web (puerto 3001)...
start "APEX Web" cmd /c "title APEX Web && cd /d "%~dp0" && npm run dev:web"

echo.
echo ========================================
echo  Todo listo.
echo    API:  http://127.0.0.1:3000
echo    Web:  http://127.0.0.1:3001
echo ========================================
echo.
echo  Para ver logs revisa las ventanas abiertas.
echo  Para detener cierra las ventanas de API y Web.
echo.
pause
exit /b 0
