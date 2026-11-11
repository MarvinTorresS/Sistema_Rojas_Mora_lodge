@echo off
REM ==========================================================================
REM  iniciar-sistema.bat - Rojas Mora Sports & Lodge
REM  Levanta en orden: MySQL (Docker) -> backend (API :4000) -> frontend (:5173)
REM  y abre el navegador. Cada servicio corre en su propia ventana para que
REM  sus logs no se mezclen (si algo falla, se ve en que capa fue).
REM ==========================================================================
setlocal
title Rojas Mora - Lanzador
color 0A

REM %~dp0 = carpeta donde vive este .bat (la raiz del repo), termina en "\".
REM Asi el script funciona sin importar desde donde se ejecute.
set "ROOT=%~dp0"

echo.
echo    ____   ___      _   _    ____    __  __  ___  ____      _    
echo   ^|  _ \ / _ \    ^| ^| / \  / ___^|  ^|  \/  ^|/ _ \^|  _ \    / \   
echo   ^| ^|_) ^| ^| ^| ^|_  ^| ^|/ _ \ \___ \  ^| ^|\/^| ^| ^| ^| ^| ^|_) ^|  / _ \  
echo   ^|  _ ^<^| ^|_^| ^| ^|_^| / ___ \ ___) ^| ^| ^|  ^| ^| ^|_^| ^|  _ ^<  / ___ \ 
echo   ^|_^| \_\\___/ \___/_/   \_\____/  ^|_^|  ^|_^|\___/^|_^| \_\/_/   \_\
echo            Sports ^& Lodge  -  Entorno de desarrollo
echo.

REM --- 1) Verificar herramientas requeridas -----------------------------------
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No se encontro pnpm en el PATH. Instalalo con: npm install -g pnpm
    goto :fail
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop no esta corriendo. Abrilo, espera a que cargue
    echo         y vuelve a ejecutar este archivo.
    goto :fail
)

REM --- 2) Base de datos ------------------------------------------------------
REM --wait espera a que el healthcheck de MySQL (docker-compose.yml) reporte
REM "healthy"; sin esto el backend podria arrancar antes que la BD y fallar
REM al conectar con Sequelize.
echo [1/3] Levantando MySQL en Docker...
pushd "%ROOT%"
docker compose up -d --wait
if errorlevel 1 (
    popd
    echo [ERROR] No se pudo levantar el contenedor de MySQL.
    goto :fail
)
popd
echo       MySQL listo.
echo.

REM --- 3) Backend y frontend, cada uno en su ventana -------------------------
REM "start" abre una ventana nueva; "cmd /k" la mantiene abierta al terminar,
REM para poder leer el error si el proceso se cae.
REM Antes de lanzar cada servicio se revisa si su puerto ya tiene un proceso
REM escuchando (por ejemplo, un "pnpm dev" que quedo abierto a mano). Dos
REM procesos no pueden escuchar el mismo puerto: el segundo se caeria con
REM EADDRINUSE (backend) o Vite se moveria solo al 5174 (frontend).
echo [2/3] Iniciando backend (http://localhost:4000)...
call :port_in_use 4000
if not errorlevel 1 (
    echo       [AVISO] El puerto 4000 ya esta en uso: ya hay un backend corriendo.
    echo               No se inicia otro. Si quieres reiniciarlo, cierra la ventana
    echo               o terminal donde corre y vuelve a ejecutar este archivo.
) else (
    start "Rojas Mora - Backend (API :4000)" cmd /k "cd /d "%ROOT%backend" && pnpm dev"
)

echo [3/3] Iniciando frontend (http://localhost:5173)...
call :port_in_use 5173
if not errorlevel 1 (
    echo       [AVISO] El puerto 5173 ya esta en uso: ya hay un frontend corriendo.
    echo               No se inicia otro.
) else (
    start "Rojas Mora - Frontend (Vite :5173)" cmd /k "cd /d "%ROOT%frontend" && pnpm dev"
)

REM --- 4) Abrir el navegador cuando Vite ya este escuchando ------------------
echo.
echo Esperando a que el frontend responda...
powershell -NoProfile -Command "$u='http://localhost:5173'; for($i=0;$i -lt 30;$i++){ try{ Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep 1 } }; exit 1"
if errorlevel 1 (
    echo [AVISO] El frontend no respondio en 30 s. Revisa la ventana "Frontend".
) else (
    start "" http://localhost:5173
)

echo.
echo Listo. Para detener todo: cierra las ventanas Backend y Frontend.
echo (MySQL sigue corriendo en Docker; se detiene con: docker compose stop)
echo.
timeout /t 8 >nul
exit /b 0

:fail
echo.
pause
exit /b 1

REM --------------------------------------------------------------------------
REM  :port_in_use PUERTO
REM  Devuelve errorlevel 0 si hay un proceso ESCUCHANDO en ese puerto, 1 si no.
REM  netstat -ano lista las conexiones; findstr filtra ":PUERTO " seguido de
REM  LISTENING (el espacio evita que :4000 coincida tambien con :40001).
REM --------------------------------------------------------------------------
:port_in_use
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul
exit /b %errorlevel%
