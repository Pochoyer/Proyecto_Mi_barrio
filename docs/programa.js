// Inicializar mapa centrado en Bogotá
const mapa = L.map('mapa').setView([4.711, -74.0721], 12); // Zoom más alto

// Capa base de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(mapa);

// Cargar polígono desde archivo GeoJSON
fetch('capas/Sector_Villa_Anny_II.json')
    .then(response => response.json())
    .then(data => {
        const capaGeoJSON = L.geoJSON(data, {
            style: {
                color: 'blue',
                fillColor: '#3388ff',
                fillOpacity: 0.4
            }
        }).addTo(mapa);

        // Centrar mapa en el polígono
        mapa.fitBounds(capaGeoJSON.getBounds());

        capaGeoJSON.bindPopup("Villa Anny II");
    })
    .catch(err => console.error("Error cargando el GeoJSON:", err));
