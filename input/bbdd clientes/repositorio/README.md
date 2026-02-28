# Repositorio BBDD Clientes — Salt Lab Cafe / LSCM

Repositorio generado a partir de las capturas de pantalla de clientes y matrículas registrados.  
**Uso:** apertura de un taller nuevo; no se incluyen datos históricos de otro taller.

## Cabecera (respetar en importación)

| Columna            | Descripción                          |
|--------------------|--------------------------------------|
| **Nº**             | Número de registro (índice)          |
| **Matricula**      | Matrícula del vehículo               |
| **Placa policial** | Placa de servicio (policía/EMS) o -  |
| **Código vehiculo**| Código interno del modelo            |
| **Nombre vehiculo**| Nombre del vehículo / modelo         |
| **Categoria**      | Categoría (Compactos, Motos, VIP…)  |
| **Convenio**       | Convenio o entidad (SAPD, N/A, etc.) |

## Columnas excluidas (no se exportan)

- Fecha primera interacción  
- Fecha ultima actualización  
- Interacciones  
- Total invertido  

Estas columnas corresponden al taller anterior y para el nuevo taller quedan vacías.

## Archivos

- **clientes.json** — Dataset completo: 100 registros extraídos de las capturas (columnas indicadas).
- **clientes.csv** — Muestra con la misma cabecera (separador `;`, UTF-8). El conjunto completo está en `clientes.json`.
- **schema.json** — Definición de la cabecera y columnas excluidas.
