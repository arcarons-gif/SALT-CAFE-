# Instala dependencias (npm install) usando el Node del repo y arranca el servidor.
# Usa el node.exe del repositorio (p. ej. G:\cursor\node.exe); npm debe estar en la misma carpeta.
# Uso: .\install-and-run.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Ruta al node.exe del repo (desde server -> benny-calculator -> fivem -> cursor)
$nodeExe = Join-Path $scriptDir "..\..\..\node.exe"
if ($env:NODE_EXE -and (Test-Path $env:NODE_EXE)) {
    $nodeExe = $env:NODE_EXE
}

if (-not (Test-Path $nodeExe)) {
    Write-Host "No se encuentra node.exe. Esperado en: $nodeExe" -ForegroundColor Red
    Write-Host "Define la ruta: `$env:NODE_EXE = 'G:\cursor\node.exe'" -ForegroundColor Yellow
    exit 1
}

$nodeDir = Split-Path -Parent $nodeExe
$npmCmd = Join-Path $nodeDir "npm.cmd"

if (-not (Test-Path $npmCmd)) {
    Write-Host "En la carpeta del Node no hay npm.cmd: $nodeDir" -ForegroundColor Red
    Write-Host "Necesitas la instalacion completa de Node.js (node + npm) en esa carpeta." -ForegroundColor Yellow
    Write-Host "Descarga el zip de nodejs.org (Windows Binary), extrae en G:\cursor (o tu ruta) y vuelve a ejecutar." -ForegroundColor Yellow
    exit 1
}

# Poner Node (y npm) en el PATH de esta sesion
$env:Path = "$nodeDir;$env:Path"
Set-Location $scriptDir

Write-Host "Instalando dependencias (npm install)..." -ForegroundColor Cyan
& $npmCmd install
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install fallo." -ForegroundColor Red
    exit 1
}

Write-Host "Arrancando servidor..." -ForegroundColor Green
& $nodeExe server.js
