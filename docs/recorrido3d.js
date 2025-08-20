/* Recorrido 3D con coordenadas embebidas (sin leer GeoJSON externo) */

(function safeStart(){
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  function boot(){
    const el = document.getElementById("cesiumContainer");
    if (!el) { alert('Falta <div id="cesiumContainer">'); return; }
    if (el.clientHeight < 200) { el.style.minHeight = "560px"; el.style.height = "70vh"; }
    initCesium(el);
  }
})();

function initCesium(containerEl){
  // ======== Configuración ========
  // 1) Tus coordenadas tal cual (LineString dentro de un FeatureCollection)
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

  // 2) Parámetros del recorrido
  const USE_ION_TERRAIN = false;  // true si quieres muestrear terreno Ion (pon tu token en el HTML)
  const CAMERA_ALT_M    = 35;     // altura de la cámara en metros
  const BASE_SPEED_MPS  = 12;     // velocidad base (1×)
  const PADDING_M       = 600;    // margen del encuadre
  const DENSIFY_M       = 10;     // separación aprox. entre vértices densificados (para suavidad)

  // ======== Viewer (OSM para evitar llaves) ========
  const terrain = USE_ION_TERRAIN
    ? Cesium.Terrain.fromWorldTerrain()
    : new Cesium.EllipsoidTerrainProvider();

  const viewer = new Cesium.Viewer(containerEl, {
    terrain,
    imageryProvider: new Cesium.UrlTemplateImageryProvider({
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      credit: "© OpenStreetMap contributors"
    }),
    requestWebgl2: true,
    contextOptions: { webgl: { powerPreference: "high-performance", failIfMajorPerformanceCaveat: false } },
    timeline: true,
    animation: true,
    sceneModePicker: true,
    navigationHelpButton: false,
    geocoder: false,
    homeButton: false,
    shadows: true,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: true,
    useDefaultRenderLoop: true,
    requestRenderMode: false
  });
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#f0f0f0");

  // ======== Utilidades ========
  function getCoordsFromFeatureCollection(fc){
    if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
      throw new Error("ROUTE_FC no es un FeatureCollection válido.");
    }
    for (const f of fc.features){
      const g = f && f.geometry;
      if (!g) continue;
      if (g.type === "LineString" && Array.isArray(g.coordinates)) {
        return g.coordinates.map(c => [Number(c[0]), Number(c[1])]).filter(c => isFinite(c[0]) && isFinite(c[1]));
      }
      if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
        // Une todas las líneas en una sola lista
        const out = [];
        g.coordinates.forEach(seg => seg.forEach(c => isFinite(c[0]) && isFinite(c[1]) && out.push([+c[0], +c[1]])));
        if (out.length >= 2) return out;
      }
    }
    throw new Error("No encontré LineString/MultiLineString en ROUTE_FC.");
  }

  function densifyLonLat(coords, stepMeters = 15){
    if (!coords || coords.length < 2) return coords || [];
    const out = [];
    const G = new Cesium.EllipsoidGeodesic();
    for (let i=0; i<coords.length-1; i++){
      const c1 = Cesium.Cartographic.fromDegrees(coords[i][0], coords[i][1]);
      const c2 = Cesium.Cartographic.fromDegrees(coords[i+1][0], coords[i+1][1]);
      G.setEndPoints(c1, c2);
      const d = G.surfaceDistance || 0;
      const steps = Math.max(1, Math.ceil(d / stepMeters));
      for (let s=0; s<steps; s++){
        const f = s/steps;
        const c = G.interpolateUsingFraction(f);
        out.push([Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude)]);
      }
    }
    out.push(coords[coords.length-1]);
    return out;
  }

  function rectFromPositions(positions){
    let w=180,s=90,e=-180,n=-90;
    for (const p of positions){
      const c = Cesium.Ellipsoid.WGS84.cartesianToCartographic(p);
      const lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
      w=Math.min(w,lon); e=Math.max(e,lon); s=Math.min(s,lat); n=Math.max(n,lat);
    }
    return Cesium.Rectangle.fromDegrees(w,s,e,n);
  }

  async function flyToRectPad(rect, duration=1.2, padMeters=PADDING_M){
    if (!rect) return;
    const R=6378137, clat=(rect.north+rect.south)/2;
    const dLat=padMeters/R, dLon=padMeters/(R*Math.max(Math.cos(clat),1e-6));
    const padded = new Cesium.Rectangle(rect.west-dLon, rect.south-dLat, rect.east+dLon, rect.north+dLat);
    await viewer.camera.flyTo({ destination: padded, duration });
  }

  // ======== Pipeline del recorrido ========
  (async () => {
    try {
      // 1) Obtener ruta desde el objeto embebido
      let coords = getCoordsFromFeatureCollection(ROUTE_FC);
      if (coords.length < 2) throw new Error("La ruta necesita al menos 2 puntos.");

      // 2) Suavizar/densificar para una animación fluida
      const route = densifyLonLat(coords, DENSIFY_M);

      // 3) Convertir a posiciones 3D (muestreo de terreno si aplica)
      const carto = route.map(([lon,lat]) => Cesium.Cartographic.fromDegrees(lon,lat));
      let positions;
      if (USE_ION_TERRAIN) {
        try {
          const sampled = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, carto);
          positions = sampled.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, (c.height||0) + CAMERA_ALT_M));
        } catch {
          positions = carto.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, CAMERA_ALT_M));
        }
      } else {
        positions = carto.map(c => Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, CAMERA_ALT_M));
      }

      // 4) Dibujar la línea de la ruta
      viewer.entities.add({
        polyline: {
          positions,
          width: 3,
          clampToGround: false,
          material: new Cesium.PolylineGlowMaterialProperty({ glowPower: .15, color: Cesium.Color.ORANGE })
        }
      });

      // 5) Crear timeline para mover un "móvil" a lo largo de la ruta
      const start = Cesium.JulianDate.now();
      const posProp = new Cesium.SampledPositionProperty();
      let T = 0;
      const distance = (a,b) => Cesium.Cartesian3.distance(a,b);
      for (let i=0; i<positions.length; i++){
        posProp.addSample(Cesium.JulianDate.addSeconds(start, T, new Cesium.JulianDate()), positions[i]);
        if (i < positions.length-1) T += distance(positions[i], positions[i+1]) / BASE_SPEED_MPS;
      }
      const stop = Cesium.JulianDate.addSeconds(start, T, new Cesium.JulianDate());

      const mover = viewer.entities.add({
        name: "Recorrido 3D",
        position: posProp,
        orientation: new Cesium.VelocityOrientationProperty(posProp),
        point: { pixelSize: 12, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
        path: { leadTime: 0, trailTime: 60, material: Cesium.Color.YELLOW, width: 4 }
      });

      // 6) Configurar reloj y seguimiento
      viewer.clock.startTime    = start.clone();
      viewer.clock.stopTime     = stop.clone();
      viewer.clock.currentTime  = start.clone();
      viewer.clock.clockRange   = Cesium.ClockRange.CLAMPED;
      viewer.clock.clockStep    = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
      viewer.clock.multiplier   = 1.0;
      viewer.clock.shouldAnimate = true;

      viewer.trackedEntity = mover;

      // 7) Encuadre a la ruta
      await flyToRectPad(rectFromPositions(positions), 1.2, PADDING_M);

      // 8) Controles opcionales (si existen en el HTML)
      const btnPlay  = document.getElementById("btnPlay");
      const btnReset = document.getElementById("btnReset");
      const speedR   = document.getElementById("speedRange");
      const speedVal = document.getElementById("speedVal");
      if (btnPlay)  btnPlay.addEventListener("click", () => viewer.clock.shouldAnimate = !viewer.clock.shouldAnimate);
      if (btnReset) btnReset.addEventListener("click", () => { viewer.clock.currentTime = viewer.clock.startTime.clone(); viewer.clock.shouldAnimate = true; });
      if (speedR) {
        const update = () => { const m = Number(speedR.value || 1); viewer.clock.multiplier = m; if (speedVal) speedVal.textContent = `${m.toFixed(1)}×`; };
        speedR.addEventListener("input", update); update();
      }
    } catch (e) {
      console.error(e);
      alert(`No se pudo iniciar el Recorrido 3D.\n${e?.message || e}`);
    }
  })();
}
