const map = L.map('map-mov', { zoomControl: true }).setView([4.616, -74.1], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20, attribution: '&copy; OpenStreetMap'
}).addTo(map);

map.createPane('viasPane');      map.getPane('viasPane').style.zIndex = 410;
map.createPane('paraderosPane'); map.getPane('paraderosPane').style.zIndex = 430;

const infoBox = document.getElementById('info-mov');
const imgWrap = document.getElementById('info-img-wrap');
const infoImg = document.getElementById('info-img');

function setInfo(html) { infoBox.innerHTML = html; }
function showImage(src) {
  if (!src) {
    imgWrap.style.display = 'none';
    infoImg.removeAttribute('src');
    return;
  }
  infoImg.src = encodeURI(src);
  imgWrap.style.display = 'block';
}

const PARADERO_IMG_DIR = 'imagenes/paraderos/';
const PARADERO_DEFAULT_IMG = 'imagenes/paradero_info.png';
const PARADERO_IMG_MAP = {
  'Paradero 1': `${PARADERO_IMG_DIR}Paradero 1.jpg`,
  'Paradero 2': `${PARADERO_IMG_DIR}Paradero 2.jpg`
};

async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo cargar ${url}`);
  return r.json();
}

function mapTipo(props) {
  const v = (props?.tipo || props?.CLASE_VIA || props?.highway || '').toString().toLowerCase();
  if (['motorway','trunk','primary'].includes(v)) return 'primaria';
  if (v === 'secondary') return 'secundaria';
  if (v === 'tertiary')  return 'terciaria';
  if (['residential','unclassified','service','living_street','local','vecinal','road'].includes(v)) return 'local';
  if (v.includes('primar') || v.includes('principal')) return 'primaria';
  if (v.includes('segund')) return 'secundaria';
  if (v.includes('terci'))  return 'terciaria';
  return v || '';
}

function colorPorTipo(tipo) {
  switch (tipo) {
    case 'primaria':   return '#1f77b4';
    case 'secundaria': return '#2ca02c';
    case 'terciaria':  return '#ff7f0e';
    case 'local':      return '#9467bd';
    default:           return '#7f7f7f';
  }
}

function styleViasFeature(feat) {
  const p = feat.properties || {};
  const tipo = mapTipo(p);
  const estado = (p.estado || p.ESTADO || p.status || '').toLowerCase();
  const weight = tipo === 'primaria' ? 5 : (tipo === 'secundaria' ? 4 : 3);
  return {
    pane: 'viasPane',
    color: colorPorTipo(tipo),
    weight,
    opacity: 0.9,
    dashArray: estado === 'proyectada' ? '6,6' : null
  };
}

function tooltipViasHTML(p) {
  const tipo = mapTipo(p) || '-';
  const nombre = p.nombre || p.NOMBRE || p.name || '(sin nombre)';
  const estado = p.estado || p.ESTADO || p.status || '-';
  const vel = p.velocidad || p.VEL_MAX || p.maxspeed || '-';
  return `<strong>${nombre}</strong><br>Tipo: ${tipo}<br>Estado: ${estado}<br>Vel. máx.: ${vel} km/h`;
}

function panelViasHTML(p) {
  return `<strong>Vía:</strong> ${p.nombre || p.NOMBRE || p.name || '(sin nombre)'}<br><strong>Tipo:</strong> ${mapTipo(p) || '-'}<br><strong>Estado:</strong> ${p.estado || p.ESTADO || p.status || '-'}<br><strong>Vel. máx.:</strong> ${p.velocidad || p.VEL_MAX || p.maxspeed || '-'} km/h`;
}

function guessParaderoImg(p) {
  const direct = p.imagen || p.image || p.image_url || p.foto || p.FOTO || null;
  if (direct) return direct;
  const name = p.nombre || p.NOMBRE || p.name;
  if (name && PARADERO_IMG_MAP[name]) return PARADERO_IMG_MAP[name];
  const code = p.codigo || p.CODIGO || p.code;
  if (code) return `${PARADERO_IMG_DIR}${code}.jpg`;
  return PARADERO_DEFAULT_IMG;
}

function paraderoPopupHTML(p, imgUrl) {
  const nombre = p.nombre || p.NOMBRE || p.name || 'Paradero';
  const codigo = p.codigo || p.CODIGO || p.code || '';
  const extra  = p.ruta || p.RUTA || '';
  const imgTag = imgUrl ? `<img src="${encodeURI(imgUrl)}" style="max-width:220px; display:block; margin-top:8px; border:1px solid #ddd; border-radius:6px;" alt="Paradero"/>` : '';
  return `<strong>${nombre}</strong>${codigo ? ` (Código: ${codigo})` : ''}${extra ? `<br>Ruta: ${extra}` : ''}${imgTag}`;
}

let viasLayer, paraderosLayer;

(async function bootstrap() {
  try {
    const viasData = await loadJSON('./datos/Vias_VA2.geojson');
    const paraderosData = await loadJSON('./datos/Paraderos_SITP.geojson');

    viasLayer = L.geoJSON(viasData, {
      style: styleViasFeature,
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        layer.bindTooltip(() => tooltipViasHTML(p), { sticky: true, direction: 'top', opacity: 0.9 });
        layer.on({
          mouseover: () => {
            layer.setStyle({ weight: (layer.options.weight || 3) + 2 });
            layer.bringToFront();
            setInfo(panelViasHTML(p));
            showImage(null);
          },
          mouseout: () => {
            layer.setStyle(styleViasFeature(feat));
            setInfo('Acerca el cursor a una vía o haz clic en un paradero…');
          },
          click: (e) => {
            L.popup().setLatLng(e.latlng).setContent(tooltipViasHTML(p)).openOn(map);
          }
        });
      }
    }).addTo(map);

    paraderosLayer = L.geoJSON(paraderosData, {
      pane: 'paraderosPane',
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, { radius: 6, color: '#222', weight: 1, fillColor: '#ffd54f', fillOpacity: 0.95 }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        const imgUrl = guessParaderoImg(p);
        layer.on({
          mouseover: () => {
            layer.setStyle({ radius: 8, weight: 2 });
            setInfo(`<strong>Paradero:</strong> ${p.nombre || p.NOMBRE || p.name || '-'}${(p.codigo || p.CODIGO) ? `<br><strong>Código:</strong> ${p.codigo || p.CODIGO}` : ''}`);
            showImage(imgUrl);
          },
          mouseout: () => {
            layer.setStyle({ radius: 6, weight: 1 });
          },
          click: (e) => {
            L.popup({ maxWidth: 280 }).setLatLng(e.latlng).setContent(paraderoPopupHTML(p, imgUrl)).openOn(map);
          }
        });
      }
    }).addTo(map);

    const group = L.featureGroup([viasLayer, paraderosLayer]);
    if (group.getLayers().length) map.fitBounds(group.getBounds().pad(0.08), { animate: true });
    L.control.scale({ metric: true, imperial: false }).addTo(map);
  } catch (err) {
    console.error(err);
    setInfo('Error cargando datos. Revisa la consola del navegador.');
  }
})();
