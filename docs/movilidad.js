/* =========================================
   CONFIGURACIÓN DEL MAPA (Leaflet)
   - Creación del mapa y vista inicial
   - Capa base con OpenStreetMap
   ========================================= */
const map = L.map('map-mov').setView([4.61, -74.08], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 20
}).addTo(map);


/* =========================================
   REFERENCIAS DE UI
   - Elementos del panel informativo
   - Checkboxes para filtros por tipo de vía
   ========================================= */
const infoEl  = document.getElementById('info-mov');
const imgWrap = document.getElementById('info-img-wrap');
const imgEl   = document.getElementById('info-img');
const filtros = document.querySelectorAll('.filters input[type="checkbox"]');


/* =========================================
   CAPAS POR TIPO DE VÍA
   - Grupos: KR, CL, DG, TV
   - Permiten mostrar/ocultar por filtro
   ========================================= */
const capasPorTipo = {
  KR: L.layerGroup().addTo(map),
  CL: L.layerGroup().addTo(map),
  DG: L.layerGroup().addTo(map),
  TV: L.layerGroup().addTo(map)
};


/* =========================================
   ESTILO Y TEXTO DE INFO
   - Estilo de líneas (color/opacity/weight)
   - Formateo de texto para el panel
   ========================================= */
function estiloVia(feature) {
  const clase = Number(feature.properties?.clase ?? 1);
  const opacity = Math.max(0.25, 1 - (clase - 1) * 0.15);
  return { color: '#ff0000', weight: 3, opacity };
}

function textoInfo(feature) {
  const { nombre, tipo, clase, longitud } = feature.properties ?? {};
  return [
    nombre ? `<b>${nombre}</b>` : '',
    tipo ? `Tipo: ${tipo}` : '',
    clase ? `Clase: ${clase}` : '',
    longitud ? `Longitud: ${longitud} m` : ''
  ].filter(Boolean).join(' · ');
}


/* =========================================
   INTERACCIÓN CON GEOMETRÍAS
   - mouseover: resalta y muestra info
   - mouseout: restaura y ayuda default
   - click: fija info y muestra imagen
   ========================================= */
function onOver(e) {
  e.target.setStyle({ weight: 5 });
  infoEl.innerHTML = textoInfo(e.target.feature) || 'Vía sin metadatos';
}
function onOut(e) {
  e.target.setStyle({ weight: 3 });
  if (!infoEl.dataset.sticky) {
    infoEl.textContent = 'Acerca el cursor a una vía o haz clic en un paradero…';
  }
}
function onClick(e) {
  const f = e.target.feature;
  infoEl.innerHTML = textoInfo(f) || 'Vía sin metadatos';
  infoEl.dataset.sticky = '1';
  const imgUrl = f?.properties?.imagen;
  if (imgUrl) {
    imgEl.src = imgUrl;
    imgWrap.style.display = 'block';
  } else {
    imgWrap.style.display = 'none';
  }
}
// Quita “sticky” al clicar fuera de una vía
map.on('click', () => {
  delete infoEl.dataset.sticky;
  imgWrap.style.display = 'none';
});


/* =========================================
   CARGA Y DISTRIBUCIÓN DE DATOS
   - Carga GeoJSON (ajusta la ruta)
   - Enruta cada feature a su grupo (tipo)
   - Enlaza eventos de interacción
   ========================================= */
fetch('vias.geojson') // <-- AJUSTA ruta a tu dataset
  .then(r => r.json())
  .then(geojson => {
    L.geoJSON(geojson, {
      style: estiloVia,
      onEachFeature: (feature, layer) => {
        layer.on({ mouseover: onOver, mouseout: onOut, click: onClick });
        const tipo = (feature.properties?.tipo || '').toUpperCase();
        if (capasPorTipo[tipo]) capasPorTipo[tipo].addLayer(layer);
      }
    });
  })
  .catch(() => {
    infoEl.textContent = 'No se pudieron cargar las vías.';
  });


/* =========================================
  FILTROS DE VISIBILIDAD
   - Mostrar/ocultar grupos por checkbox
   ========================================= */
filtros.forEach(chk => {
  chk.addEventListener('change', () => {
    const tipo = chk.dataset.tipo;
    if (chk.checked) {
      capasPorTipo[tipo]?.addTo(map);
    } else {
      capasPorTipo[tipo] && map.removeLayer(capasPorTipo[tipo]);
    }
  });
});


/* =========================================
   LEYENDA 
   - Control en esquina inferior derecha
   - Explica color y regla de “clase”
   ========================================= */
const legend = L.control({ position: 'bottomright' });
legend.onAdd = () => {
  const div = L.DomUtil.create('div', 'legend');
  div.innerHTML = `
    <div class="row"><span class="swatch"></span><span>Vías (rojo)</span></div>
    <div class="row"><span>Mayor clase = más claro</span></div>
  `;
  return div;
};
legend.addTo(map);
