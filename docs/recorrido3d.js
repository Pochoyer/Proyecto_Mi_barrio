// docs/recorrido3d.js — Recorrido 3D robusto sobre Catastro

// ===== Config =====
const CATASTRO_URL     = "capas/Villa_Anny_II.geojson";
const ROUTE_URL        = "capas/recorrido_villa_anny.geojson";

const USE_ION_TERRAIN  = false;   // ← cambia a true si usarás terreno Ion (requiere token en el HTML)
const METERS_PER_FLOOR = 3;
const BASE_SPEED_MPS   = 12;      // velocidad base (1×) en m/s
const CAMERA_ALTITUDE  = 35;      // altura de cámara sobre el terreno
const PADDING_METERS   = 800;     // margen para encuadre en metros

const FLOOR_KEYS = ["pisos","Pisos","NUM_PISOS","N_PISOS","num_pisos","n_pisos","pisos_totales"];
const log  = (...a)=>console.log("[Recorrido3D]", ...a);
const warn = (...a)=>console.warn("[Recorrido3D]", ...a);
const err  = (...a)=>console.error("[Recorrido3D]", ...a);

// ===== Asegurar altura del contenedor =====
(() => {
  const el = document.getElementById("cesiumContainer");
  if (el && el.clientHeight < 200) {
    el.style.minHeight = "70vh";     // por si el CSS externo no lo fijó
    el.style.height    = "70vh";
  }
})();

// ===== Viewer =====
// ===== Asegurar altura del contenedor =====
(() => {
  const el = document.getElementById("cesiumContainer");
  if (el && el.clientHeight < 200) {
    el.style.height = "70vh";
    el.style.minHeight = "560px";
  }
})();

// ===== Viewer =====
const terrainProvider = USE_ION_TERRAIN
  ? Cesium.Terrain.fromWorldTerrain()
  : new Cesium.EllipsoidTerrainProvider();

// ⬇️ Usa imageryProvider con OSM para evitar el 404 de ArcGIS
const viewer = new Cesium.Viewer("cesiumContainer", {
  terrain: terrainProvider,
  imageryProvider: new Cesium.UrlTemplateImageryProvider({
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    credit: "© OpenStreetMap contributors"
  }),
  // (no uses baseLayer aquí)
  timeline: true,
  animation: true,
  sceneModePicker: true,
  navigationHelpButton: false,
  geocoder: false,
  homeButton: false,
  shadows: true,
  infoBox: false,
  selectionIndicator: false,
  shouldAnimate: true
});
viewer.scene.globe.depthTestAgainstTerrain = true;
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#f0f0f0");


// ===== Utils =====
function readFloors(bag, now){
  const p = bag && typeof bag.getValue==="function" ? (bag.getValue(now)||{}) : (bag||{});
  for (const k of FLOOR_KEYS) {
    const v = p[k];
    if (v!=null && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function rectangleFromPositions(positions){
  if (!positions?.length) return null;
  let w=180, s=90, e=-180, n=-90;
  for (const pos of positions) {
    const c = Cesium.Ellipsoid.WGS84.cartesianToCartographic(pos);
    const lon = Cesium.Math.toDegrees(c.longitude);
    const lat = Cesium.Math.toDegrees(c.latitude);
    w = Math.min(w, lon); e = Math.max(e, lon);
    s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return Cesium.Rectangle.fromDegrees(w, s, e, n);
}

function unionRect(a, b){
  if (!a) return b;
  if (!b) return a;
  return new Cesium.Rectangle(
    Math.min(a.west,  b.west),
    Math.min(a.south, b.south),
    Math.max(a.east,  b.east),
    Math.max(a.north, b.north)
  );
}

async function flyToRectangleWithPadding(rect, duration=1.2, padMeters=PADDING_METERS){
  if (!rect) return;
  const R = 6378137;
  const centerLat = (rect.north + rect.south) / 2;
  const dLat = padMeters / R;
  const dLon = padMeters / (R * Math.max(Math.cos(centerLat), 1e-6));
  const padded = new Cesium.Rectangle(rect.west-dLon, rect.south-dLat, rect.east+dLon, rect.north+dLat);
  await viewer.camera.flyTo({ destination: padded, duration });
}

function bboxFromDataSource(ds){
  const now = Cesium.JulianDate.now();
  let w=180, s=90, e=-180, n=-90;

  const addPos = (pos) => {
    const c = Cesium.Ellipsoid.WGS84.cartesianToCartographic(pos);
    const lon = Cesium.Math.toDegrees(c.longitude);
    const lat = Cesium.Math.toDegrees(c.latitude);
    w = Math.min(w, lon); e = Math.max(e, lon);
    s = Math.min(s, lat); n = Math.max(n, lat);
  };

  const walk = (h) => {
    (h.positions || []).forEach(addPos);
    (h.holes || []).forEach(walk);
  };

  for (const ent of ds.entities.values) {
    if (ent.polygon?.hierarchy) {
      const hier = ent.polygon.hierarchy.getValue(now);
      if (hier) walk(hier);
    } else if (ent.position?.getValue) {
      const p = ent.position.getValue(now);
      if (p) addPos(p);
    }
  }
  if (w<e && s<n) return Cesium.Rectangle.fromDegrees(w, s, e, n);
  return null;
}

// ===== Cargar Catastro (extrusión visible con/ sin terreno) =====
async function loadCatastro(){
  log("Cargando catastro…", CATASTRO_URL);
  const ds = await Cesium.GeoJsonDataSource.load(CATASTRO_URL);
  viewer.dataSources.add(ds);

  const now = Cesium.JulianDate.now();
  const USING_ELLIPSOID = viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider;
  let count = 0;

  for (const e of ds.entities.values) {
    const pol = e.polygon; if (!pol) continue;

    const p = e.properties?.getValue?.(now) || e.properties || {};
    const pisos = readFloors(e.properties, now);
    const altura = (p.altura!=null && !Number.isNaN(Number(p.altura)))
      ? Number(p.altura)
      : (Math.max(1, pisos ?? 1) * METERS_PER_FLOOR);

    if (USING_ELLIPSOID) {
      // Extrusión absoluta (sin terreno real)
      pol.height = 0.0;
      pol.extrudedHeight = altura;
      pol.heightReference = Cesium.HeightReference.NONE;
      pol.extrudedHeightReference = Cesium.HeightReference.NONE;
      pol.perPositionHeight = false;
    } else {
      // Relativo al terreno Ion
      pol.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
      pol.extrudedHeight = altura;
      pol.extrudedHeightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
    }

    pol.material = Cesium.Color.fromCssColorString("#3cb371").withAlpha(0.85);
    pol.outline = true;
    pol.outlineColor = Cesium.Color.BLACK;
    count++;
  }

  log(`Catastro OK. Polígonos extruidos: ${count}`);
  return ds;
}

// ===== Cargar Ruta (LineString / MultiLineString; fallback a bordes) =====
async function loadRouteCoords(url){
  const res = await fetch(url, { cache:"no-store" });
  if (!res.ok) throw new Error(`Ruta no encontrada (HTTP ${res.status}) en ${url}`);
  const gj = await res.json();

  const coords = [];
  const pushLine = (arr)=>arr.forEach(c=>{
    if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) coords.push([c[0], c[1]]);
  });

  const handleGeom = (g)=>{
    if (!g) return;
    if (g.type==="LineString") pushLine(g.coordinates);
    else if (g.type==="MultiLineString") (g.coordinates||[]).forEach(pushLine);
    else if (g.type==="Polygon" && g.coordinates?.[0]) pushLine(g.coordinates[0]);            // fallback
    else if (g.type==="MultiPolygon") (g.coordinates||[]).forEach(poly=>poly?.[0] && pushLine(poly[0]));
  };

  if (gj.type==="FeatureCollection") (gj.features||[]).forEach(f=>handleGeom(f.geometry));
  else if (gj.type==="Feature") handleGeom(gj.geometry);
  else handleGeom(gj);

  if (coords.length < 2) throw new Error("La ruta no contiene líneas válidas (LineString/MultiLineString).");
  log(`Ruta OK. Puntos: ${coords.length}`);
  return coords;
}

// ===== Animación de Recorrido =====
async function animateFromCoords(lonlat){
  const carto = lonlat.map(([lon,lat])=>Cesium.Cartographic.fromDegrees(lon,lat));

  let positions;
  if (USE_ION_TERRAIN) {
    try{
      const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, carto);
      positions = sampled.map(c=>Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,(c.height||0)+CAMERA_ALTITUDE));
      log("Muestreo de terreno OK.");
    }catch(e){
      warn("sampleTerrainMostDetailed falló; usando altura fija.", e);
      positions = carto.map(c=>Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,CAMERA_ALTITUDE));
    }
  } else {
    // Sin terreno Ion: altura constante
    positions = carto.map(c=>Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,CAMERA_ALTITUDE));
  }

  const start = Cesium.JulianDate.now();
  const posProp = new Cesium.SampledPositionProperty();
  let t = 0;
  const dist = (a,b)=>Cesium.Cartesian3.distance(a,b);

  for (let i=0;i<positions.length;i++){
    posProp.addSample(Cesium.JulianDate.addSeconds(start,t,new Cesium.JulianDate()), positions[i]);
    if (i<positions.length-1) t += dist(positions[i],positions[i+1]) / BASE_SPEED_MPS;
  }
  const stop = Cesium.JulianDate.addSeconds(start,t,new Cesium.JulianDate());

  // Entidad móvil + línea
  const mover = viewer.entities.add({
    name: "Recorrido 3D",
    position: posProp,
    orientation: new Cesium.VelocityOrientationProperty(posProp),
    point: { pixelSize: 12, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
    path:  { leadTime: 0, trailTime: 60, material: Cesium.Color.YELLOW, width: 4 }
  });

  viewer.entities.add({
    polyline: {
      positions,
      clampToGround: false,
      width: 3,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: .15, color: Cesium.Color.ORANGE })
    }
  });

  // Reloj y seguimiento
  viewer.clock.startTime   = start.clone();
  viewer.clock.stopTime    = stop.clone();
  viewer.clock.currentTime = start.clone();
  viewer.clock.clockRange  = Cesium.ClockRange.CLAMPED;
  viewer.clock.multiplier  = 1.0;
  viewer.clock.shouldAnimate = true;

  viewer.trackedEntity = mover;

  // Encuadre
  const rect = rectangleFromPositions(positions);
  await flyToRectangleWithPadding(rect, 1.2, PADDING_METERS);

  // UI (si existe en tu HTML)
  const btnPlay  = document.getElementById("btnPlay");
  const btnReset = document.getElementById("btnReset");
  const speedR   = document.getElementById("speedRange");
  const speedVal = document.getElementById("speedVal");
  const upd = ()=>{ const m = Number(speedR?.value || 1); viewer.clock.multiplier = m; if (speedVal) speedVal.textContent = `${m.toFixed(1)}×`; };
  btnPlay?.addEventListener("click", ()=> viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate );
  btnReset?.addEventListener("click", ()=> { viewer.clock.currentTime = viewer.clock.startTime.clone(); viewer.clock.shouldAnimate = true; });
  speedR?.addEventListener("input", upd); upd();
}

// ===== Run =====
(async()=>{
  try{
    // 1) Catastro (si falla, seguirá la ruta)
    let catastroDS = null;
    try {
      catastroDS = await loadCatastro();
    } catch (e) {
      warn("Catastro no cargó; continúo solo con la ruta.", e);
    }

    // 2) Ruta y animación
    const coords = await loadRouteCoords(ROUTE_URL);
    await animateFromCoords(coords);

    // 3) Encadre mixto (catastro + ruta), por si quieres reencuadrar:
    if (catastroDS) {
      const rCat = bboxFromDataSource(catastroDS);
      // si quieres encuadre combinado, descomenta:
      // const rRoute = rectangleFromPositions(viewer.entities.values.find(e=>e.polyline)?.polyline.positions.getValue(Cesium.JulianDate.now()) || []);
      // await flyToRectangleWithPadding(unionRect(rCat, rRoute), 1.2, PADDING_METERS);
      await flyToRectangleWithPadding(rCat, 1.2, PADDING_METERS);
    }

    log("Recorrido 3D listo.");
  }catch(e){
    err("Error al iniciar Recorrido 3D:", e);
    alert(`No se pudo iniciar el Recorrido 3D.\n${e?.message || e}`);
  }
})();
