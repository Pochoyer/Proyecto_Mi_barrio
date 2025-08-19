// docs/recorrido3d.js — versión robusta con logs

// === Config ===
const CATASTRO_GEOJSON = "capas/Villa_Anny_II.geojson";
const ROUTE_GEOJSON    = "rutas/recorrido_villa_anny.geojson";
const METERS_PER_FLOOR = 3;
const BASE_SPEED_MPS   = 12;  // velocidad base (1x)
const CAMERA_ALTITUDE  = 35;  // altura de cámara sobre terreno
const PADDING_METERS   = 250; // margen para encuadre
const DEBUG = true;

const FLOOR_KEYS = ["pisos","Pisos","NUM_PISOS","N_PISOS","num_pisos","n_pisos","pisos_totales"];
const log = (...a)=>DEBUG&&console.log("[Recorrido3D]",...a);
const err = (...a)=>console.error("[Recorrido3D]",...a);

// === Viewer (satélite + terreno mundial) ===
const viewer = new Cesium.Viewer("cesiumContainer", {
  terrain: Cesium.Terrain.fromWorldTerrain(),
  baseLayer: Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromBasemapType(
      Cesium.ArcGisBaseMapType.SATELLITE
    )
  ),
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

// === Utilidades ===
function getFloors(propsBag, now){
  const p = propsBag && typeof propsBag.getValue==="function" ? (propsBag.getValue(now)||{}) : (propsBag||{});
  for(const k of FLOOR_KEYS){ const v=p[k]; if(v!=null && !Number.isNaN(Number(v))) return Number(v); }
  return null;
}
function rectangleFromPositions(positions){
  if(!positions?.length) return null;
  let w=180,s=90,e=-180,n=-90;
  for(const pos of positions){
    const c=Cesium.Ellipsoid.WGS84.cartesianToCartographic(pos);
    const lon=Cesium.Math.toDegrees(c.longitude), lat=Cesium.Math.toDegrees(c.latitude);
    w=Math.min(w,lon); e=Math.max(e,lon); s=Math.min(s,lat); n=Math.max(n,lat);
  }
  return Cesium.Rectangle.fromDegrees(w,s,e,n);
}
async function flyToRectangleWithPadding(rect, duration=1.2, padMeters=PADDING_METERS){
  if(!rect) return;
  const R=6378137;
  const lat=(rect.north+rect.south)/2;
  const dLat=padMeters/R;
  const dLon=padMeters/(R*Math.max(Math.cos(lat),1e-6));
  const padded=new Cesium.Rectangle(rect.west-dLon, rect.south-dLat, rect.east+dLon, rect.north+dLat);
  await viewer.camera.flyTo({destination:padded,duration});
}

// === Cargar Catastro con extrusión ===
async function loadCatastro(){
  const ds = await Cesium.GeoJsonDataSource.load(CATASTRO_GEOJSON);
  viewer.dataSources.add(ds);
  const now = Cesium.JulianDate.now();
  let c=0;
  for(const e of ds.entities.values){
    const pol=e.polygon; if(!pol) continue;
    const floors=getFloors(e.properties,now);
    const p=e.properties?.getValue?.(now)||e.properties||{};
    const altura=(p.altura!=null && !Number.isNaN(Number(p.altura))) ? Number(p.altura) : (Math.max(1,floors??1)*METERS_PER_FLOOR);
    pol.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
    pol.extrudedHeight = altura;
    pol.extrudedHeightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
    pol.material = Cesium.Color.fromCssColorString("#3cb371").withAlpha(0.85);
    pol.outline = true;
    pol.outlineColor = Cesium.Color.BLACK;
    c++;
  }
  log(`Catastro OK. Polígonos extruidos: ${c}`);
}

// === Leer la ruta con fetch y aceptar LineString/MultiLineString (fallback: bordes de polígonos) ===
async function loadRouteCoords(url){
  const res = await fetch(url, {cache:"no-store"});
  if(!res.ok) throw new Error(`Ruta no encontrada (${res.status}) en ${url}`);
  const gj = await res.json();

  const coords = [];
  const pushLine = (arr)=>{ for(const c of arr){ const [lon,lat]=c; if(isFinite(lon)&&isFinite(lat)) coords.push([lon,lat]); } };
  const handleGeom = (g)=>{
    if(!g) return;
    if(g.type==="LineString") pushLine(g.coordinates);
    else if(g.type==="MultiLineString") for(const line of g.coordinates||[]) pushLine(line);
    // Fallback: si por error nos pasan polígonos, usamos los exteriores como líneas
    else if(g.type==="Polygon"){
      if(g.coordinates?.[0]) pushLine(g.coordinates[0]);
    } else if(g.type==="MultiPolygon"){
      for(const poly of g.coordinates||[]) if(poly?.[0]) pushLine(poly[0]);
    }
  };
  if(gj.type==="FeatureCollection") for(const f of gj.features||[]) handleGeom(f.geometry);
  else if(gj.type==="Feature") handleGeom(gj.geometry);
  else handleGeom(gj);

  if(coords.length<2) throw new Error("La ruta no contiene LineString/MultiLineString válidos.");
  log(`Ruta OK. Puntos: ${coords.length}`);
  return coords;
}

// === Construir animación a partir de coords lon/lat ===
async function animateFromCoords(lonlat){
  // convertir a cartográficas
  const carto = lonlat.map(([lon,lat])=>Cesium.Cartographic.fromDegrees(lon,lat));
  let positionsWithZ;
  try{
    const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, carto);
    positionsWithZ = sampled.map(c=>Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,(c.height||0)+CAMERA_ALTITUDE));
    log("Muestreo terreno OK.");
  }catch(e){
    err("sampleTerrainMostDetailed falló; usando altura fija.", e);
    positionsWithZ = carto.map(c=>Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,CAMERA_ALTITUDE));
  }

  // tiempos
  const start = Cesium.JulianDate.now();
  const posProp = new Cesium.SampledPositionProperty();
  let t=0;
  const dist = (a,b)=>Cesium.Cartesian3.distance(a,b);
  for(let i=0;i<positionsWithZ.length;i++){
    posProp.addSample(Cesium.JulianDate.addSeconds(start,t,new Cesium.JulianDate()), positionsWithZ[i]);
    if(i<positionsWithZ.length-1) t += dist(positionsWithZ[i],positionsWithZ[i+1]) / BASE_SPEED_MPS;
  }
  const stop = Cesium.JulianDate.addSeconds(start,t,new Cesium.JulianDate());

  // entidad móvil y línea
  const mover = viewer.entities.add({
    name: "Recorrido 3D",
    position: posProp,
    orientation: new Cesium.VelocityOrientationProperty(posProp),
    point: { pixelSize: 12, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
    path: { leadTime: 0, trailTime: 60, material: Cesium.Color.YELLOW, width: 4 }
  });
  viewer.entities.add({
    polyline: {
      positions: positionsWithZ,
      clampToGround: false,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.15, color: Cesium.Color.ORANGE }),
      width: 3
    }
  });

  // reloj
  viewer.clock.startTime   = start.clone();
  viewer.clock.stopTime    = stop.clone();
  viewer.clock.currentTime = start.clone();
  viewer.clock.clockRange  = Cesium.ClockRange.CLAMPED;
  viewer.clock.multiplier  = 1.0;
  viewer.clock.shouldAnimate = true;

  viewer.trackedEntity = mover;

  // encuadre
  const rect = rectangleFromPositions(positionsWithZ);
  await flyToRectangleWithPadding(rect, 1.2, PADDING_METERS);

  // controles
  const btnPlay  = document.getElementById("btnPlay");
  const btnReset = document.getElementById("btnReset");
  const speedR   = document.getElementById("speedRange");
  const speedVal = document.getElementById("speedVal");
  const upd = ()=>{ const m=Number(speedR?.value||1); viewer.clock.multiplier=m; if(speedVal) speedVal.textContent=`${m.toFixed(1)}×`; };
  btnPlay?.addEventListener("click", ()=> viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate );
  btnReset?.addEventListener("click", ()=> { viewer.clock.currentTime = viewer.clock.startTime.clone(); viewer.clock.shouldAnimate = true; });
  speedR?.addEventListener("input", upd); upd();
}

// === Run ===
(async()=>{
  try{
    log("Cargando catastro…");
    await loadCatastro();
    log("Leyendo ruta…", ROUTE_GEOJSON);
    const coords = await loadRouteCoords(ROUTE_GEOJSON);
    log("Iniciando animación…");
    await animateFromCoords(coords);
    log("Recorrido listo.");
  }catch(e){
    err("Fallo al iniciar:", e);
    alert("No se pudo iniciar el Recorrido 3D. Revisa la consola.");
  }
})();
