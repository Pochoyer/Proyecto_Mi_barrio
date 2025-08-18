// --- Configuración ---
const GEOJSON_URL = "capas/Villa_Anny_II.geojson";
const METERS_PER_FLOOR = 3;

// Posibles nombres del campo "pisos" en tu GeoJSON.
// Si sabes el nombre exacto, ponlo primero (o deja uno solo).
const FLOOR_KEYS = [
  "pisos", "Pisos", "NUM_PISOS", "N_PISOS", "num_pisos", "n_pisos", "pisos_totales"
];

// --- Inicialización de Cesium ---
const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  navigationHelpButton: false,
  sceneModePicker: true,
  timeline: false,
  animation: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  imageryProvider: new Cesium.OpenStreetMapImageryProvider({
    url: "https://a.tile.openstreetmap.org/"
  })
});

viewer.scene.globe.enableLighting = false; // sin sombras globales por ahora

// Helper: obtiene # de pisos desde properties (intenta varias claves)
function getFloorsFromProps(props) {
  if (!props) return 1;
  for (const k of FLOOR_KEYS) {
    const v = props[k];
    if (v !== undefined && v !== null) {
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) return n;
    }
  }
  return 1; // por defecto 1 piso si no hay dato
}

// Carga el GeoJSON y aplica extrusión
(async () => {
  try {
    const dataSource = await Cesium.GeoJsonDataSource.load(GEOJSON_URL, {
      clampToGround: false
    });
    viewer.dataSources.add(dataSource);

    const now = Cesium.JulianDate.now();
    const entities = dataSource.entities.values;

    for (const e of entities) {
      if (!e.polygon) continue;

      // Obtiene properties como objeto plano
      let props = {};
      if (e.properties) {
        props = typeof e.properties.getValue === "function"
          ? e.properties.getValue(now) || {}
          : e.properties; // en algunas versiones ya es plano
      }

      const floors = getFloorsFromProps(props);
      const extruded = floors * METERS_PER_FLOOR;

      // Estilo de extrusión
      e.polygon.height = 0.0;
      e.polygon.extrudedHeight = extruded;
      e.polygon.material = Cesium.Color.fromCssColorString("#3cb371").withAlpha(0.65);
      e.polygon.outline = true;
      e.polygon.outlineColor = Cesium.Color.BLACK;

      // Tooltip sencillo al click
      e.description = `
        <table class="cesium-infoBox-defaultTable">
          <tr><th>Pisos</th><td>${floors}</td></tr>
          <tr><th>Altura</th><td>${extruded.toFixed(2)} m</td></tr>
        </table>
      `;
    }

    // Enfoca vista a la capa
    await viewer.flyTo(dataSource, { duration: 1.8 });
  } catch (err) {
    console.error("Error cargando GeoJSON:", err);
    alert("No se pudo cargar el GeoJSON. Ver consola para detalles.");
  }
})();
