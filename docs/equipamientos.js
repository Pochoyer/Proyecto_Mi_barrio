(async () => {
  const map = L.map('map');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Ícono del parque (árbol)
  const iconoParque = L.icon({
    iconUrl: 'imagenes/arbol.png', // 📌 icono árbol
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });

  // Título fijo en la parte inferior izquierda del mapa
  const titulo = L.control({ position: 'bottomleft' });
  titulo.onAdd = function () {
    const div = L.DomUtil.create('div', 'titulo-mapa');
    div.innerHTML = "<h3>Parques en Villa Anny II</h3>";
    return div;
  };
  titulo.addTo(map);
  
  const infoBox = document.getElementById("info-parque");

  async function cargarGeoJSON(url, style, popupParque = false, popupProp = null, addMarker = false) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
      const data = await res.json();

      const capa = L.geoJSON(data, {
        style: style,
        onEachFeature: (feature, layer) => {
          if (popupParque) {
            const nombre = feature.properties?.[popupProp] || "Parque sin nombre";
            const barrio = "Villa Anny II";
            const direccion = "TV 77 G N° 71 D - 03";
            const localidad = "Bosa";
            const imagen = "imagenes/Parque_tibanica.png"; // 📌 foto real del parque

            const contenidoPopup = `
              <div style="text-align:center">
                <h3>${nombre}</h3>
                <p><b>Barrio:</b> ${barrio}</p>
                <img src="${imagen}" alt="Imagen del parque" style="width:200px; border-radius:8px; margin-top:5px;">
              </div>
            `;

            // Popup solo para el parque
            layer.bindPopup(contenidoPopup);

            // 👉 Evento: al hacer clic en el polígono
            layer.on("click", () => {
              const centro = layer.getBounds().getCenter();
              infoBox.innerHTML = `
                <h3>${nombre}</h3>
                <p><b>Barrio:</b> ${barrio}</p>
                <p><b>Dirección:</b> ${direccion}</p>
                <p><b>Localidad:</b> ${localidad}</p>
                <p><b>Coordenadas:</b><br>
                   <b>Latitud:</b> ${centro.lat.toFixed(6)}<br>
                   <b>Longitud:</b> ${centro.lng.toFixed(6)}
                </p>
                <img src="${imagen}" alt="Imagen del parque" style="width:100%; border-radius:8px; margin-top:5px;">
              `;
            });

            // Agregar ícono en el centro del polígono
            if (addMarker && feature.geometry.type.includes("Polygon")) {
              let centro = layer.getBounds().getCenter();
              centro = L.latLng(centro.lat, centro.lng + 0.0005); // mover un poco a la derecha

              L.marker(centro, { icon: iconoParque })
                .bindPopup(contenidoPopup)
                .addTo(map);
            }
          }
        }
      }).addTo(map);

      return capa;
    } catch (err) {
      console.error(`❌ Error cargando ${url}:`, err);
      return null;
    }
  }

  // 1️⃣ Barrio (sin popup)
  const capaBarrio = await cargarGeoJSON(
    'capas/Sector_Villa_Anny_II.json',
    { color: 'blue', weight: 2, fillOpacity: 0 }
  );

  // 2️⃣ Parque (con popup + panel derecho)
  const capaParque = await cargarGeoJSON(
    'capas/Parque.json',
    { color: 'green', weight: 2, fillOpacity: 0.5 },
    true,   // activar popup/info
    'name', // propiedad del nombre
    true    // añadir ícono
  );

  // 3️⃣ Centrar mapa
  if (capaParque && capaParque.getBounds().isValid()) {
    map.fitBounds(capaParque.getBounds().pad(0.05));
  } else if (capaBarrio && capaBarrio.getBounds().isValid()) {
    map.fitBounds(capaBarrio.getBounds().pad(0.05));
  }
})();

// =======================
// MAPA HUMEDAL
// =======================
(async () => {
  const mapHumedal = L.map('map-humedal');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mapHumedal);

  const infoBoxHumedal = document.getElementById("info-humedal");

  // Ícono para el humedal
  const iconoHumedal = L.icon({
    iconUrl: 'imagenes/humedal.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });

  // Título fijo en la parte inferior izquierda del mapa
  const titulohumedal = L.control({ position: 'bottomleft' });
  titulohumedal.onAdd = function () {
    const div = L.DomUtil.create('div', 'titulo-mapa');
    div.innerHTML = "<h3>Humedales en Villa Anny II</h3>";
    return div;
  };
  titulohumedal.addTo(mapHumedal);

  try {
    // =====================
    // Cargar Barrio
    // =====================
    const resBarrio = await fetch('capas/Sector_Villa_Anny_II.json');
    if (!resBarrio.ok) throw new Error(`Error HTTP ${resBarrio.status}`);
    const dataBarrio = await resBarrio.json();

    const capaBarrio = L.geoJSON(dataBarrio, {
      style: { color: 'red', weight: 2, fillOpacity: 0 }, // solo contorno      
    }).addTo(mapHumedal);

    // =====================
    // Cargar Humedal
    // =====================
    const resHumedal = await fetch('capas/Humedal.json');
    if (!resHumedal.ok) throw new Error(`Error HTTP ${resHumedal.status}`);
    const dataHumedal = await resHumedal.json();

    const capaHumedal = L.geoJSON(dataHumedal, {
      style: { color: 'blue', weight: 2, fillOpacity: 0.4 },
      onEachFeature: (feature, layer) => {
        const nombre = feature.properties?.name || "Humedal sin nombre";
        const barrio = "Villa Anny II";
        const direccion = "TV 77 G N° 71 D - 03";
        const localidad = "Bosa";
        const imagen = "imagenes/humedal.jpg";

        const contenidoPopup = `
          <div style="text-align:center">
            <h3>${nombre}</h3>
            <p><b>Barrio:</b> ${barrio}</p>
            <img src="${imagen}" alt="Imagen del humedal" style="width:200px; border-radius:8px; margin-top:5px;">
          </div>
        `;

        layer.bindPopup(contenidoPopup);

        // Evento clic: actualizar panel derecho
        layer.on("click", () => {
          const centro = layer.getBounds().getCenter();
          infoBoxHumedal.innerHTML = `
            <h3>${nombre}</h3>
            <p><b>Barrio:</b> ${barrio}</p>
            <p><b>Dirección:</b> ${direccion}</p>
            <p><b>Localidad:</b> ${localidad}</p>
            <p><b>Coordenadas:</b><br>
               <b>Latitud:</b> ${centro.lat.toFixed(6)}<br>
               <b>Longitud:</b> ${centro.lng.toFixed(6)}
            </p>
            <img src="${imagen}" alt="Imagen del humedal" style="width:100%; border-radius:8px; margin-top:5px;">
          `;
        });

        // Ícono en el centro del polígono
        if (feature.geometry.type.includes("Polygon")) {
          let centro = layer.getBounds().getCenter();
          L.marker(centro, { icon: iconoHumedal })
            .bindPopup(contenidoPopup)
            .addTo(mapHumedal);
        }
      }
    }).addTo(mapHumedal);

    // Ajustar vista para mostrar barrio y humedal
    const bounds = capaBarrio.getBounds().extend(capaHumedal.getBounds());
    if (bounds.isValid()) {
      mapHumedal.fitBounds(bounds.pad(0.05));
    }
  } catch (err) {
    console.error("❌ Error cargando datos en mapa humedal:", err);
  }
})();