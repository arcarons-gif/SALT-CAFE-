# Arranca el API usando el node.exe del repositorio (G:\cursor\node.exe)
# Uso: .\run-server.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeExe = Join-Path $scriptDir "..\..\..\node.exe"

if (-not (Test-Path $nodeExe)) {
    Write-Host "No se encuentra node.exe en: $nodeExe" -ForegroundColor Red
    Write-Host "Puedes definir la ruta con: `$env:NODE_EXE = 'G:\cursor\node.exe'" -ForegroundColor Yellow
    if ($env:NODE_EXE -and (Test-Path $env:NODE_EXE)) {
        $nodeExe = $env:NODE_EXE
    } else {
        exit 1
    }
}

Set-Location $scriptDir
& $nodeExe server.js
