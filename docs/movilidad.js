const map = L.map('map-mov', { zoomControl: true }).setView([4.616, -74.1], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap' }).addTo(map);

map.createPane('viasPane');      map.getPane('viasPane').style.zIndex = 410;
map.createPane('paraderosPane'); map.getPane('paraderosPane').style.zIndex = 430;

const infoBox = document.getElementById('info-mov');
const imgWrap = document.getElementById('info-img-wrap');
const infoImg = document.getElementById('info-img');

function setInfo(html) { infoBox.innerHTML = html; }
function showImage(src) { if (!src) { imgWrap.style.display = 'none'; infoImg.removeAttribute('src'); return; } infoImg.src = encodeURI(src); imgWrap.style.display = 'block'; }

const PARADERO_IMG_DIR = 'imagenes/paraderos/';
const PARADERO_DEFAULT_IMG = 'imagenes/paradero_info.png';
const PARADERO_IMG_MAP = {
  'Paradero 1': `${PARADERO_IMG_DIR}Paradero 1.png`,
  'Paradero 2': `${PARADERO_IMG_DIR}Paradero 2.png`,
  'Br. Villa Anny I y II': `${PARADERO_IMG_DIR}Paradero 1.png`,
  'Br. Villa Anny I': `${PARADERO_IMG_DIR}Paradero 2.png`,
  '488A09': `${PARADERO_IMG_DIR}Paradero 1.png`,
  '168A09': `${PARADERO_IMG_DIR}Paradero 2.png`
};

async function loadJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(`No se pudo cargar ${url}`); return r.json(); }

function tipoViaLargo(sigla) { const s = (sigla || '').toString().toUpperCase(); if (s === 'DG') return 'Diagonal'; if (s === 'KR') return 'Carrera'; if (s === 'CL') return 'Calle'; if (s === 'TV') return 'Transversal'; return s || '-'; }

function weightFromClass(p) { const c = Number(p.MVITCla); if (Number.isNaN(c)) return 4; if (c <= 1) return 7; if (c <= 2) return 5.5; if (c <= 3) return 4; if (c <= 4) return 3; return 2; }

function viaInfoHTML(p) { const etiqueta = p.MVIEtiquet ?? '-'; const tipo = tipoViaLargo(p.MVITipo); const clase = p.MVITCla ?? '-'; const vel = p.MVIVelReg ?? '-'; const calz = p.MVINumC ?? '-'; const codigo = p.MVICodigo ?? '-'; return `<strong>${etiqueta}</strong><br>Tipo: ${tipo}<br>Clase: ${clase}<br>Vel. regl.: ${vel} km/h<br>Calzadas: ${calz}<br>Código: ${codigo}`; }

function styleViasFeature(feat) { const p = feat.properties || {}; const estado = (p.estado || '').toString().toLowerCase(); return { pane: 'viasPane', color: '#ff0000', weight: weightFromClass(p), opacity: 0.95, dashArray: estado === 'proyectada' ? '6,6' : null }; }

function guessParaderoImg(p) { const direct = p.imagen || p.image || p.image_url || p.foto || p.FOTO || null; if (direct) return direct; const nombre = p.nombre_par || p.nombre || p.name; if (nombre && PARADERO_IMG_MAP[nombre]) return PARADERO_IMG_MAP[nombre]; const cenefa = p.cenefa; if (cenefa && PARADERO_IMG_MAP[cenefa]) return PARADERO_IMG_MAP[cenefa]; if (cenefa) return `${PARADERO_IMG_DIR}${cenefa}.png`; const consec = p.consec_par || p.codigo || p.code; if (consec) return `${PARADERO_IMG_DIR}${consec}.png`; return PARADERO_DEFAULT_IMG; }

function paraderoInfoHTML(p) { const nombre = p.nombre_par ?? p.nombre ?? p.name ?? 'Paradero'; const via = p.via_par ?? '-'; const dir = p.direcc_par ?? '-'; const cenefa = p.cenefa ?? '-'; const consec = p.consec_par ?? '-'; const modulo = p.modulo_par ?? '-'; const zona = p.zona_par ?? '-'; return `<strong>${nombre}</strong><br>Vía: ${via}<br>Dirección: ${dir}<br>Cenefa: ${cenefa}<br>Código: ${consec}<br>Módulo: ${modulo}<br>Zona: ${zona}`; }

function paraderoPopupHTML(p, imgUrl) { const core = paraderoInfoHTML(p); const img = imgUrl ? `<img src="${encodeURI(imgUrl)}" style="max-width:220px; display:block; margin-top:8px; border:1px solid #ddd; border-radius:6px;" alt="Paradero"/>` : ''; return `${core}${img}`; }

let viasLayer, paraderosLayer;

(async function bootstrap() {
  try {
    const viasData = await loadJSON('./datos/Vias_VA2.geojson');
    const paraderosData = await loadJSON('./datos/Paraderos_SITP.geojson');

    viasLayer = L.geoJSON(viasData, {
      style: styleViasFeature,
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        layer.bindTooltip(() => viaInfoHTML(p), { sticky: true, direction: 'top', opacity: 0.95 });
        layer.on({
          mouseover: () => { layer.setStyle({ weight: weightFromClass(p) + 2 }); layer.bringToFront(); setInfo(viaInfoHTML(p)); showImage(null); },
          mouseout: () => { layer.setStyle(styleViasFeature(feat)); setInfo('Acerca el cursor a una vía o haz clic en un paradero…'); },
          click: (e) => { L.popup().setLatLng(e.latlng).setContent(viaInfoHTML(p)).openOn(map); }
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
          mouseover: () => { layer.setStyle({ radius: 8, weight: 2 }); setInfo(paraderoInfoHTML(p)); showImage(imgUrl); },
          mouseout: () => { layer.setStyle({ radius: 6, weight: 1 }); },
          click: (e) => { L.popup({ maxWidth: 280 }).setLatLng(e.latlng).setContent(paraderoPopupHTML(p, imgUrl)).openOn(map); }
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
