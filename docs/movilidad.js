// movilidad.js (usa datos JSON simples)
const map = L.map('map-mov', { zoomControl: true }).setView([4.616, -74.1], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20, attribution: '&copy; OpenStreetMap'
}).addTo(map);

// Panes para controlar el orden visual
map.createPane('viasPane');      map.getPane('viasPane').style.zIndex = 410;
map.createPane('cicloPane');     map.getPane('cicloPane').style.zIndex = 420;
map.createPane('paraderosPane'); map.getPane('paraderosPane').style.zIndex = 430;

// Datos (arrays crudos)
let viasData = [];
let cicloData = [];
let paraderosData = [];

// Capas (LayerGroup) que renderizamos/reemplazamos al filtrar
let viasLayer = L.layerGroup().addTo(map);
let cicloLayer = L.layerGroup().addTo(map);
let paraderosLayer = L.layerGroup().addTo(map);

// === Estilos ===
function colorPorTipo(tipo) {
  switch ((tipo || '').toLowerCase()) {
    case 'primaria':   return '#1f77b4';
    case 'secundaria': return '#2ca02c';
    case 'terciaria':  return '#ff7f0e';
    case 'local':      return '#9467bd';
    default:           return '#7f7f7f';
  }
}
function styleVias(item) {
  const tipo = (item.tipo || '').toLowerCase();
  const estado = (item.estado || '').toLowerCase();
  const base = {
    color: colorPorTipo(tipo),
    weight: tipo === 'primaria' ? 5 : tipo === 'secundaria' ? 4 : 3,
    opacity: 0.9
  };
  if (estado === 'proyectada') { base.dashArray = '6,6'; base.opacity = 0.8; }
  return base;
}
function styleCiclorutas() { return { color: '#00bcd4', weight: 3, opacity: 0.9 }; }
function markerParadero(coord) {
  return L.circleMarker(coord, { radius: 5, color: '#222', fillColor: '#ffd54f', fillOpacity: 0.9, weight: 1 });
}

// === UI (panel info) ===
const info = document.getElementById('info-mov');
const setInfo = (html) => info.innerHTML = html;

// === Filtros (controles DOM) ===
const selTipo   = document.getElementById('filtro-tipo');
const selEstado = document.getElementById('filtro-estado');
const rngVel    = document.getElementById('filtro-vel');
const outVel    = document.getElementById('vel-out');
outVel.textContent = `≤ ${rngVel.value}`;

// Eventos de filtros
[rngVel, selTipo, selEstado].forEach(el => el.addEventListener('input', () => {
  outVel.textContent = `≤ ${rngVel.value}`;
  renderLayers();
}));

// Mostrar/ocultar capas
document.querySelectorAll('input[type="checkbox"][data-layer]').forEach(cb => {
  cb.addEventListener('change', () => {
    const key = cb.getAttribute('data-layer');
    const layer = key === 'vias' ? viasLayer : key === 'ciclorutas' ? cicloLayer : paraderosLayer;
    if (cb.checked) map.addLayer(layer); else map.removeLayer(layer);
  });
});

// === Funciones de filtro por item ===
function filtraVia(item) {
  const tipoOk   = !selTipo.value   || (item.tipo || '').toLowerCase() === selTipo.value.toLowerCase();
  const estadoOk = !selEstado.value || (item.estado || '').toLowerCase() === selEstado.value.toLowerCase();
  const velMax   = Number(rngVel.value);
  const vel      = (item.velocidad == null) ? null : Number(item.velocidad);
  const velOk    = vel == null || vel <= velMax;
  return tipoOk && estadoOk && velOk;
}
function filtraCiclo(_item) { return true; }
function filtraParadero(_item) { return true; }

// === Render: (re)construye capas a partir de arrays JSON ===
function renderLayers() {
  // Limpia capas anteriores
  viasLayer.clearLayers();
  cicloLayer.clearLayers();
  paraderosLayer.clearLayers();

  // --- VÍAS: polilíneas con hover/click ---
  viasData.filter(filtraVia).forEach(item => {
    const poly = L.polyline(item.coords, { pane: 'viasPane', ...styleVias(item) });
    poly.on('mouseover', () => {
      poly.setStyle({ weight: (poly.options.weight || 3) + 2 });
      poly.bringToFront();
      setInfo(`<strong>Vía:</strong> ${item.nombre ?? '(sin nombre)'}<br>
               <strong>Tipo:</strong> ${item.tipo ?? '-'}<br>
               <strong>Estado:</strong> ${item.estado ?? '-'}<br>
               <strong>Vel. máx.:</strong> ${item.velocidad ?? '-'} km/h`);
    });
    poly.on('mouseout', () => {
      poly.setStyle(styleVias(item));
      setInfo('Pasa el cursor por una vía o haz clic en un elemento…');
    });
    poly.on('click', (e) => {
      L.popup()
        .setLatLng(e.latlng)
        .setContent(`<strong>${item.nombre ?? 'Vía'}</strong><br>
                     Tipo: ${item.tipo ?? '-'}<br>
                     Estado: ${item.estado ?? '-'}<br>
                     Vel. máx.: ${item.velocidad ?? '-'} km/h`)
        .openOn(map);
    });
    poly.addTo(viasLayer);
  });

  // --- CICLORUTAS: polilíneas ---
  cicloData.filter(filtraCiclo).forEach(item => {
    const poly = L.polyline(item.coords, { pane: 'cicloPane', ...styleCiclorutas(item) });
    poly.on('click', (e) => {
      L.popup()
        .setLatLng(e.latlng)
        .setContent(`<strong>Cicloruta</strong><br>
                     Nombre: ${item.nombre ?? '-'}<br>
                     Sentido: ${item.sentido ?? '-'}<br>
                     Tipo: ${item.tipo ?? '-'}`)
        .openOn(map);
    });
    poly.addTo(cicloLayer);
  });

  // --- PARADEROS: puntos ---
  paraderosData.filter(filtraParadero).forEach(item => {
    const mk = markerParadero(item.coord).addTo(paraderosLayer);
    mk.on('click', (e) => {
      L.popup()
        .setLatLng(e.latlng)
        .setContent(`<strong>Paradero</strong><br>
                     Código: ${item.codigo ?? '-'}<br>
                     Nombre: ${item.nombre ?? '-'}`)
        .openOn(map);
    });
  });

  // Ajusta vista al contenido visible
  const visibles = [];
  if (map.hasLayer(viasLayer)) visibles.push(viasLayer);
  if (map.hasLayer(cicloLayer)) visibles.push(cicloLayer);
  if (map.hasLayer(paraderosLayer)) visibles.push(paraderosLayer);

  const group = L.featureGroup(visibles.flatMap(lg => lg.getLayers()));
  if (group.getLayers().length) {
    map.fitBounds(group.getBounds().pad(0.08), { animate: true });
  }
}

// Utilidad para cargar JSON
async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo cargar ${url}`);
  return r.json();
}

// Arranque
(async function bootstrap() {
  try {
    [viasData, cicloData, paraderosData] = await Promise.all([
      loadJSON('./datos/vias.json'),
      loadJSON('./datos/ciclorutas.json'),
      loadJSON('./datos/paraderos.json')
    ]);
    renderLayers();
    L.control.scale({ metric: true, imperial: false }).addTo(map);
  } catch (err) {
    console.error(err);
    setInfo('Error cargando datos de movilidad. Revisa la consola.');
  }
})();
