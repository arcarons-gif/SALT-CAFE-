@echo off
cd /d "%~dp0server"

if not exist "server.js" (
    echo No se encuentra server.js en la carpeta server.
    pause
    exit /b 1
)

start "SALTLAB Backend API" cmd /k "title SALTLAB - Backend API (puerto 3001) && echo. && echo  Backend en http://localhost:3001 && echo  Otros PC: http://[TU-IP]:3001 && echo  No cierres esta ventana. && echo. && node server.js"

echo.
echo  Backend arrancado en una ventana nueva (puerto 3001).
echo  Indica en la app la URL: http://localhost:3001
echo  (Desde otro PC: http://[IP-de-este-ordenador]:3001)
echo.
pause
