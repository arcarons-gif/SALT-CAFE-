/**
 * Lee el Excel de vehículos (input/Calculadora Genesis Community V3.xlsx) y actualiza
 * data/vehiculos.js con el listado, precios y rutas de fotos en miniatura.
 * Uso: desde carpeta server → node import-excel-vehiculos.js
 * Requiere: npm install xlsx (en la carpeta server)
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_PATH = path.join(__dirname, '..', 'input', 'Calculadora Genesis Community V3.xlsx');
const VEHICULOS_JS_PATH = path.join(__dirname, '..', 'data', 'vehiculos.js');

function normalizeKey(key) {
  if (!key || typeof key !== 'string') return '';
  return key.toString().trim().toLowerCase()
    .replace(/ó/g, 'o').replace(/í/g, 'i').replace(/á/g, 'a').replace(/é/g, 'e').replace(/ú/g, 'u')
    .replace(/\s+/g, ' ');
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

function getCellNumber(row, possibleKeys) {
  const v = getCell(row, possibleKeys);
  if (v === '') return 0;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

const FIVEM_IMG_BASE = 'https://docs.fivem.net/vehicles/';
const FULL_TUNING_POR_CATEGORIA = {
  'Bicicletas': 5000, 'Circuitos': 100000, 'Compactos': 12000, 'Coupes': 15000,
  'Deportivo': 65000, 'Deportivo clasico': 45000, 'Furgonetas': 35000,
  'Motos': 52000, 'Muscle': 55000, 'Sedans': 18000, 'SUV': 25000, 'SUVs': 25000,
  'Super': 75000, 'Superdeportivo': 75000, 'Todoterrenos': 60000, 'VIP': 80000,
  'default': 40000
};

function run() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error('No se encuentra el Excel:', EXCEL_PATH);
    console.error('Coloca el archivo "Calculadora Genesis Community V3.xlsx" en la carpeta input.');
    process.exit(1);
  }

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames.includes('Listado') ? 'Listado' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, header: 1 });

  console.log('Hojas:', workbook.SheetNames.join(', '));
  console.log('Usando hoja:', sheetName);

  let data = [];
  if (raw.length > 0 && Array.isArray(raw[0])) {
    const headerRow = raw[0].map((c, i) => (c != null && String(c).trim() !== '' ? String(c).trim() : 'col' + i));
    for (let i = 1; i < raw.length; i++) {
      const row = {};
      (raw[i] || []).forEach((cell, j) => {
        row[headerRow[j] || 'col' + j] = cell != null ? String(cell).trim() : '';
      });
      data.push(row);
    }
  } else {
    data = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }

  if (!data.length) {
    console.error('La hoja está vacía o no se pudieron leer filas.');
    if (raw.length > 0) console.log('Primeras 2 filas crudas:', JSON.stringify(raw.slice(0, 2)));
    process.exit(1);
  }

  const raw2 = data;
  console.log('Primera fila (cabeceras):', Object.keys(raw2[0]).join(' | '));
  if (raw2.length > 1) console.log('Segunda fila (ejemplo):', JSON.stringify(raw2[1]));

  const map = {
    modelo: ['modelo', 'codigo', 'código', 'codigo vehiculo', 'code', 'spawn name', 'id', 'w'],
    nombreIC: ['nombre', 'nombre ic', 'nombreic', 'nombre vehiculo', 'nombre vehículo', 'display name', 'label', '__empty', '__empty_1'],
    categoria: ['categoria', 'categoría', 'category', 'tipo', 'clase', '__empty_2', '__empty_3'],
    precioBase: ['precio', 'precio base', 'preciobase', 'valor', 'precio base', 'price', 'valor coche', '__empty_4', '__empty_5'],
    imagen: ['fotos', 'imagen', 'imagenurl', 'foto', 'url', 'thumbnail', 'miniatura', 'ruta', 'imagen url', '__empty_6', '__empty_7'],
  };

  const vehiculos = [];
  const seenModelo = new Set();

  for (let i = 0; i < raw2.length; i++) {
    const row = raw2[i];
    const modelo = getCell(row, map.modelo);
    if (!modelo) continue;
    const modeloNorm = modelo.toLowerCase().replace(/\s+/g, '');
    if (seenModelo.has(modeloNorm)) continue;
    seenModelo.add(modeloNorm);

    const nombreIC = getCell(row, map.nombreIC) || modelo;
    let categoria = getCell(row, map.categoria) || 'default';
    const precioBase = getCellNumber(row, map.precioBase);
    let imagenUrl = getCell(row, map.imagen);

    if (!imagenUrl && modelo) {
      imagenUrl = FIVEM_IMG_BASE + modelo + '.webp';
    } else if (imagenUrl && !imagenUrl.startsWith('http') && !imagenUrl.startsWith('/')) {
      imagenUrl = imagenUrl.replace(/\\/g, '/');
      if (!imagenUrl.startsWith('input/') && !imagenUrl.startsWith('CONTENT/')) {
        imagenUrl = 'input/CONTENT/' + (imagenUrl.startsWith('Pictures/') ? '' : 'Pictures/') + imagenUrl;
      }
    }

    const catNorm = categoria.charAt(0).toUpperCase() + categoria.slice(1).toLowerCase();
    const fullTuning = FULL_TUNING_POR_CATEGORIA[catNorm] || FULL_TUNING_POR_CATEGORIA[categoria] || FULL_TUNING_POR_CATEGORIA.default;

    vehiculos.push({
      modelo: modeloNorm,
      nombreIC: nombreIC,
      categoria: catNorm,
      precioBase: precioBase,
      fullTuningPrecio: fullTuning,
      imagenUrl: imagenUrl || (FIVEM_IMG_BASE + modeloNorm + '.webp'),
    });
  }

  console.log('Vehículos leídos:', vehiculos.length);
  if (vehiculos.length === 0) {
    console.log('No se encontraron filas con modelo. Revisa los nombres de columnas en el Excel.');
    process.exit(1);
  }

  const byCategory = {};
  vehiculos.forEach(v => {
    const c = v.categoria || 'Otros';
    if (!byCategory[c]) byCategory[c] = [];
    byCategory[c].push(v);
  });

  const lines = [
    '/**',
    ' * Base de datos de vehículos - SALTLAB CAFE',
    ' * Generado desde input/Calculadora Genesis Community V3.xlsx',
    ' * imagenUrl: FiveM docs o ruta local (input/CONTENT/...).',
    ' */',
    "const FIVEM_IMG_BASE = 'https://docs.fivem.net/vehicles/';",
    '',
    'function imgUrl(modelo) {',
    "  return modelo ? (FIVEM_IMG_BASE + modelo + '.webp') : '';",
    '}',
    '',
    'const FULL_TUNING_POR_CATEGORIA = ' + JSON.stringify(FULL_TUNING_POR_CATEGORIA, null, 2).replace(/\n/g, '\n') + ';',
    '',
    'const VEHICULOS_DB = [',
  ];

  function esc(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  Object.keys(byCategory).sort().forEach(cat => {
    lines.push('  // === ' + cat + ' ===');
    byCategory[cat].forEach(v => {
      const hasCustomImg = v.imagenUrl && (v.imagenUrl.startsWith('http') || v.imagenUrl.startsWith('/') || v.imagenUrl.startsWith('input/') || v.imagenUrl.startsWith('CONTENT/'));
      const imgExpr = hasCustomImg ? "'" + esc(v.imagenUrl) + "'" : "imgUrl('" + esc(v.modelo) + "')";
      lines.push(
        "  { modelo: '" + esc(v.modelo) + "', nombreIC: '" + esc(v.nombreIC) + "', categoria: '" + esc(v.categoria) + "', precioBase: " + (v.precioBase || 0) + ", fullTuningPrecio: " + (v.fullTuningPrecio || FULL_TUNING_POR_CATEGORIA.default) + ", imagenUrl: " + imgExpr + " },"
      );
    });
    lines.push('');
  });

  lines.push('];');
  lines.push('');
  lines.push('// Precios pintura camaleónica por categoría');
  lines.push('const PINTURA_CAMALEONICA_PRECIO = {');
  lines.push("  'Bicicletas': 5000, 'Circuitos': 80000, 'Compactos': 10000, 'Coupes': 15000,");
  lines.push("  'Deportivo': 25000, 'Deportivo clasico': 22000, 'Furgonetas': 18000,");
  lines.push("  'Motos': 15000, 'Muscle': 22000, 'Sedans': 22000, 'SUV': 28000, 'SUVs': 28000,");
  lines.push("  'Super': 45000, 'Superdeportivo': 45000, 'Todoterrenos': 28000, 'VIP': 50000,");
  lines.push("  'default': 20000");
  lines.push('};');
  lines.push('');

  fs.writeFileSync(VEHICULOS_JS_PATH, lines.join('\n'), 'utf8');
  console.log('Actualizado: data/vehiculos.js');
}

run();
