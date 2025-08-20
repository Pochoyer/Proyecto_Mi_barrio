const map = L.map('map-aq', { zoomControl: true }).setView([4.6050257972928375, -74.20169397856526], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, attribution: '&copy; OpenStreetMap' }).addTo(map);

const infoBox = document.getElementById('aq-info');
function setInfo(html) { infoBox.innerHTML = html; }

function aqiColor(aqi) {
  if (aqi == null) return '#9e9e9e';
  if (aqi <= 50) return '#009966';
  if (aqi <= 100) return '#ffde33';
  if (aqi <= 150) return '#ff9933';
  if (aqi <= 200) return '#cc0033';
  if (aqi <= 300) return '#660099';
  return '#7e0023';
}

function aqiCategory(aqi) {
  if (aqi == null) return 'Sin dato';
  if (aqi <= 50) return 'Buena';
  if (aqi <= 100) return 'Moderada';
  if (aqi <= 150) return 'Dañina a sensibles';
  if (aqi <= 200) return 'Dañina';
  if (aqi <= 300) return 'Muy dañina';
  return 'Peligrosa';
}

function fmt(x, digits=1) { if (x == null || isNaN(x)) return '-'; return Number(x).toFixed(digits); }

async function loadOpenMeteoAQ(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: ['us_aqi','pm2_5','pm10','nitrogen_dioxide','ozone','sulphur_dioxide','carbon_monoxide'].join(','),
    timezone: 'America/Bogota'
  });
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo obtener calidad del aire');
  return res.json();
}

function latestIndex(times) {
  let idx = times.length - 1, now = new Date();
  for (let i = times.length - 1; i >= 0; i--) { const t = new Date(times[i]); if (t <= now) { idx = i; break; } }
  return idx;
}

function panelHTML(t, aqi, p25, p10, no2, o3, so2, co, lat, lon) {
  const d = t ? new Date(t) : null;
  const when = d ? d.toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '-';
  return `<strong>US AQI:</strong> ${aqi ?? '-'} (${aqiCategory(aqi)})<br>
          <strong>PM2.5:</strong> ${fmt(p25)} µg/m³<br>
          <strong>PM10:</strong> ${fmt(p10)} µg/m³<br>
          <strong>NO₂:</strong> ${fmt(no2)} µg/m³<br>
          <strong>O₃:</strong> ${fmt(o3)} µg/m³<br>
          <strong>SO₂:</strong> ${fmt(so2)} µg/m³<br>
          <strong>CO:</strong> ${fmt(co)} µg/m³<br>
          <span class="soft">Hora: ${when}</span><br>
          <span class="soft">Punto: ${fmt(lat,5)}, ${fmt(lon,5)}</span>`;
}

function addLegendAQI() {
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'legend');
    const rows = [
      {c:'#009966', t:'0–50 Buena'},
      {c:'#ffde33', t:'51–100 Moderada'},
      {c:'#ff9933', t:'101–150 Sensibles'},
      {c:'#cc0033', t:'151–200 Dañina'},
      {c:'#660099', t:'201–300 Muy dañina'},
      {c:'#7e0023', t:'301–500 Peligrosa'}
    ];
    div.innerHTML = `<div><strong>US AQI</strong></div>` + rows.map(r => `<div class="row"><span class="swatch" style="background:${r.c}"></span> ${r.t}</div>`).join('');
    return div;
  };
  legend.addTo(map);
}

const AREA_URL = './capas/Villa_Anny_II.geojson';

async function loadArea() {
  const r = await fetch(AREA_URL);
  if (!r.ok) throw new Error('No se pudo cargar el polígono del área');
  return r.json();
}

let areaLayer, areaData, popup;

async function colorizePolygonByAQI(lat, lon) {
  const data = await loadOpenMeteoAQ(lat, lon);
  const h = data.hourly || {};
  const idx = latestIndex(h.time || []);
  const aqi = h.us_aqi ? h.us_aqi[idx] : null;
  const p25 = h.pm2_5 ? h.pm2_5[idx] : null;
  const p10 = h.pm10 ? h.pm10[idx] : null;
  const no2 = h.nitrogen_dioxide ? h.nitrogen_dioxide[idx] : null;
  const o3  = h.ozone ? h.ozone[idx] : null;
  const so2 = h.sulphur_dioxide ? h.sulphur_dioxide[idx] : null;
  const co  = h.carbon_monoxide ? h.carbon_monoxide[idx] : null;
  const t   = (h.time && h.time[idx]) ? h.time[idx] : null;
  const color = aqiColor(aqi);
  if (areaLayer) areaLayer.setStyle({ color: color, weight: 2, fillColor: color, fillOpacity: 0.45, opacity: 0.9 });
  const html = panelHTML(t, aqi, p25, p10, no2, o3, so2, co, lat, lon);
  setInfo(html);
  const where = L.latLng(lat, lon);
  if (popup) popup.remove();
  popup = L.popup({ maxWidth: 260 }).setLatLng(where).setContent(`<div style="min-width:220px">${html}</div>`).openOn(map);
}

(async function bootstrap(){
  try {
    let lat = 4.6050257972928375, lon = -74.20169397856526;
    areaData = await loadArea();
    areaLayer = L.geoJSON(areaData, { style: { color:'#333', weight:2, fillColor:'#5dade2', fillOpacity:0.12 } }).addTo(map);
    const b = areaLayer.getBounds();
    if (b.isValid()) map.fitBounds(b.pad(0.05));
    const centroid = turf.centroid(areaData);
    if (centroid && centroid.geometry && centroid.geometry.coordinates) {
      lon = centroid.geometry.coordinates[0];
      lat = centroid.geometry.coordinates[1];
    }
    await colorizePolygonByAQI(lat, lon);
    addLegendAQI();
    map.on('click', async (e) => { await colorizePolygonByAQI(e.latlng.lat, e.latlng.lng); });
  } catch (e) {
    console.error(e);
    setInfo('No se pudo cargar la calidad del aire. Reintenta.');
  }
})();
