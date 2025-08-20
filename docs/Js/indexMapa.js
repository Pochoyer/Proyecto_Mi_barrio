// Inicializa Leaflet en el contenedor #map y pinta el polígono del barrio
const map = L.map('map').setView([4.711, -74.0721], 12); // Bogotá aprox.

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

fetch('capas/Villa_Anny_II.geojson')
  .then(r => r.json())
  .then(data => {
    const capa = L.geoJSON(data, {
      style: { color: 'blue', fillColor: '#3388ff', fillOpacity: 0.4 }
    }).addTo(map);
    map.fitBounds(capa.getBounds());
    capa.bindPopup('Villa Anny II');
  })
  .catch(err => console.error('Error cargando el GeoJSON:', err));
