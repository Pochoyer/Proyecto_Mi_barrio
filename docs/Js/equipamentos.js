(async () => {
  const map = L.map('map');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const overpassURL = 'https://overpass.kumi.systems/api/interpreter';

  async function safeFetchJSON(url, options) {
    const res = await fetch(url, options);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch (e) {
      console.error("⚠️ La respuesta no es JSON:", text.substring(0, 200));
      return null;
    }
  }

  // 1) Cargar polígono del barrio
  let barrioGeoJSON = await safeFetchJSON('capas/Villa_Anny_II.geojson');
  if (!barrioGeoJSON) {
    console.error("❌ No se pudo cargar el GeoJSON del barrio.");
    return;
  }

  const capaBarrio = L.geoJSON(barrioGeoJSON, {
    style: { color: 'blue', weight: 2, fillOpacity: 0 }
  }).addTo(map);

  function getOuterRingCoordinates(geojson) {
    const feat = geojson.type === 'FeatureCollection' ? geojson.features[0] : geojson;
    const geom = feat.geometry || feat;
    if (geom.type === 'Polygon') return geom.coordinates[0];
    if (geom.type === 'MultiPolygon') return geom.coordinates[0][0];
    return null;
  }

  const outerRing = getOuterRingCoordinates(barrioGeoJSON);
  if (!outerRing) {
    console.error("❌ No se pudo extraer el anillo exterior del polígono.");
    map.fitBounds(capaBarrio.getBounds());
    return;
  }
  const polyString = outerRing.map(([lon, lat]) => `${lat} ${lon}`).join(' ');

  // 2) Consulta Overpass (parques dentro del polígono)
  const query = `
    [out:json][timeout:25];
    (
      node["leisure"="park"](poly:"${polyString}");
      way["leisure"="park"](poly:"${polyString}");
      relation["leisure"="park"](poly:"${polyString}");
    );
    out geom;`;

  let data = await safeFetchJSON(overpassURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ data: query })
  });

  const parquesLayer = L.featureGroup().addTo(map);

  if (data && data.elements) {
    function nombreDe(el) {
      return (el.tags && (el.tags.name || el.tags['name:es'] || el.tags['name:en'])) || 'Parque';
    }

    data.elements.forEach(el => {
      if (el.type === 'node') {
        L.circleMarker([el.lat, el.lon], {
          radius: 6, color: '#2e7d32', fillColor: '#2e7d32', fillOpacity: 0.9
        }).bindPopup(`<b>${nombreDe(el)}</b>`).addTo(parquesLayer);
      } else if (el.geometry) {
        const coords = el.geometry.map(g => [g.lat, g.lon]);
        const isClosed = coords.length > 2 &&
                         coords[0][0] === coords[coords.length - 1][0] &&
                         coords[0][1] === coords[coords.length - 1][1];
        const shape = isClosed
          ? L.polygon(coords, { color: '#2e7d32', weight: 2, fillOpacity: 0.45 })
          : L.polyline(coords, { color: '#2e7d32', weight: 3 });

        shape.bindPopup(`<b>${nombreDe(el)}</b>`).addTo(parquesLayer);
      }
    });
  } else {
    console.warn("ℹ️ No se encontraron parques en Overpass o la consulta falló.");
  }

  // 3) Centrado de la vista
  const parquesBounds = parquesLayer.getBounds();
  if (parquesBounds.isValid()) {
    map.fitBounds(parquesBounds.pad(0.05));
  } else {
    map.fitBounds(capaBarrio.getBounds().pad(0.05));
  }
})();
