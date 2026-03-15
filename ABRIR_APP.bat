@echo off
title SALTLAB - Abrir app
cd /d "%~dp0"
set PUERTO=5500
set URL=http://localhost:%PUERTO%/index.html

echo.
echo  === SALTLAB Calculator ===
echo.

:: Comprobar Node (npx)
where npx >nul 2>&1
if not errorlevel 1 (
  echo  Iniciando servidor con Node en puerto %PUERTO%...
  start /b npx -y serve -l %PUERTO% . >nul 2>&1
  goto :abrir
)

:: Comprobar Python
where python >nul 2>&1
if not errorlevel 1 (
  echo  Iniciando servidor con Python en puerto %PUERTO%...
  start /b python -m http.server %PUERTO% >nul 2>&1
  goto :abrir
)

echo  ERROR: No se encontró Node.js ni Python.
echo  Instala uno de ellos para poder abrir la app:
echo    - Node.js: https://nodejs.org
echo    - Python:  https://python.org
echo.
pause
exit /b 1

:abrir
echo  Esperando servidor...
timeout /t 3 /nobreak >nul
start "" "%URL%"
echo.
echo  App abierta en: %URL%
echo  NO CIERRES esta ventana mientras uses la app.
echo.
pause
