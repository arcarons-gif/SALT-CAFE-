@echo off
cd /d "%~dp0"
echo Eliminando node_modules y package-lock.json...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del package-lock.json
echo Instalando solo express y cors (sin modulos nativos)...
call install-and-run.cmd
