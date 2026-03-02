@echo off
title SALTLAB - Abrir app
cd /d "%~dp0"

:: Iniciar servidor en una ventana nueva (puerto 5500 para evitar conflictos con 8080)
start "Servidor SALTLAB" cmd /k "python -m http.server 5500"

:: Esperar a que el servidor arranque y abrir el navegador
timeout /t 2 /nobreak >nul
start http://localhost:5500/index.html

echo.
echo  App abierta en: http://localhost:5500/index.html
echo  No cierres la ventana "Servidor SALTLAB" mientras uses la app.
echo.
pause
