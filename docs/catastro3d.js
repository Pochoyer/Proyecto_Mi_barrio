// docs/catastro3d.js

// --- Configuración ---
const GEOJSON_URL = "capas/Villa_Anny_II.geojson";
const METERS_PER_FLOOR = 3;
const PADDING_METERS = 1000; // 👈 margen real alrededor del barrio

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

// --- Enfocar a bbox exacto del DataSource, con padding en METROS ---
async function focusOnDataSourceMeters(dataSource, duration = 1.6, paddingMeters = 300) {
  const now = Cesium.JulianDate.now();

  let west = 180, south = 90, east = -180, north = -90;
  const updateFromCartesian = (pos) => {
    const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(pos);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    west = Math.min(west, lon);
    south = Math.min(south, lat);
    east = Math.max(east, lon);
    north = Math.max(north, lat);
  };

  const walkHierarchy = (h) => {
    (h.positions || []).forEach(updateFromCartesian);
    (h.holes || []).forEach(walkHierarchy);
  };

  for (const ent of dataSource.entities.values) {
    if (ent.polygon?.hierarchy) {
      const hier = ent.polygon.hierarchy.getValue(now);
      if (hier) walkHierarchy(hier);
    } else if (ent.position?.getValue) {
      const pos = ent.position.getValue(now);
      if (pos) updateFromCartesian(pos);
    }
  }

  if (west < east && south < north) {
    // Rectangle en radianes
    const rect = Cesium.Rectangle.fromDegrees(west, south, east, north);

    // Padding en radianes (metros → rad). Para longitud se ajusta por cos(lat).
    const R = 6378137.0; // radio WGS84 (m)
    const padLatRad = paddingMeters / R;
    const centerLatRad = (rect.north + rect.south) / 2.0;
    const padLonRad = paddingMeters / (R * Math.max(Math.cos(centerLatRad), 1e-6));

    rect.west  -= padLonRad;
    rect.east  += padLonRad;
    rect.south -= padLatRad;
    rect.north += padLatRad;

    await viewer.camera.flyTo({ destination: rect, duration });
  } else {
    await viewer.flyTo(dataSource, { duration });
  }
}

// --- Carga y extrusión ---
(async () => {
  try {
    const ds = await Cesium.GeoJsonDataSource.load(GEOJSON_URL); // sin clampToGround si vas a extruir
    viewer.dataSources.add(ds);

    const now = Cesium.JulianDate.now();

    for (const e of ds.entities.values) {
      const pol = e.polygon;
      if (!pol) continue;

      const floors = getFloorsFromPropsBag(e.properties, now);
      const p = e.properties && e.properties.getValue ? (e.properties.getValue(now) || {}) : (e.properties || {});
      const alturaDirecta = (p.altura != null && !Number.isNaN(Number(p.altura))) ? Number(p.altura) : null;

      const extruded = alturaDirecta != null
        ? alturaDirecta
        : (Math.max(1, floors ?? 1) * METERS_PER_FLOOR);

      // Extrusión relativa al terreno (sale desde el suelo real)
      pol.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
      pol.extrudedHeight = extruded;
      pol.extrudedHeightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;

      pol.material = Cesium.Color.fromCssColorString("#3cb371").withAlpha(0.80);
      pol.outline = true;
      pol.outlineColor = Cesium.Color.BLACK;

      e.description = `
        <table class="cesium-infoBox-defaultTable">
          <tr><th>Pisos</th><td>${floors ?? "-"}</td></tr>
          <tr><th>Altura</th><td>${extruded.toFixed(2)} m</td></tr>
        </table>
      `;
    }

    // 👇 Enfocar con margen real de 300 m (ajusta PADDING_METERS si quieres)
    await focusOnDataSourceMeters(ds, 1.6, PADDING_METERS);

    // (Opcional) OSM Buildings + clipping con el mismo bbox (pídelo y lo añado)
    // const osm = await Cesium.createOsmBuildingsAsync();
    // viewer.scene.primitives.add(osm);

  } catch (err) {
    console.error("Error cargando GeoJSON:", err);
    alert("No se pudo cargar el GeoJSON. Revisa la consola.");
  }
})();
