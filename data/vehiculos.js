/**
 * Base de datos de vehículos - SALTLAB CAFE
 * Fuente: tablas con modelo, nombre, precio, categoría, imagen.
 * imagenUrl = https://docs.fivem.net/vehicles/{modelo}.webp (documentación FiveM).
 * Si la foto no carga, la app muestra fallback "Sin imagen".
 */
const FIVEM_IMG_BASE = 'https://docs.fivem.net/vehicles/';

function imgUrl(modelo) {
  return modelo ? (FIVEM_IMG_BASE + modelo + '.webp') : '';
}

// fullTuningPrecio por categoría (usado cuando no se define por vehículo)
const FULL_TUNING_POR_CATEGORIA = {
  'Bicicletas': 5000, 'Circuitos': 100000, 'Compactos': 12000, 'Coupes': 15000,
  'Deportivo': 65000, 'Deportivo clasico': 45000, 'Furgonetas': 35000,
  'Motos': 52000, 'Muscle': 55000, 'Sedans': 18000, 'SUV': 25000, 'SUVs': 25000,
  'Super': 75000, 'Superdeportivo': 75000, 'Todoterrenos': 60000, 'VIP': 80000,
  'default': 40000
};

const VEHICULOS_DB = [
  // === Bicicletas ===
  { modelo: 'bmx', nombreIC: 'BMX', categoria: 'Bicicletas', precioBase: 1500, fullTuningPrecio: 5000, imagenUrl: imgUrl('bmx') },
  { modelo: 'cruiser', nombreIC: 'Cruiser', categoria: 'Bicicletas', precioBase: 2500, fullTuningPrecio: 5000, imagenUrl: imgUrl('cruiser') },
  { modelo: 'fixter', nombreIC: 'Fixter', categoria: 'Bicicletas', precioBase: 2000, fullTuningPrecio: 5000, imagenUrl: imgUrl('fixter') },

  // === Circuitos ===
  { modelo: 'formula', nombreIC: 'PR4', categoria: 'Circuitos', precioBase: 1000000, fullTuningPrecio: 100000, imagenUrl: imgUrl('formula') },
  { modelo: 'openwheel1', nombreIC: 'BR8', categoria: 'Circuitos', precioBase: 1000000, fullTuningPrecio: 100000, imagenUrl: imgUrl('openwheel1') },

  // === Compactos ===
  { modelo: 'asbo', nombreIC: 'Asbo', categoria: 'Compactos', precioBase: 2500, fullTuningPrecio: 12000, imagenUrl: imgUrl('asbo') },
  { modelo: 'blista', nombreIC: 'Blista', categoria: 'Compactos', precioBase: 8000, fullTuningPrecio: 12000, imagenUrl: imgUrl('blista') },
  { modelo: 'issi2', nombreIC: 'Issi', categoria: 'Compactos', precioBase: 150000, fullTuningPrecio: 12000, imagenUrl: imgUrl('issi2') },
  { modelo: 'kanjo', nombreIC: 'Blista Kanjo', categoria: 'Compactos', precioBase: 45000, fullTuningPrecio: 12000, imagenUrl: imgUrl('kanjo') },
  { modelo: 'panto', nombreIC: 'Panto', categoria: 'Compactos', precioBase: 85000, fullTuningPrecio: 12000, imagenUrl: imgUrl('panto') },

  // === Coupes ===
  { modelo: 'broadway', nombreIC: 'Broadway', categoria: 'Coupes', precioBase: 95000, fullTuningPrecio: 15000, imagenUrl: imgUrl('broadway') },
  { modelo: 'champion', nombreIC: 'Champion', categoria: 'Coupes', precioBase: 125000, fullTuningPrecio: 15000, imagenUrl: imgUrl('champion') },
  { modelo: 'f620', nombreIC: 'F620', categoria: 'Coupes', precioBase: 95000, fullTuningPrecio: 15000, imagenUrl: imgUrl('f620') },
  { modelo: 'felon', nombreIC: 'Felon', categoria: 'Coupes', precioBase: 90000, fullTuningPrecio: 15000, imagenUrl: imgUrl('felon') },
  { modelo: 'jackal', nombreIC: 'Jackal', categoria: 'Coupes', precioBase: 60000, fullTuningPrecio: 15000, imagenUrl: imgUrl('jackal') },
  { modelo: 'sentinel', nombreIC: 'Sentinel', categoria: 'Coupes', precioBase: 95000, fullTuningPrecio: 15000, imagenUrl: imgUrl('sentinel') },
  { modelo: 'zion', nombreIC: 'Zion', categoria: 'Coupes', precioBase: 95000, fullTuningPrecio: 15000, imagenUrl: imgUrl('zion') },
  { modelo: 'previon', nombreIC: 'Previon', categoria: 'Coupes', precioBase: 38000, fullTuningPrecio: 15000, imagenUrl: imgUrl('previon') },
  { modelo: 'elegy', nombreIC: 'Elegy RH8', categoria: 'Coupes', precioBase: 95000, fullTuningPrecio: 15000, imagenUrl: imgUrl('elegy') },
  { modelo: 'sultan', nombreIC: 'Sultan', categoria: 'Coupes', precioBase: 12000, fullTuningPrecio: 15000, imagenUrl: imgUrl('sultan') },
  { modelo: 'jester', nombreIC: 'Jester', categoria: 'Coupes', precioBase: 240000, fullTuningPrecio: 15000, imagenUrl: imgUrl('jester') },
  { modelo: 'massacro', nombreIC: 'Massacro', categoria: 'Coupes', precioBase: 275000, fullTuningPrecio: 15000, imagenUrl: imgUrl('massacro') },

  // === Deportivo ===
  { modelo: 'alpha', nombreIC: 'Alpha', categoria: 'Deportivo', precioBase: 150000, fullTuningPrecio: 65000, imagenUrl: imgUrl('alpha') },
  { modelo: 'banshee', nombreIC: 'Banshee', categoria: 'Deportivo', precioBase: 105000, fullTuningPrecio: 65000, imagenUrl: imgUrl('banshee') },
  { modelo: 'bestiagts', nombreIC: 'Bestia GTS', categoria: 'Deportivo', precioBase: 62000, fullTuningPrecio: 65000, imagenUrl: imgUrl('bestiagts') },
  { modelo: 'calico', nombreIC: 'Calico GTF', categoria: 'Deportivo', precioBase: 179000, fullTuningPrecio: 65000, imagenUrl: imgUrl('calico') },
  { modelo: 'comet2', nombreIC: 'Comet Retro Custom', categoria: 'Deportivo', precioBase: 115000, fullTuningPrecio: 65000, imagenUrl: imgUrl('comet2') },
  { modelo: 'coquette', nombreIC: 'Coquette D10', categoria: 'Deportivo', precioBase: 138000, fullTuningPrecio: 65000, imagenUrl: imgUrl('coquette') },
  { modelo: 'elegy2', nombreIC: 'Elegy Retro Custom', categoria: 'Deportivo', precioBase: 145000, fullTuningPrecio: 65000, imagenUrl: imgUrl('elegy2') },
  { modelo: 'jester2', nombreIC: 'Jester Racecar', categoria: 'Deportivo', precioBase: 240000, fullTuningPrecio: 65000, imagenUrl: imgUrl('jester2') },
  { modelo: 'massacro2', nombreIC: 'Massacro Racecar', categoria: 'Deportivo', precioBase: 275000, fullTuningPrecio: 65000, imagenUrl: imgUrl('massacro2') },
  { modelo: 'neo', nombreIC: 'Neo', categoria: 'Deportivo', precioBase: 230000, fullTuningPrecio: 65000, imagenUrl: imgUrl('neo') },
  { modelo: 'pariah', nombreIC: 'Pariah', categoria: 'Deportivo', precioBase: 1420000, fullTuningPrecio: 65000, imagenUrl: imgUrl('pariah') },
  { modelo: 'futo2', nombreIC: 'Futo GTX', categoria: 'Deportivo', precioBase: 39000, fullTuningPrecio: 65000, imagenUrl: imgUrl('futo2') },
  { modelo: 'paragon', nombreIC: 'Paragon S', categoria: 'Deportivo', precioBase: 195000, fullTuningPrecio: 65000, imagenUrl: imgUrl('paragon') },
  { modelo: 'penumbra', nombreIC: 'Penumbra', categoria: 'Deportivo', precioBase: 45000, fullTuningPrecio: 65000, imagenUrl: imgUrl('penumbra') },
  { modelo: 'pipistrello', nombreIC: 'Penumbra FF', categoria: 'Deportivo', precioBase: 50000, fullTuningPrecio: 65000, imagenUrl: imgUrl('pipistrello') },
  { modelo: 'r300', nombreIC: '300R', categoria: 'Deportivo', precioBase: 195000, fullTuningPrecio: 65000, imagenUrl: imgUrl('r300') },
  { modelo: 'rapidgt', nombreIC: 'Rapid GT', categoria: 'Deportivo', precioBase: 65000, fullTuningPrecio: 65000, imagenUrl: imgUrl('rapidgt') },
  { modelo: 'schafter3', nombreIC: 'Schafter V12', categoria: 'Deportivo', precioBase: 80000, fullTuningPrecio: 65000, imagenUrl: imgUrl('schafter3') },
  { modelo: 'sultan2', nombreIC: 'Sultan Custom', categoria: 'Deportivo', precioBase: 22000, fullTuningPrecio: 65000, imagenUrl: imgUrl('sultan2') },
  { modelo: 'zr350', nombreIC: 'ZR350', categoria: 'Deportivo', precioBase: 42500, fullTuningPrecio: 65000, imagenUrl: imgUrl('zr350') },
  { modelo: 'vectre', nombreIC: 'Vectre', categoria: 'Deportivo', precioBase: 46000, fullTuningPrecio: 65000, imagenUrl: imgUrl('vectre') },
  { modelo: 'verlierer2', nombreIC: 'Verlierer', categoria: 'Deportivo', precioBase: 92000, fullTuningPrecio: 65000, imagenUrl: imgUrl('verlierer2') },
  { modelo: 'vstr', nombreIC: 'V-STR', categoria: 'Deportivo', precioBase: 65000, fullTuningPrecio: 65000, imagenUrl: imgUrl('vstr') },

  // === Deportivo clasico ===
  { modelo: 'btype', nombreIC: 'Roosevelt', categoria: 'Deportivo clasico', precioBase: 127000, fullTuningPrecio: 45000, imagenUrl: imgUrl('btype') },
  { modelo: 'casco', nombreIC: 'Casco', categoria: 'Deportivo clasico', precioBase: 190000, fullTuningPrecio: 45000, imagenUrl: imgUrl('casco') },
  { modelo: 'coquette2', nombreIC: 'Coquette Classic', categoria: 'Deportivo clasico', precioBase: 198000, fullTuningPrecio: 45000, imagenUrl: imgUrl('coquette2') },
  { modelo: 'dynasty', nombreIC: 'Dynasty', categoria: 'Deportivo clasico', precioBase: 88500, fullTuningPrecio: 45000, imagenUrl: imgUrl('dynasty') },
  { modelo: 'fagaloa', nombreIC: 'Fagaloa', categoria: 'Deportivo clasico', precioBase: 64000, fullTuningPrecio: 45000, imagenUrl: imgUrl('fagaloa') },
  { modelo: 'mamba', nombreIC: 'Mamba', categoria: 'Deportivo clasico', precioBase: 28000, fullTuningPrecio: 45000, imagenUrl: imgUrl('mamba') },
  { modelo: 'nebula', nombreIC: 'Nebula Turbo', categoria: 'Deportivo clasico', precioBase: 115000, fullTuningPrecio: 45000, imagenUrl: imgUrl('nebula') },
  { modelo: 'peyote', nombreIC: 'Peyote', categoria: 'Deportivo clasico', precioBase: 38500, fullTuningPrecio: 45000, imagenUrl: imgUrl('peyote') },
  { modelo: 'peyote3', nombreIC: 'Peyote Custom', categoria: 'Deportivo clasico', precioBase: 72000, fullTuningPrecio: 45000, imagenUrl: imgUrl('peyote3') },
  { modelo: 'pigalle', nombreIC: 'Rapid GT Classic', categoria: 'Deportivo clasico', precioBase: 140000, fullTuningPrecio: 45000, imagenUrl: imgUrl('pigalle') },
  { modelo: 'retinue', nombreIC: 'Retinue', categoria: 'Deportivo clasico', precioBase: 34000, fullTuningPrecio: 45000, imagenUrl: imgUrl('retinue') },
  { modelo: 'stirling', nombreIC: 'Stirling GT', categoria: 'Deportivo clasico', precioBase: 23500, fullTuningPrecio: 45000, imagenUrl: imgUrl('stirling') },

  // === Furgonetas ===
  { modelo: 'bison', nombreIC: 'Bison', categoria: 'Furgonetas', precioBase: 45000, fullTuningPrecio: 35000, imagenUrl: imgUrl('bison') },
  { modelo: 'bobcatxl', nombreIC: 'Bobcat XL Open', categoria: 'Furgonetas', precioBase: 35000, fullTuningPrecio: 35000, imagenUrl: imgUrl('bobcatxl') },
  { modelo: 'youga2', nombreIC: 'Youga Classic 4x4', categoria: 'Furgonetas', precioBase: 55000, fullTuningPrecio: 35000, imagenUrl: imgUrl('youga2') },
  { modelo: 'journey', nombreIC: 'Journey', categoria: 'Furgonetas', precioBase: 3500, fullTuningPrecio: 35000, imagenUrl: imgUrl('journey') },

  // === Motos ===
  { modelo: 'akuma', nombreIC: 'Akuma', categoria: 'Motos', precioBase: 9000, fullTuningPrecio: 52000, imagenUrl: imgUrl('akuma') },
  { modelo: 'bati', nombreIC: 'Bati 801', categoria: 'Motos', precioBase: 15000, fullTuningPrecio: 52000, imagenUrl: imgUrl('bati') },
  { modelo: 'bati2', nombreIC: 'Bati 801RR', categoria: 'Motos', precioBase: 15000, fullTuningPrecio: 52000, imagenUrl: imgUrl('bati2') },
  { modelo: 'blade', nombreIC: 'Blade', categoria: 'Motos', precioBase: 25000, fullTuningPrecio: 52000, imagenUrl: imgUrl('blade') },
  { modelo: 'double', nombreIC: 'Double T', categoria: 'Motos', precioBase: 12000, fullTuningPrecio: 52000, imagenUrl: imgUrl('double') },
  { modelo: 'faggio', nombreIC: 'Faggio', categoria: 'Motos', precioBase: 2000, fullTuningPrecio: 52000, imagenUrl: imgUrl('faggio') },
  { modelo: 'hakuchou', nombreIC: 'Hakuchou', categoria: 'Motos', precioBase: 82000, fullTuningPrecio: 52000, imagenUrl: imgUrl('hakuchou') },
  { modelo: 'hakuchou2', nombreIC: 'Hakuchou Drag', categoria: 'Motos', precioBase: 140000, fullTuningPrecio: 52000, imagenUrl: imgUrl('hakuchou2') },
  { modelo: 'innovation', nombreIC: 'Innovation', categoria: 'Motos', precioBase: 25000, fullTuningPrecio: 52000, imagenUrl: imgUrl('innovation') },
  { modelo: 'lectro', nombreIC: 'Lectro', categoria: 'Motos', precioBase: 15000, fullTuningPrecio: 52000, imagenUrl: imgUrl('lectro') },
  { modelo: 'manchez', nombreIC: 'Manchez', categoria: 'Motos', precioBase: 8000, fullTuningPrecio: 52000, imagenUrl: imgUrl('manchez') },
  { modelo: 'manchez2', nombreIC: 'Manchez Scout', categoria: 'Motos', precioBase: 12000, fullTuningPrecio: 52000, imagenUrl: imgUrl('manchez2') },
  { modelo: 'nightblade', nombreIC: 'Nightblade', categoria: 'Motos', precioBase: 25000, fullTuningPrecio: 52000, imagenUrl: imgUrl('nightblade') },
  { modelo: 'pizzaboy', nombreIC: 'Pizzaboy', categoria: 'Motos', precioBase: 3000, fullTuningPrecio: 52000, imagenUrl: imgUrl('pizzaboy') },
  { modelo: 'ratbike', nombreIC: 'Rat Bike', categoria: 'Motos', precioBase: 3000, fullTuningPrecio: 52000, imagenUrl: imgUrl('ratbike') },
  { modelo: 'shotaro', nombreIC: 'Shotaro', categoria: 'Motos', precioBase: 250000, fullTuningPrecio: 52000, imagenUrl: imgUrl('shotaro') },
  { modelo: 'zombiea', nombreIC: 'Zombie Bobber', categoria: 'Motos', precioBase: 22000, fullTuningPrecio: 52000, imagenUrl: imgUrl('zombiea') },
  { modelo: 'zombieb', nombreIC: 'Buccaneer Rider', categoria: 'Motos', precioBase: 22000, fullTuningPrecio: 52000, imagenUrl: imgUrl('zombieb') },

  // === Muscle ===
  { modelo: 'buffalo', nombreIC: 'Buffalo', categoria: 'Muscle', precioBase: 35000, fullTuningPrecio: 55000, imagenUrl: imgUrl('buffalo') },
  { modelo: 'buffalo5', nombreIC: 'Buffalo EVX', categoria: 'Muscle', precioBase: 185000, fullTuningPrecio: 55000, imagenUrl: imgUrl('buffalo5') },
  { modelo: 'buffalo3', nombreIC: 'Buffalo STX', categoria: 'Muscle', precioBase: 185000, fullTuningPrecio: 55000, imagenUrl: imgUrl('buffalo3') },
  { modelo: 'dominator', nombreIC: 'Dominator', categoria: 'Muscle', precioBase: 35000, fullTuningPrecio: 55000, imagenUrl: imgUrl('dominator') },
  { modelo: 'dominator4', nombreIC: 'Dominator Pibwasser', categoria: 'Muscle', precioBase: 45000, fullTuningPrecio: 55000, imagenUrl: imgUrl('dominator4') },
  { modelo: 'greenwood', nombreIC: 'Greenwood', categoria: 'Muscle', precioBase: 42000, fullTuningPrecio: 55000, imagenUrl: imgUrl('greenwood') },
  { modelo: 'hermes', nombreIC: 'Hermes', categoria: 'Muscle', precioBase: 35000, fullTuningPrecio: 55000, imagenUrl: imgUrl('hermes') },
  { modelo: 'hotknife', nombreIC: 'Hotknife', categoria: 'Muscle', precioBase: 125000, fullTuningPrecio: 55000, imagenUrl: imgUrl('hotknife') },
  { modelo: 'impaler2', nombreIC: 'Impaler Arena', categoria: 'Muscle', precioBase: 45000, fullTuningPrecio: 55000, imagenUrl: imgUrl('impaler2') },
  { modelo: 'manana2', nombreIC: 'Manana Custom', categoria: 'Muscle', precioBase: 28000, fullTuningPrecio: 55000, imagenUrl: imgUrl('manana2') },
  { modelo: 'sabregt', nombreIC: 'Sabre GT Turbo', categoria: 'Muscle', precioBase: 15000, fullTuningPrecio: 55000, imagenUrl: imgUrl('sabregt') },
  { modelo: 'tulip', nombreIC: 'Tulip M-100', categoria: 'Muscle', precioBase: 45000, fullTuningPrecio: 55000, imagenUrl: imgUrl('tulip') },
  { modelo: 'vigero2', nombreIC: 'Vigero ZX Convertible', categoria: 'Muscle', precioBase: 185000, fullTuningPrecio: 55000, imagenUrl: imgUrl('vigero2') },
  { modelo: 'virgo2', nombreIC: 'Virgo Classic Custom', categoria: 'Muscle', precioBase: 22000, fullTuningPrecio: 55000, imagenUrl: imgUrl('virgo2') },
  { modelo: 'yosemite3', nombreIC: 'Yosemite Drift', categoria: 'Muscle', precioBase: 95000, fullTuningPrecio: 55000, imagenUrl: imgUrl('yosemite3') },

  // === Sedans ===
  { modelo: 'asea', nombreIC: 'Asea', categoria: 'Sedans', precioBase: 3850, fullTuningPrecio: 18000, imagenUrl: imgUrl('asea') },
  { modelo: 'asterope', nombreIC: 'Asterope', categoria: 'Sedans', precioBase: 25000, fullTuningPrecio: 18000, imagenUrl: imgUrl('asterope') },
  { modelo: 'asterope2', nombreIC: 'Asterope GZ', categoria: 'Sedans', precioBase: 45000, fullTuningPrecio: 18000, imagenUrl: imgUrl('asterope2') },
  { modelo: 'deity', nombreIC: 'Deity', categoria: 'Sedans', precioBase: 95000, fullTuningPrecio: 18000, imagenUrl: imgUrl('deity') },
  { modelo: 'fugitive', nombreIC: 'Fugitive', categoria: 'Sedans', precioBase: 24000, fullTuningPrecio: 18000, imagenUrl: imgUrl('fugitive') },
  { modelo: 'oracle', nombreIC: 'Oracle', categoria: 'Sedans', precioBase: 82000, fullTuningPrecio: 18000, imagenUrl: imgUrl('oracle') },
  { modelo: 'primo', nombreIC: 'Primo', categoria: 'Sedans', precioBase: 9000, fullTuningPrecio: 18000, imagenUrl: imgUrl('primo') },
  { modelo: 'primo2', nombreIC: 'Primo Custom', categoria: 'Sedans', precioBase: 7000, fullTuningPrecio: 18000, imagenUrl: imgUrl('primo2') },
  { modelo: 'regina', nombreIC: 'Regina', categoria: 'Sedans', precioBase: 7000, fullTuningPrecio: 18000, imagenUrl: imgUrl('regina') },
  { modelo: 'rhinehart', nombreIC: 'Rhinehart', categoria: 'Sedans', precioBase: 95000, fullTuningPrecio: 18000, imagenUrl: imgUrl('rhinehart') },
  { modelo: 'schafter2', nombreIC: 'Schafter', categoria: 'Sedans', precioBase: 65000, fullTuningPrecio: 18000, imagenUrl: imgUrl('schafter2') },
  { modelo: 'stafford', nombreIC: 'Stafford', categoria: 'Sedans', precioBase: 95000, fullTuningPrecio: 18000, imagenUrl: imgUrl('stafford') },
  { modelo: 'superd', nombreIC: 'Super Diamond', categoria: 'Sedans', precioBase: 250000, fullTuningPrecio: 18000, imagenUrl: imgUrl('superd') },
  { modelo: 'cinquemila', nombreIC: 'Lampadati Cinquemila', categoria: 'Sedans', precioBase: 95000, fullTuningPrecio: 18000, imagenUrl: imgUrl('cinquemila') },

  // === SUV / SUVs ===
  { modelo: 'aleutian', nombreIC: 'Aleutian', categoria: 'SUVs', precioBase: 65500, fullTuningPrecio: 25000, imagenUrl: imgUrl('aleutian') },
  { modelo: 'baller', nombreIC: 'Baller', categoria: 'SUVs', precioBase: 42000, fullTuningPrecio: 25000, imagenUrl: imgUrl('baller') },
  { modelo: 'bjxl', nombreIC: 'BeeJay XL', categoria: 'SUVs', precioBase: 28000, fullTuningPrecio: 25000, imagenUrl: imgUrl('bjxl') },
  { modelo: 'cavalcade', nombreIC: 'Cavalcade', categoria: 'SUVs', precioBase: 60000, fullTuningPrecio: 25000, imagenUrl: imgUrl('cavalcade') },
  { modelo: 'granger', nombreIC: 'Granger', categoria: 'SUVs', precioBase: 35000, fullTuningPrecio: 25000, imagenUrl: imgUrl('granger') },

  // === Super / Superdeportivo ===
  { modelo: 'adder', nombreIC: 'Adder', categoria: 'Superdeportivo', precioBase: 1000000, fullTuningPrecio: 75000, imagenUrl: imgUrl('adder') },
  { modelo: 'autarch', nombreIC: 'Autarch', categoria: 'Superdeportivo', precioBase: 1955000, fullTuningPrecio: 75000, imagenUrl: imgUrl('autarch') },
  { modelo: 'banshee2', nombreIC: 'Banshee 900R', categoria: 'Superdeportivo', precioBase: 565000, fullTuningPrecio: 75000, imagenUrl: imgUrl('banshee2') },
  { modelo: 'bullet', nombreIC: 'Bullet', categoria: 'Superdeportivo', precioBase: 155000, fullTuningPrecio: 75000, imagenUrl: imgUrl('bullet') },
  { modelo: 'cheetah', nombreIC: 'Cheetah', categoria: 'Superdeportivo', precioBase: 650000, fullTuningPrecio: 75000, imagenUrl: imgUrl('cheetah') },
  { modelo: 'corsita', nombreIC: 'Corsita', categoria: 'Superdeportivo', precioBase: 1680000, fullTuningPrecio: 75000, imagenUrl: imgUrl('corsita') },
  { modelo: 'cyclone', nombreIC: 'Cyclone', categoria: 'Superdeportivo', precioBase: 1890000, fullTuningPrecio: 75000, imagenUrl: imgUrl('cyclone') },
  { modelo: 'deveste', nombreIC: 'Deveste Eight', categoria: 'Superdeportivo', precioBase: 1600000, fullTuningPrecio: 75000, imagenUrl: imgUrl('deveste') },
  { modelo: 'emerus', nombreIC: 'Emerus', categoria: 'Superdeportivo', precioBase: 2750000, fullTuningPrecio: 75000, imagenUrl: imgUrl('emerus') },
  { modelo: 'entity2', nombreIC: 'Entity XXR', categoria: 'Superdeportivo', precioBase: 2335000, fullTuningPrecio: 75000, imagenUrl: imgUrl('entity2') },
  { modelo: 'entityxf', nombreIC: 'Entity XF', categoria: 'Superdeportivo', precioBase: 795000, fullTuningPrecio: 75000, imagenUrl: imgUrl('entityxf') },
  { modelo: 'fmj', nombreIC: 'FMJ', categoria: 'Superdeportivo', precioBase: 1750000, fullTuningPrecio: 75000, imagenUrl: imgUrl('fmj') },
  { modelo: 'furia', nombreIC: 'Furia', categoria: 'Superdeportivo', precioBase: 2740000, fullTuningPrecio: 75000, imagenUrl: imgUrl('furia') },
  { modelo: 'gp1', nombreIC: 'GP1', categoria: 'Superdeportivo', precioBase: 1260000, fullTuningPrecio: 75000, imagenUrl: imgUrl('gp1') },
  { modelo: 'ignus', nombreIC: 'Ignus', categoria: 'Superdeportivo', precioBase: 2760000, fullTuningPrecio: 75000, imagenUrl: imgUrl('ignus') },
  { modelo: 'infernus', nombreIC: 'Infernus', categoria: 'Superdeportivo', precioBase: 440000, fullTuningPrecio: 75000, imagenUrl: imgUrl('infernus') },
  { modelo: 'italigto', nombreIC: 'Itali GTB', categoria: 'Superdeportivo', precioBase: 480000, fullTuningPrecio: 75000, imagenUrl: imgUrl('italigto') },
  { modelo: 'italigto2', nombreIC: 'Itali GTB Custom', categoria: 'Superdeportivo', precioBase: 480000, fullTuningPrecio: 75000, imagenUrl: imgUrl('italigto2') },
  { modelo: 'italirsx', nombreIC: 'Itali RSX', categoria: 'Superdeportivo', precioBase: 1690000, fullTuningPrecio: 75000, imagenUrl: imgUrl('italirsx') },
  { modelo: 'krieger', nombreIC: 'Krieger', categoria: 'Superdeportivo', precioBase: 2875000, fullTuningPrecio: 75000, imagenUrl: imgUrl('krieger') },
  { modelo: 're7b', nombreIC: 'RE-7B', categoria: 'Superdeportivo', precioBase: 2475000, fullTuningPrecio: 75000, imagenUrl: imgUrl('re7b') },
  { modelo: 'lm87', nombreIC: 'LM87', categoria: 'Superdeportivo', precioBase: 1155000, fullTuningPrecio: 75000, imagenUrl: imgUrl('lm87') },
  { modelo: 'nero', nombreIC: 'Nero', categoria: 'Superdeportivo', precioBase: 1440000, fullTuningPrecio: 75000, imagenUrl: imgUrl('nero') },
  { modelo: 'nero2', nombreIC: 'Nero Custom', categoria: 'Superdeportivo', precioBase: 1440000, fullTuningPrecio: 75000, imagenUrl: imgUrl('nero2') },
  { modelo: 'osiris', nombreIC: 'Osiris', categoria: 'Superdeportivo', precioBase: 1950000, fullTuningPrecio: 75000, imagenUrl: imgUrl('osiris') },
  { modelo: 'penetrator', nombreIC: 'Penetrator', categoria: 'Superdeportivo', precioBase: 1050000, fullTuningPrecio: 75000, imagenUrl: imgUrl('penetrator') },
  { modelo: 'pfister811', nombreIC: 'Pfister 811', categoria: 'Superdeportivo', precioBase: 850000, fullTuningPrecio: 75000, imagenUrl: imgUrl('pfister811') },
  { modelo: 'prototipo', nombreIC: 'X80 Proto', categoria: 'Superdeportivo', precioBase: 2700000, fullTuningPrecio: 75000, imagenUrl: imgUrl('prototipo') },
  { modelo: 'reaper', nombreIC: 'Reaper', categoria: 'Superdeportivo', precioBase: 1595000, fullTuningPrecio: 75000, imagenUrl: imgUrl('reaper') },
  { modelo: 's80', nombreIC: 'S80RR', categoria: 'Superdeportivo', precioBase: 2495000, fullTuningPrecio: 75000, imagenUrl: imgUrl('s80') },
  { modelo: 'sc1', nombreIC: 'SC1', categoria: 'Superdeportivo', precioBase: 1633000, fullTuningPrecio: 75000, imagenUrl: imgUrl('sc1') },
  { modelo: 'etr1', nombreIC: 'ETR1', categoria: 'Superdeportivo', precioBase: 1995000, fullTuningPrecio: 75000, imagenUrl: imgUrl('etr1') },
  { modelo: 'italigtb2', nombreIC: 'Itali GTO Stinger TT', categoria: 'Superdeportivo', precioBase: 385000, fullTuningPrecio: 75000, imagenUrl: imgUrl('italigtb2') },
  { modelo: 't20', nombreIC: 'T20', categoria: 'Superdeportivo', precioBase: 2200000, fullTuningPrecio: 75000, imagenUrl: imgUrl('t20') },
  { modelo: 'taipan', nombreIC: 'Taipan', categoria: 'Superdeportivo', precioBase: 2695000, fullTuningPrecio: 75000, imagenUrl: imgUrl('taipan') },
  { modelo: 'tempesta', nombreIC: 'Tempesta', categoria: 'Superdeportivo', precioBase: 1320000, fullTuningPrecio: 75000, imagenUrl: imgUrl('tempesta') },
  { modelo: 'tezeract', nombreIC: 'Tezeract', categoria: 'Superdeportivo', precioBase: 1220000, fullTuningPrecio: 75000, imagenUrl: imgUrl('tezeract') },
  { modelo: 'thrax', nombreIC: 'Thrax', categoria: 'Superdeportivo', precioBase: 2345000, fullTuningPrecio: 75000, imagenUrl: imgUrl('thrax') },
  { modelo: 'tigon', nombreIC: 'Tigon', categoria: 'Superdeportivo', precioBase: 2490000, fullTuningPrecio: 75000, imagenUrl: imgUrl('tigon') },
  { modelo: 'torero2', nombreIC: 'Torero XO', categoria: 'Superdeportivo', precioBase: 2880000, fullTuningPrecio: 75000, imagenUrl: imgUrl('torero2') },
  { modelo: 'turismor', nombreIC: 'Turismo R', categoria: 'Superdeportivo', precioBase: 340000, fullTuningPrecio: 75000, imagenUrl: imgUrl('turismor') },
  { modelo: 'tyrant', nombreIC: 'Tyrant', categoria: 'Superdeportivo', precioBase: 210000, fullTuningPrecio: 75000, imagenUrl: imgUrl('tyrant') },
  { modelo: 'vacca', nombreIC: 'Vacca', categoria: 'Superdeportivo', precioBase: 135000, fullTuningPrecio: 75000, imagenUrl: imgUrl('vacca') },
  { modelo: 'vagner', nombreIC: 'Vagner', categoria: 'Superdeportivo', precioBase: 526000, fullTuningPrecio: 75000, imagenUrl: imgUrl('vagner') },
  { modelo: 'zentorno', nombreIC: 'Zentorno', categoria: 'Superdeportivo', precioBase: 750000, fullTuningPrecio: 75000, imagenUrl: imgUrl('zentorno') },
  { modelo: 'furant', nombreIC: 'Turismo Omaggio', categoria: 'Superdeportivo', precioBase: 1850000, fullTuningPrecio: 75000, imagenUrl: imgUrl('furant') },

  // === Todoterrenos ===
  { modelo: 'blazer4', nombreIC: 'Blazer Hot Rod', categoria: 'Todoterrenos', precioBase: 8000, fullTuningPrecio: 60000, imagenUrl: imgUrl('blazer4') },
  { modelo: 'caracara', nombreIC: 'Caracara', categoria: 'Todoterrenos', precioBase: 105000, fullTuningPrecio: 60000, imagenUrl: imgUrl('caracara') },
  { modelo: 'caracara2', nombreIC: 'Caracara 4x4', categoria: 'Todoterrenos', precioBase: 125000, fullTuningPrecio: 60000, imagenUrl: imgUrl('caracara2') },
  { modelo: 'draugur', nombreIC: 'Draugur', categoria: 'Todoterrenos', precioBase: 130000, fullTuningPrecio: 60000, imagenUrl: imgUrl('draugur') },
  { modelo: 'dubsta3', nombreIC: 'Dubsta 6x6', categoria: 'Todoterrenos', precioBase: 97000, fullTuningPrecio: 60000, imagenUrl: imgUrl('dubsta3') },
  { modelo: 'mesa3', nombreIC: 'Mesa Merryweather', categoria: 'Todoterrenos', precioBase: 45000, fullTuningPrecio: 60000, imagenUrl: imgUrl('mesa3') },
  { modelo: 'trophytruck', nombreIC: 'Trophy Truck', categoria: 'Todoterrenos', precioBase: 88500, fullTuningPrecio: 60000, imagenUrl: imgUrl('trophytruck') },
  { modelo: '620gts', nombreIC: '620 GTS', categoria: 'Todoterrenos', precioBase: 85000, fullTuningPrecio: 60000, imagenUrl: imgUrl('620gts') },
  { modelo: 'banshee3', nombreIC: 'Banshee S', categoria: 'Todoterrenos', precioBase: 120000, fullTuningPrecio: 60000, imagenUrl: imgUrl('banshee3') },

  // === VIP ===
  { modelo: 'gbprospero', nombreIC: 'Prospero', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbprospero') },
  { modelo: 'gbraidillon', nombreIC: 'Raidillon', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbraidillon') },
  { modelo: 'gbronin', nombreIC: 'Ronin', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbronin') },
  { modelo: 'gbsapphire', nombreIC: 'Sapphire', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbsapphire') },
  { modelo: 'gbschlagenr', nombreIC: 'Schlagen R', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbschlagenr') },
  { modelo: 'gbsentinelgts', nombreIC: 'Sentinel GTS', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbsentinelgts') },
  { modelo: 'gbsidewinder', nombreIC: 'Sidewinder', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbsidewinder') },
  { modelo: 'gbsolace', nombreIC: 'Solace', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbsolace') },
  { modelo: 'gbsolacev', nombreIC: 'Solace V', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbsolacev') },
  { modelo: 'gbstarlight', nombreIC: 'Starlight', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbstarlight') },
  { modelo: 'gbsultanrsx', nombreIC: 'Sultan RSX', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbsultanrsx') },
  { modelo: 'gbtahomagt', nombreIC: 'Tahoma GT', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbtahomagt') },
  { modelo: 'gbtenfr', nombreIC: 'Ten FR', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbtenfr') },
  { modelo: 'gbterrorizer', nombreIC: 'Terrorizer', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbterrorizer') },
  { modelo: 'gbtr3s', nombreIC: 'TR3S', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbtr3s') },
  { modelo: 'gbturismogts', nombreIC: 'Turismo GTS', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbturismogts') },
  { modelo: 'gbvivant', nombreIC: 'Vivant', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbvivant') },
  { modelo: 'gbvivantgrb', nombreIC: 'Vivant GRB', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('gbvivantgrb') },
  { modelo: 'ixr', nombreIC: 'IXR', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('ixr') },
  { modelo: 'obeysport', nombreIC: 'Obey Sport GT', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('obeysport') },
  { modelo: 'offzenith', nombreIC: 'Zenith Offroad', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('offzenith') },
  { modelo: 'revenant', nombreIC: 'Revenant', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('revenant') },
  { modelo: 's790', nombreIC: 'S790', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('s790') },
  { modelo: 's790anim', nombreIC: 'S790 Animated', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('s790anim') },
  { modelo: 'terminator', nombreIC: 'Terminator', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('terminator') },
  { modelo: 'toroslxstance', nombreIC: 'Toros LX Stance', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('toroslxstance') },
  { modelo: 'zenith', nombreIC: 'Benefactor Zenith', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('zenith') },
  { modelo: 'zr6gt', nombreIC: 'ZR6 GT', categoria: 'VIP', precioBase: 0, fullTuningPrecio: 80000, imagenUrl: imgUrl('zr6gt') },
  { modelo: 'viseris', nombreIC: 'Viseris', categoria: 'VIP', precioBase: 155000, fullTuningPrecio: 80000, imagenUrl: imgUrl('viseris') },
  { modelo: 'torero', nombreIC: 'Torero', categoria: 'VIP', precioBase: 148000, fullTuningPrecio: 80000, imagenUrl: imgUrl('torero') },
];

// Precios pintura camaleónica por categoría
const PINTURA_CAMALEONICA_PRECIO = {
  'Bicicletas': 5000, 'Circuitos': 80000, 'Compactos': 10000, 'Coupes': 15000,
  'Deportivo': 25000, 'Deportivo clasico': 22000, 'Furgonetas': 18000,
  'Motos': 15000, 'Muscle': 22000, 'Sedans': 22000, 'SUV': 28000, 'SUVs': 28000,
  'Super': 45000, 'Superdeportivo': 45000, 'Todoterrenos': 28000, 'VIP': 50000,
  'default': 20000
};
