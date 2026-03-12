#!/bin/bash
# Script para subir todos los cambios del proyecto al repositorio (GitHub).
# Ejecutar desde la raíz del proyecto: chmod +x subir-cambios.sh && ./subir-cambios.sh

set -e
cd "$(dirname "$0")"

echo "=== Subir cambios SALTLAB Calculator ==="
echo ""

echo "Estado del repositorio:"
git status
echo ""

git add -A

if [ -z "$(git status --short)" ]; then
  echo "No hay cambios que subir. El repositorio está al día."
  exit 0
fi

echo "Archivos que se subirán:"
git status --short
echo ""

git commit -m "Actualizar proyecto: instrucciones, config, backend y datos"

echo ""
echo "Enviando a GitHub (git push)..."
git push

echo ""
echo "Listo. Cambios subidos correctamente."
