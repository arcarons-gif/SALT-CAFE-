# Servidor local para SALTLAB Calculator - puerto 8080
# Ejecutar: .\servir-local.ps1   (o clic derecho -> Ejecutar con PowerShell)
$puerto = 8080
$ruta = $PSScriptRoot
Write-Host "Iniciando servidor en http://localhost:$puerto" -ForegroundColor Green
Write-Host "Carpeta: $ruta" -ForegroundColor Gray
Write-Host "Pulsa Ctrl+C para detener." -ForegroundColor Gray
Set-Location $ruta
python -m http.server $puerto
