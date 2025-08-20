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

// ===================== UI refs =====================
const speedInput = document.getElementById("speed");
const followCheckbox = document.getElementById("followCam");
const playBtn = document.getElementById("play");
const pauseBtn = document.getElementById("pause");
const resetBtn = document.getElementById("reset");
const totalLengthEl = document.getElementById("totalLength");
const totalTimeEl = document.getElementById("totalTime");

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

    // 4) UI
    wireUI();

  } catch (err) {
    console.error("Error al iniciar:", err);
    alert("No se pudo iniciar Cesium. Revisa token/conexión.");
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

  // D) dibujar polilínea (sin clampToGround para evitar rarezas)
  if (routeEntity) viewer.entities.remove(routeEntity);
  routeEntity = viewer.entities.add({
    name: "Ruta",
    polyline: {
      positions: routePositionsCartesian,
      width: 3,
      clampToGround: false,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, taperPower: 0.5 })
    }
  });

  // E) longitud y animación inicial
  routeLengthMeters = pathLengthMeters(routePositionsCartesian);
  rebuildWithSpeed();
  viewer.zoomTo(routeEntity);
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
    const time = Cesium.JulianDate.addSeconds(startTime, t, new Cesium.JulianDate());
    property.addSample(time, routePositionsCartesian[i]);
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
      // Material simple para evitar problemas con .update
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

  applyFollowCamera();
}

function applyFollowCamera(){
  if (!viewer) return;
  viewer.trackedEntity = (followCheckbox?.checked && moverEntity) ? moverEntity : undefined;
}

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
}
