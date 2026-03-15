@echo off
title SALTLAB - Subir cambios al repositorio
cd /d "%~dp0"

echo.
echo  === Subir cambios al repositorio ===
echo  Solo se suben archivos de CODIGO (HTML, JS, CSS, etc.).
echo  Los datos de la web (usuarios, fichajes, reparaciones, clientes)
echo  se mantienen en el servidor y NO se sobrescriben.
echo  Web: https://arcarons-gif.github.io/SALT-CAFE-/
echo  (GitHub Pages puede tardar 1-2 min en actualizar)
echo.

set "GITCMD=git"
where git >nul 2>&1
if errorlevel 1 (
  if exist "C:\Program Files\Git\bin\git.exe" set "GITCMD=C:\Program Files\Git\bin\git.exe"
  if exist "C:\Program Files (x86)\Git\bin\git.exe" set "GITCMD=C:\Program Files (x86)\Git\bin\git.exe"
)
"%GITCMD%" --version >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Git no esta instalado o no se encuentra.
  echo  Instala Git desde https://git-scm.com y marca "Add Git to PATH"
  echo  Luego cierra y vuelve a abrir la terminal.
  echo.
  pause
  exit /b 1
)

echo  Actualizando desde el remoto (para no sobrescribir cambios)...
"%GITCMD%" pull --rebase origin 2>nul
if errorlevel 1 "%GITCMD%" pull origin 2>nul
echo.
echo  Estado actual:
"%GITCMD%" status
echo.

set /p MSG="Mensaje del commit (Enter = 'Actualizar proyecto'): "
if "%MSG%"=="" set MSG=Actualizar proyecto

echo.
echo  Añadiendo solo archivos de codigo (los datos server/data/*.json se ignoran)...
"%GITCMD%" add -A
"%GITCMD%" reset HEAD -- server/data/*.json 2>nul
"%GITCMD%" reset HEAD -- server/data/ 2>nul
echo  Haciendo commit...
"%GITCMD%" commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo  No hay cambios que subir, o el commit falló.
  pause
  exit /b 0
)

echo.
echo  Subiendo a GitHub (origin)...
"%GITCMD%" push origin
if errorlevel 1 (
  echo  Intentando solo: git push
  "%GITCMD%" push
)
if errorlevel 1 (
  echo.
  echo  El push fallo. Comprueba:
  echo  - git remote -v   (debe apuntar al repo de GitHub)
  echo  - Tienes permisos y conexion a internet
  echo  - Si es la primera vez: git push -u origin main
  pause
  exit /b 1
)

echo.
echo  Cambios subidos correctamente.
echo  En 1-2 minutos estaran visibles en: https://arcarons-gif.github.io/SALT-CAFE-/
echo.
pause
