// ===================== Configuración básica (legacy) =====================
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZmY0NWQzNC02NDBkLTRlODEtODc2NS01NWM4ZGZmZTMwZDAiLCJpZCI6MzMxMzcyLCJpYXQiOjE3NTU3MDI0OTJ9.B-IN-s6o7M6IK29nfXCBvFbpKhCI5lnEHTG2uDq1CPM";

// Tu LineString GeoJSON
const ROUTE_FC = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {},
      "geometry": {
        "coordinates": [
          [-74.20463183506786, 4.60088620939915],
          [-74.20456059129548, 4.602732576185076],
          [-74.20194831962922, 4.60279175453033],
          [-74.2009390327305,  4.6033006880982725],
          [-74.20194831928515, 4.605667816252634],
          [-74.20034533434023, 4.6068750485916325]
        ],
        "type": "LineString"
      }
    }
  ]
};

// ===================== Utilidades =====================
function distanceCartesian(a, b){ return Cesium.Cartesian3.distance(a, b); }
function pathLengthMeters(ps){ let s=0; for(let i=1;i<ps.length;i++) s+=distanceCartesian(ps[i-1],ps[i]); return s; }
function totalSecondsFor(meters, kmh){ const mps=Math.max((kmh*1000)/3600,0.01); return meters/mps; }
function fmtMeters(m){ return m>=1000 ? (m/1000).toFixed(2)+" km" : m.toFixed(0)+" m"; }
function fmtDuration(sec){ const s=Math.max(0,Math.round(sec)); const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), r=s%60;
  if(h) return `${h}h ${m}m ${r}s`; if(m) return `${m}m ${r}s`; return `${r}s`; }
function lineStringToCartographic(coords){ return coords.map(([lon,lat])=>Cesium.Cartographic.fromDegrees(lon,lat,0)); }
// ======== EXTRUSIÓN DE EDIFICIOS (Catastro 3D) ========
const GEOJSON_URL = "capas/Const_Villa_Anny_II.json";
const METERS_PER_FLOOR = 3;

// Claves posibles en el GeoJSON para # de pisos (ajústalas si difiere)
const FLOOR_KEYS = ["CONELEVACI","pisos","Pisos","NUM_PISOS","N_PISOS","num_pisos","n_pisos","pisos_totales"];

// Lee pisos desde la bolsa de propiedades (soporta propiedades estáticas o time-dynamic)
function getFloorsFromPropsBag(propsBag, now) {
  const p = propsBag && typeof propsBag.getValue === "function"
    ? (propsBag.getValue(now) || {})
    : (propsBag || {});
  for (const k of FLOOR_KEYS) {
    if (p[k] != null && !Number.isNaN(Number(p[k]))) return Number(p[k]);
  }
  return null;
}

// Carga y extruye polígonos del GeoJSON (no auto-cambia cámara)
async function loadExtrudedBuildings() {
  const ds = await Cesium.GeoJsonDataSource.load(GEOJSON_URL); // no uses clampToGround si vas a extruir
  viewer.dataSources.add(ds);

  const now = Cesium.JulianDate.now();

  for (const e of ds.entities.values) {
    const pol = e.polygon;
    if (!pol) continue;

    const floors = getFloorsFromPropsBag(e.properties, now);
    const props = e.properties && e.properties.getValue ? (e.properties.getValue(now) || {}) : (e.properties || {});
    const alturaDirecta = (props.altura != null && !Number.isNaN(Number(props.altura))) ? Number(props.altura) : null;

    const extruded = alturaDirecta != null
      ? alturaDirecta
      : (Math.max(1, floors ?? 1) * METERS_PER_FLOOR);

    // Extrusión referida al terreno
    pol.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
    pol.extrudedHeight = extruded;
    pol.extrudedHeightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;

    // Estilo del edificio
    pol.material = Cesium.Color.fromCssColorString("#b66d0eff").withAlpha(0.80);
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

  // (Opcional) si quieres reencuadrar al barrio:
  // await viewer.flyTo(ds, { duration: 1.6 });
}


// ===================== UI refs =====================
const speedInput = document.getElementById("speed");
const followCheckbox = document.getElementById("followCam");
const playBtn = document.getElementById("play");
const pauseBtn = document.getElementById("pause");
const resetBtn = document.getElementById("reset");
const totalLengthEl = document.getElementById("totalLength");
const totalTimeEl = document.getElementById("totalTime");
// === UI extra (dibujo) ===
const drawBtn = document.getElementById("draw");
const finishBtn = document.getElementById("finishDraw");
const cancelBtn = document.getElementById("cancelDraw");

// === Estado para dibujo de recorrido ===
let drawing = false;
let drawHandler = null;
let draftPositionsCart = [];     // Cartographic provisional (lon/lat/alt ~0)
let draftPositions = [];         // Cartesian provisional (vista)
let draftPolylineEntity = null;
let draftPointEntities = [];


// ===================== Estado =====================
let viewer, routeEntity, moverEntity;
let routePositionsCartesian = [];
let routeLengthMeters = 0;
let startTime, stopTime, sampledPos;

// ===================== App (IIFE async) =====================
(async function main(){
  try {
    // 1) Terrain (legacy): crea el provider primero
    const terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);

    // 2) Viewer con terrainProvider (¡ojo: NO uses "terrain" aquí!)
    viewer = new Cesium.Viewer("cesiumContainer", {
      terrainProvider,
      animation: true,
      timeline: true,
      baseLayerPicker: true,
      geocoder: true,
      shouldAnimate: true
    });

    // 3) Preparar ruta
    await initRoute();

    // 3.1) Cargar edificios extruidos del catastro 3D
    await loadExtrudedBuildings();

    // 4) UI
    wireUI();
    
    // Permite hacer pick sobre terreno para obtener alturas
    viewer.scene.globe.depthTestAgainstTerrain = true;

  } catch (err) {
    console.error("Error al iniciar:", err);
    alert("Fallo al iniciar Cesium:\n" + (err?.message || String(err)));
  }
})();

// ===================== Carga y animación de ruta =====================
async function initRoute(){
  const coords = ROUTE_FC.features[0]?.geometry?.coordinates || [];
  if (coords.length < 2) throw new Error("La ruta necesita al menos 2 puntos.");

  // A) a Cartographic
  let carto = lineStringToCartographic(coords);

  // B) samplear alturas usando EL MISMO provider del viewer
  carto = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, carto);

  // C) a Cartesian3 (con altura mínima)
  routePositionsCartesian = carto.map(c =>
    Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(c.height||0, 10))
  );

  // D) dibujar polilínea (sin clampToGround porque ya tienes alturas)
  if (routeEntity) viewer.entities.remove(routeEntity);
  routeEntity = viewer.entities.add({
  name: "Ruta",
  polyline: {
    positions: routePositionsCartesian,
    width: 2,
    clampToGround: false,
    material: Cesium.Color.YELLOW.withAlpha(1.0)   // transparente
  }
});

  // E) longitud y animación inicial
  routeLengthMeters = pathLengthMeters(routePositionsCartesian);
  //rebuildWithSpeed();
  viewer.flyTo(routeEntity, {
  offset: new Cesium.HeadingPitchRange(
    viewer.scene.camera.heading, 
    Cesium.Math.toRadians(-20),  // inclinación (más negativo = más arriba)
    1000                          // distancia (ajústalo a tu gusto)
  )
});
}

function rebuildWithSpeed(){
  const kmh = Number(speedInput?.value || 30);
  if (routePositionsCartesian.length < 2) return;

  const totalSec = Math.max(1, totalSecondsFor(routeLengthMeters, kmh));
  const property = new Cesium.SampledPositionProperty();

  // distancias acumuladas (evita 0)
  const cum = [0];
  for (let i=1;i<routePositionsCartesian.length;i++){
    const d = distanceCartesian(routePositionsCartesian[i-1], routePositionsCartesian[i]);
    cum.push(cum[cum.length-1] + d);
  }
  const total = Math.max(1, cum[cum.length-1]);

  startTime = Cesium.JulianDate.now();
  stopTime  = Cesium.JulianDate.addSeconds(startTime, totalSec, new Cesium.JulianDate());

  for (let i=0;i<routePositionsCartesian.length;i++){
    const t = (cum[i]/total) * totalSec;
    const when = Cesium.JulianDate.addSeconds(startTime, t, new Cesium.JulianDate());
    property.addSample(when, routePositionsCartesian[i]);
  }
  sampledPos = property;

  // Entidad móvil
  if (moverEntity) viewer.entities.remove(moverEntity);
  moverEntity = viewer.entities.add({
    name: "Dron virtual",
    availability: new Cesium.TimeIntervalCollection([
      new Cesium.TimeInterval({ start: startTime, stop: stopTime })
    ]),
    position: sampledPos,
    orientation: new Cesium.VelocityOrientationProperty(sampledPos),
    model: {
      uri: Cesium.buildModuleUrl("Assets/Models/CesiumAir/Cesium_Air.glb"),
      minimumPixelSize: 48,
      maximumScale: 200
    },
    path: {
      resolution: 1,
      material: Cesium.Color.CYAN.withAlpha(0.6),
      width: 3,
      leadTime: 0,
      trailTime: 60
    }
  });

  // Reloj
  viewer.clock.startTime   = startTime.clone();
  viewer.clock.stopTime    = stopTime.clone();
  viewer.clock.currentTime = startTime.clone();
  viewer.clock.clockRange  = Cesium.ClockRange.CLAMPED;
  viewer.clock.multiplier  = 1;
  viewer.timeline.zoomTo(startTime, stopTime);

  // UI
  totalLengthEl.textContent = fmtMeters(routeLengthMeters);
  totalTimeEl.textContent   = fmtDuration(Cesium.JulianDate.secondsDifference(stopTime, startTime));

  // Seguimiento y “play”
  applyFollowCamera();
  viewer.clock.shouldAnimate = false;
  // ====== VALIDADORES ======
  ensureDebugDot();
  hookTickLogger();
  debugStatus('rebuildWithSpeed:end');
}

// ============ CÁMARA: seguir al dron con ángulo agradable ============
function applyFollowCamera(){
  if (!viewer || !moverEntity) return;

  if (followCheckbox?.checked) {
    viewer.trackedEntity = moverEntity;
    console.log('tracking set to moverEntity:', moverEntity.id || '(sin id)');

    viewer.scene.camera.setView({
      orientation: {
        heading: viewer.scene.camera.heading,
        pitch: Cesium.Math.toRadians(-25),
        roll: 0
      }
    });

    if (!applyFollowCamera.__nudgeOnce) {
      applyFollowCamera.__nudgeOnce = true;
      const pos = moverEntity.position.getValue(viewer.clock.currentTime);
      if (pos) {
        const hpRange = new Cesium.HeadingPitchRange(
          viewer.scene.camera.heading,
          Cesium.Math.toRadians(-25),
          120
        );
        viewer.scene.camera.lookAt(pos, hpRange);
        viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      }
    }
  } else {
    viewer.trackedEntity = undefined;
    viewer.scene.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  debugStatus('applyFollowCamera');
}

// ===================== Eventos UI =====================
function wireUI(){
  playBtn?.addEventListener("click", () => {
    viewer.clock.shouldAnimate = true;
    applyFollowCamera();
  });
  pauseBtn?.addEventListener("click", () => {
    viewer.clock.shouldAnimate = false;
  });
  resetBtn?.addEventListener("click", () => {
    if (startTime) viewer.clock.currentTime = startTime.clone();
    viewer.clock.shouldAnimate = false;
    applyFollowCamera();
  });
  speedInput?.addEventListener("change", rebuildWithSpeed);
  followCheckbox?.addEventListener("change", applyFollowCamera);
  // DIBUJO: iniciar / usar / cancelar
    drawBtn?.addEventListener("click", () => {
    cancelDrawingRoute(); // limpia si había uno previo
    startDrawingRoute();
    });

    finishBtn?.addEventListener("click", () => {
    finishDrawingRoute().catch(err => {
        console.error(err);
        alert("No se pudo crear el recorrido desde el dibujo.");
    });
    });

    cancelBtn?.addEventListener("click", () => {
    cancelDrawingRoute();
    });

}
// ============ DIBUJO DE RECORRIDO ============
function startDrawingRoute(){
  if (drawing) return;
  drawing = true;

  // Limpia borradores previos
  cleanupDraft();

  // Handler de entrada
  drawHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  // Click izquierdo: agrega un punto
  drawHandler.setInputAction((click) => {
    const cart = pickCartographic(click.position);
    if (!cart) return;

    draftPositionsCart.push(cart);
    const cartesian = Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, 0);
    draftPositions.push(cartesian);

    // Punto visual
    const pt = viewer.entities.add({
      position: cartesian,
      point: { pixelSize: 8, color: Cesium.Color.ORANGE, outlineColor: Cesium.Color.BLACK, outlineWidth: 1 }
    });
    draftPointEntities.push(pt);

    // Polilínea provisional
    if (!draftPolylineEntity){
      draftPolylineEntity = viewer.entities.add({
        name: "Borrador recorrido",
        polyline: { positions: new Cesium.CallbackProperty(()=>draftPositions, false), width: 3, material: Cesium.Color.ORANGE.withAlpha(0.7) }
      });
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Doble clic: finalizar como si pulsaras "Usar"
  drawHandler.setInputAction(() => {
    finishDrawingRoute().catch(console.error);
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  // Cursor: vista previa del último segmento
  drawHandler.setInputAction((movement) => {
    if (!draftPositions.length) return;
    const cart = pickCartographic(movement.endPosition);
    if (!cart) return;
    const cartesian = Cesium.Cartesian3.fromRadians(cart.longitude, cart.latitude, 0);
    // Actualiza la “cola” para preview (no fija hasta LEFT_CLICK)
    if (draftPositions.length >= 2) {
      draftPositions[draftPositions.length - 1] = cartesian;
    } else {
      draftPositions.push(cartesian);
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

async function finishDrawingRoute(){
  if (!drawing) return;
  if (draftPositionsCart.length < 2) { cancelDrawingRoute(); return; }

  // Congela dibujo
  stopDrawHandler();

  // Asegura que la última posición sea “real” (quita la cola de preview si existe)
  if (draftPositions.length > draftPositionsCart.length) {
    draftPositions.pop();
  }

  // Muestra "pensando" corto
  viewer.scene.requestRender();

  // Muestra alturas reales
  let sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, draftPositionsCart);

  // Convierte a cartesian con altura mínima de 10 m
  routePositionsCartesian = sampled.map(c =>
    Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(c.height||0, 10))
  );

  // Redibuja la ruta principal
  if (routeEntity) viewer.entities.remove(routeEntity);
  routeEntity = viewer.entities.add({
    name: "Ruta",
    polyline: { positions: routePositionsCartesian, width: 4, clampToGround: false, material: Cesium.Color.YELLOW.withAlpha(2) }
  });

  // Recalcula métricas (NO arranca animación)
  routeLengthMeters = pathLengthMeters(routePositionsCartesian);
  totalLengthEl.textContent = fmtMeters(routeLengthMeters);
  totalTimeEl.textContent   = fmtDuration(totalSecondsFor(routeLengthMeters, Number(speedInput?.value || 30)));

  // Limpia borradores
  cleanupDraft();

  // Reset entidad móvil y reloj (no auto-play)
  if (moverEntity) { viewer.entities.remove(moverEntity); moverEntity = null; }
  sampledPos = null;
  startTime = stopTime = null;

  // Mantén la vista en la nueva ruta
  viewer.flyTo(routeEntity, {
    duration: 0.8,
    offset: new Cesium.HeadingPitchRange(
      viewer.scene.camera.heading,
      Cesium.Math.toRadians(-25),
      400
    )
  });
}

function cancelDrawingRoute(){
  if (!drawing) return;
  stopDrawHandler();
  cleanupDraft();
}

function stopDrawHandler(){
  drawing = false;
  if (drawHandler) { drawHandler.destroy(); drawHandler = null; }
}

function cleanupDraft(){
  if (draftPolylineEntity){ viewer.entities.remove(draftPolylineEntity); draftPolylineEntity = null; }
  for (const e of draftPointEntities){ viewer.entities.remove(e); }
  draftPointEntities = [];
  draftPositions = [];
  draftPositionsCart = [];
}

function pickCartographic(winPos){
  // pick con profundidad (terreno). Si falla, usar elipsoide.
  let c = null;
  if (viewer.scene.pickPositionSupported) {
    const cartesian = viewer.scene.pickPosition(winPos);
    if (Cesium.defined(cartesian)) {
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      if (carto) c = carto;
    }
  }
  if (!c) {
    const cartesian = viewer.camera.pickEllipsoid(winPos, Cesium.Ellipsoid.WGS84);
    if (Cesium.defined(cartesian)) c = Cesium.Cartographic.fromCartesian(cartesian);
  }
  return c;
}

// ====== VALIDADORES ======
function debugStatus(where){
  try{
    const t = viewer?.clock?.currentTime;
    const p = sampledPos?.getValue?.(t);
    console.log(`[${where}]`,
      'tracked=', !!viewer?.trackedEntity,
      'animate=', !!viewer?.clock?.shouldAnimate,
      'mover=', !!moverEntity,
      'sample=', !!p,
      'time=', t ? Cesium.JulianDate.toDate(t).toLocaleTimeString() : '—'
    );
  }catch(e){ console.warn('debugStatus err', e); }
}

function ensureDebugDot(){
  if (!moverEntity) return;

  // Opción A: ocultar punto
  // moverEntity.point = new Cesium.PointGraphics({ pixelSize: 0 });

  // Opción B: usar logo personalizado
  moverEntity.billboard = new Cesium.BillboardGraphics({
    image: "imagenes/logo.png",   // pon aquí la ruta a tu logo
    scale: 0.06,
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM
  });
}

function hookTickLogger(){
  if (window.__tickLogger) return;
  window.__tickLogger = true;
  viewer.clock.onTick.addEventListener(()=>{
    if (!sampledPos) return;
    const p = sampledPos.getValue(viewer.clock.currentTime);
    if (p){
      const c = Cesium.Cartographic.fromCartesian(p);
      console.log('pos=', Cesium.Math.toDegrees(c.longitude).toFixed(5)+','+Cesium.Math.toDegrees(c.latitude).toFixed(5));
    }
  });
}
