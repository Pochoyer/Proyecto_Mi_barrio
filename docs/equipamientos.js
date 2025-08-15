(async () => {
  const map = L.map('map');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const iconoParque = L.icon({
    iconUrl: 'imagenes/arbol.png',       // Ruta a tu ícono
    iconSize: [32, 32],                  // Ajusta a tu gusto
    iconAnchor: [16, 32],                // Centro inferior del ícono
    popupAnchor: [0, -32]                // Punto emergente del popup
  });

  async function cargarGeoJSON(url, style, popupProp = null, addMarker = false) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const data = await res.json();

      const capa = L.geoJSON(data, {
        style: style,
        onEachFeature: (feature, layer) => {
          if (popupProp && feature.properties) {
            const nombre = feature.properties[popupProp] || 'Sin nombre';
            layer.bindPopup(`<b>${nombre}</b>`);
          }
          if (addMarker && feature.geometry.type.includes('Polygon')) {
            const centro = layer.getBounds().getCenter();
            const nombre = feature.properties?.[popupProp] || 'Sin nombre';
            L.marker(centro, { icon: iconoParque })
              .bindPopup(`<b>${nombre}</b>`)
              .addTo(map);
          }
        }
      }).addTo(map);

      return capa;
    } catch (err) {
      console.error(`Error cargando ${url}:`, err);
      return null;
    }
  }

  const capaBarrio = await cargarGeoJSON(
    'capas/Sector_Villa_Anny_II.json',
    { color: 'blue', weight: 2, fillOpacity: 0 }
  );

  const capaParque = await cargarGeoJSON(
    'capas/Parque.json',
    { color: 'green', weight: 2, fillOpacity: 0.5 },
    'name',
    true
  );

  if (capaParque && capaParque.getBounds().isValid()) {
    map.fitBounds(capaParque.getBounds().pad(0.05));
  } else if (capaBarrio && capaBarrio.getBounds().isValid()) {
    map.fitBounds(capaBarrio.getBounds().pad(0.05));
  }
})();