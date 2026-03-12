# Script para subir todos los cambios del proyecto al repositorio (GitHub).
# Ejecutar desde la raíz del proyecto: .\subir-cambios.ps1
# O desde PowerShell: & "g:\cursor\fivem\SALTLAB-calculator\subir-cambios.ps1"

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== Subir cambios SALTLAB Calculator ===" -ForegroundColor Cyan
Write-Host ""

# Ver estado
Write-Host "Estado del repositorio:" -ForegroundColor Yellow
git status
Write-Host ""

# Añadir todos los archivos modificados y nuevos (no incluye .gitignore)
git add -A

$status = git status --short
if (-not $status) {
    Write-Host "No hay cambios que subir. El repositorio está al día." -ForegroundColor Green
    exit 0
}

Write-Host "Archivos que se subirán:" -ForegroundColor Yellow
git status --short
Write-Host ""

# Commit con mensaje por defecto (puedes editarlo abajo)
$mensaje = "Actualizar proyecto: instrucciones, config, backend y datos"
git commit -m $mensaje

if ($LASTEXITCODE -ne 0) {
    Write-Host "No se hizo commit (puede que no hubiera cambios tras add)." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Enviando a GitHub (git push)..." -ForegroundColor Yellow
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Listo. Cambios subidos correctamente." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Error al hacer push. Comprueba tu conexión y que tengas permisos en el repo." -ForegroundColor Red
    exit 1
}
