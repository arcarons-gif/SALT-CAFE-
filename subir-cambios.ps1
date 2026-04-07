# Subir cambios a GitHub (actualiza la web en GitHub Pages tras 1-2 min).
# Ejecutar en la raíz del proyecto: .\subir-cambios.ps1
# Política de ejecución si falla: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$git = "git"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    $candidates = @(
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files\Git\bin\git.exe"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { $git = $p; break }
    }
}

Write-Host ""
Write-Host "=== Subir cambios al repositorio (SALTLAB) ===" -ForegroundColor Cyan
Write-Host "Web: https://arcarons-gif.github.io/SALT-CAFE-/" -ForegroundColor Gray
Write-Host "Los JSON de server/data no se incluyen en el commit (datos locales/servidor)." -ForegroundColor Gray
Write-Host ""

Write-Host "Actualizando desde remoto (pull)..." -ForegroundColor Yellow
& $git pull --rebase origin 2>$null
if ($LASTEXITCODE -ne 0) { & $git pull origin 2>$null }

Write-Host ""
Write-Host "Estado:" -ForegroundColor Yellow
& $git status
Write-Host ""

$msg = Read-Host "Mensaje del commit [Enter = Actualizar proyecto]"
if ([string]::IsNullOrWhiteSpace($msg)) { $msg = "Actualizar proyecto" }

Write-Host ""
Write-Host "Añadiendo cambios (excluyendo server/data del staging)..." -ForegroundColor Yellow
& $git add -A
& $git reset HEAD -- "server/data/*.json" 2>$null
& $git reset HEAD -- "server/data/" 2>$null

& $git commit -m $msg
if ($LASTEXITCODE -ne 0) {
    Write-Host "No hay cambios que commitear o el commit falló." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Subiendo a GitHub..." -ForegroundColor Yellow
& $git push origin
if ($LASTEXITCODE -ne 0) { & $git push }

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Listo. GitHub Pages suele actualizar en 1-2 minutos." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Error en push. Revisa: git remote -v, SSH/HTTPS y rama (main)." -ForegroundColor Red
    exit 1
}
