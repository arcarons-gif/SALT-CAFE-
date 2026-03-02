/**
 * Lee el Excel de registro vehicular y actualiza la BBDD de clientes
 * (clientes-seed.js, repositorio/clientes.json, repositorio/clientes.csv).
 * Uso: node import-excel-clientes.js
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = 'E:\\Descargas\\Registro_Vehicular_vehiculos_FINAL_v3.xlsx';
const REPO_PATH = path.join(__dirname, '..', 'input', 'bbdd clientes', 'repositorio');
const SEED_PATH = path.join(__dirname, '..', 'data', 'clientes-seed.js');

// Mapeo flexible de cabeceras Excel -> nuestro formato
function normalizeKey(key) {
  if (!key || typeof key !== 'string') return '';
  const k = key.toString().trim().toLowerCase()
    .replace(/ó/g, 'o').replace(/í/g, 'i').replace(/á/g, 'a').replace(/é/g, 'e').replace(/ú/g, 'u')
    .replace(/\s+/g, ' ');
  return k;
}

function getCell(row, possibleKeys) {
  for (const pk of possibleKeys) {
    const found = Object.keys(row).find(k => normalizeKey(k) === normalizeKey(pk));
    if (found !== undefined && row[found] !== undefined && row[found] !== null && row[found] !== '') {
      const v = row[found];
      return typeof v === 'string' ? v.trim() : String(v).trim();
    }
  }
  return '';
}

function run() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error('No se encuentra el archivo:', EXCEL_PATH);
    process.exit(1);
  }

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  if (!raw.length) {
    console.error('La hoja está vacía.');
    process.exit(1);
  }

  // Posibles nombres de columnas en el Excel
  const map = {
    matricula: ['matricula', 'matrícula', 'Matricula', 'Matrícula', 'MATRICULA', 'placa'],
    placaPolicial: ['placa policial', 'placa_policial', 'Placa policial', 'placa servicio'],
    codigoVehiculo: ['código vehiculo', 'codigo vehiculo', 'Código vehiculo', 'codigo_vehiculo', 'codigo', 'modelo'],
    nombreVehiculo: ['nombre vehiculo', 'nombre_vehiculo', 'Nombre vehiculo', 'nombre vehiculo', 'nombre', 'nombre ic'],
    categoria: ['categoria', 'Categoria', 'categoría', 'Categoría'],
    convenio: ['convenio', 'Convenio'],
  };

  const clientes = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    const matricula = getCell(row, map.matricula);
    if (!matricula) continue; // saltar filas sin matrícula
    clientes.push({
      matricula,
      placaPolicial: getCell(row, map.placaPolicial) || '-',
      codigoVehiculo: getCell(row, map.codigoVehiculo) || '',
      nombreVehiculo: getCell(row, map.nombreVehiculo) || '',
      categoria: getCell(row, map.categoria) || '',
      convenio: getCell(row, map.convenio) || '',
    });
  }

  console.log('Registros leídos:', clientes.length);
  if (clientes.length === 0) {
    console.log('Primera fila (cabeceras):', JSON.stringify(Object.keys(raw[0])));
    process.exit(1);
  }

  // Formato para seed (JS)
  const seedLines = [
    '/**',
    ' * Carga inicial del registro de clientes (repositorio input/bbdd clientes).',
    ' * Si la BBDD está vacía, se rellena con estos datos al cargar la app.',
    ' * Generado desde Registro_Vehicular_vehiculos_FINAL_v3.xlsx',
    ' */',
    'const CLIENTES_SEED = [',
    ...clientes.map(c =>
      '  { matricula: "' + (c.matricula || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') +
      '", placaPolicial: "' + (c.placaPolicial || '-').replace(/"/g, '\\"') +
      '", codigoVehiculo: "' + (c.codigoVehiculo || '').replace(/"/g, '\\"') +
      '", nombreVehiculo: "' + (c.nombreVehiculo || '').replace(/"/g, '\\"') +
      '", categoria: "' + (c.categoria || '').replace(/"/g, '\\"') +
      '", convenio: "' + (c.convenio || '').replace(/"/g, '\\"') + '" },'
    ),
    '];',
  ];

  // Formato JSON (repositorio) - con cabeceras estilo original
  const jsonRecords = clientes.map((c, idx) => ({
    'Nº': idx + 1,
    'Matricula': c.matricula,
    'Placa policial': c.placaPolicial,
    'Código vehiculo': c.codigoVehiculo,
    'Nombre vehiculo': c.nombreVehiculo,
    'Categoria': c.categoria,
    'Convenio': c.convenio,
  }));

  // CSV (repositorio) - separador ;, cabecera
  const csvHeader = 'Nº;Matricula;Placa policial;Código vehiculo;Nombre vehiculo;Categoria;Convenio';
  const csvRows = jsonRecords.map((r, i) =>
    [i + 1, r.Matricula, r['Placa policial'], r['Código vehiculo'], r['Nombre vehiculo'], r.Categoria, r.Convenio]
      .map(v => (typeof v === 'string' && v.includes(';') ? '"' + v.replace(/"/g, '""') + '"' : v))
      .join(';')
  );
  const csvContent = [csvHeader, ...csvRows].join('\n');

  if (!fs.existsSync(REPO_PATH)) fs.mkdirSync(REPO_PATH, { recursive: true });

  fs.writeFileSync(SEED_PATH, seedLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(REPO_PATH, 'clientes.json'), JSON.stringify(jsonRecords, null, 2), 'utf8');
  fs.writeFileSync(path.join(REPO_PATH, 'clientes.csv'), '\uFEFF' + csvContent, 'utf8'); // BOM UTF-8

  console.log('Actualizado: data/clientes-seed.js');
  console.log('Actualizado: input/bbdd clientes/repositorio/clientes.json');
  console.log('Actualizado: input/bbdd clientes/repositorio/clientes.csv');
}

run();
