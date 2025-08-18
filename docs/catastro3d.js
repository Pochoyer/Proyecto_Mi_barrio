// docs/catastro3d.js

// --- Configuración ---
const GEOJSON_URL = "capas/Villa_Anny_II.geojson";
const METERS_PER_FLOOR = 3;

// Claves posibles del número de pisos (ajusta si sabes el nombre exacto)
const FLOOR_KEYS = [
  "pisos", "Pisos", "NUM_PISOS", "N_PISOS", "num_pisos", "n_pisos", "pisos_totales"
];

// --- Viewer: terreno mundial + satélite ArcGIS ---
const viewer = new Cesium.Viewer("cesiumContainer", {
  terrain: Cesium.Terrain.fromWorldTerrain(),
  baseLayer: Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromBasemapType(
      Cesium.ArcGisBaseMapType.SATELLITE
    )
  ),
  timeline: false,
  animation: false,
  sceneModePicker: true,
  navigationHelpButton: false,
  geocoder: false,
  homeButton: false,
  shadows: true
});
viewer.scene.globe.depthTestAgainstTerrain = true;
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#f0f0f0");

// Helper: intenta leer "pisos" desde distintas claves
function getFloorsFromPropsBag(propsBag, now) {
  const p = propsBag && typeof propsBag.getValue === "function"
    ? (propsBag.getValue(now) || {})
    : (propsBag || {});
  for (const k of FLOOR_KEYS) {
    if (p[k] != null && !Number.isNaN(Number(p[k]))) return Number(p[k]);
  }
  return null;
}

// Carga y extruye
(async () => {
  try {
    const ds = await Cesium.GeoJsonDataSource.load(GEOJSON_URL /* sin clampToGround si vas a extruir */);
    viewer.dataSources.add(ds);

    const now = Cesium.JulianDate.now();

    for (const e of ds.entities.values) {
      const pol = e.polygon;
      if (!pol) continue;

      const floors = getFloorsFromPropsBag(e.properties, now);
      // También aceptamos un campo "altura" directo si existe
      const p = e.properties && e.properties.getValue ? (e.properties.getValue(now) || {}) : (e.properties || {});
      const alturaDirecta = (p.altura != null && !Number.isNaN(Number(p.altura))) ? Number(p.altura) : null;

      const extruded = alturaDirecta != null
        ? alturaDirecta
        : (Math.max(1, floors ?? 1) * METERS_PER_FLOOR);

      // Extrusión relativa al terreno (sale desde el suelo real)
      pol.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
      pol.extrudedHeight = extruded;
      pol.extrudedHeightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;

      // Estilo
      pol.material = Cesium.Color.fromCssColorString("#3cb371").withAlpha(0.80);
      pol.outline = true;
      pol.outlineColor = Cesium.Color.BLACK;

      // Tooltip
      e.description = `
        <table class="cesium-infoBox-defaultTable">
          <tr><th>Pisos</th><td>${floors ?? "-"}</td></tr>
          <tr><th>Altura</th><td>${extruded.toFixed(2)} m</td></tr>
        </table>
      `;
    }

    // Enfocar a la capa
    await viewer.flyTo(ds, { duration: 1.6 });

    // (Opcional) Edificios OSM recortados al barrio
    // const osm = await Cesium.createOsmBuildingsAsync();
    // viewer.scene.primitives.add(osm);
  } catch (err) {
    console.error("Error cargando GeoJSON:", err);
    alert("No se pudo cargar el GeoJSON. Revisa la consola.");
  }
})();
