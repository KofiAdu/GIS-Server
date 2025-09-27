import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "";

type Scheme = "xyz" | "tms";

function normalizeLayers(payload: any): { display: string; original: string }[] {
  const out: { display: string; original: string }[] = [];
  try {
    const layers = payload?.layers?.layer;
    if (!Array.isArray(layers)) return [];

    for (const layer of layers) {
      const name = layer?.name;
      if (!name) continue;
      const base = name.includes(":") ? name.split(":").pop()! : name;
      out.push({ display: base, original: name });
    }
  } catch (e) {
    console.error("normalizeLayers error:", e);
  }
  return out;
}

function getRandomHexColor() {
  const hex = Math.floor(Math.random() * 0xffffff).toString(16);
  return "#" + hex.padStart(6, "0");
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const visibleLayersRef = useRef<Set<string>>(new Set());

  const [layerMap, setLayerMap] = useState<Record<string, string>>({});
  const [availableLayers, setAvailableLayers] = useState<string[]>([]);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>("");
  const [layersOpen, setLayersOpen] = useState(true);
  const [layerColors, setLayerColors] = useState<{ [key: string]: string }>({});
  const [query, setQuery] = useState("");

  const filteredLayers = availableLayers.filter((n) =>
    n.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [24.941, 60.173],
      zoom: 4,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");

    map.on("mousemove", (e) => {
      const layerIds: string[] = [];
      visibleLayersRef.current.forEach((display) => {
        if (map.getLayer(`${display}-polys`)) layerIds.push(`${display}-polys`);
        if (map.getLayer(`${display}-lines`)) layerIds.push(`${display}-lines`);
        if (map.getLayer(`${display}-points`)) layerIds.push(`${display}-points`);
      });
      const features = map.queryRenderedFeatures(e.point, { layers: layerIds });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
    });

    map.on("click", (e) => {
      const layerIds: string[] = [];
      visibleLayersRef.current.forEach((display) => {
        if (map.getLayer(`${display}-polys`)) layerIds.push(`${display}-polys`);
        if (map.getLayer(`${display}-lines`)) layerIds.push(`${display}-lines`);
        if (map.getLayer(`${display}-points`)) layerIds.push(`${display}-points`);
      });
      const features = map.queryRenderedFeatures(e.point, { layers: layerIds });
      if (!features.length) return;

      const props = features[0].properties as Record<string, unknown> | null;
      if (!props) return;

      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-size:13px"><strong>Feature</strong><br/>${Object.entries(props)
            .map(([k, v]) => `<div><em>${k}</em>: ${String(v)}</div>`)
            .join("")}</div>`
        )
        .addTo(map);
    });

    mapRef.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    visibleLayersRef.current = visibleLayers;
  }, [visibleLayers]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:3000/layers");
        const json = await res.json();
        const objects = normalizeLayers(json);
        const names = objects.map((o) => o.display);
        const mapping: Record<string, string> = {};
        objects.forEach((o) => (mapping[o.display] = o.original));
        setAvailableLayers(names);
        setLayerMap(mapping);
      } catch (err) {
        console.error("Failed to fetch layers:", err);
        setAvailableLayers([]);
        setLayerMap({});
        setError("Failed to load layers");
      }
    })();
  }, []);

  const toggleLayer = async (displayName: string) => {
    const map = mapRef.current;
    if (!map) return;

    if (visibleLayersRef.current.has(displayName)) {
      ["polys", "lines", "points"].forEach((suffix) => {
        const id = `${displayName}-${suffix}`;
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource(displayName)) map.removeSource(displayName);
      const next = new Set(visibleLayersRef.current);
      next.delete(displayName);
      setVisibleLayers(next);
      return;
    }

    const tileTemplate = `http://localhost:3000/tiles/${displayName}/{z}/{x}/{y}.pbf`;
    const scheme: Scheme = "tms";

    if (!map.getSource(displayName)) {
      map.addSource(displayName, {
        type: "vector",
        tiles: [tileTemplate],
        minzoom: 0,
        maxzoom: 22,
        scheme: "tms",
      } as any);
    }

    const originalName = layerMap[displayName];
    const base = displayName;
    const color = layerColors[displayName] || getRandomHexColor();
    if (!layerColors[displayName]) {
      setLayerColors((prev) => ({ ...prev, [displayName]: color }));
    }

    const candidates = originalName && originalName !== base ? [base, originalName] : [base];

    for (const srcLayer of candidates) {
      try {
        map.addLayer({
          id: `${displayName}-polys`,
          type: "fill",
          source: displayName,
          "source-layer": srcLayer,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": color, "fill-opacity": 0.35 },
        });
        map.addLayer({
          id: `${displayName}-lines`,
          type: "line",
          source: displayName,
          "source-layer": srcLayer,
          filter: [
            "any",
            ["==", ["geometry-type"], "LineString"],
            ["==", ["geometry-type"], "Polygon"],
          ],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": color,
            "line-opacity": 0.95,
            "line-width": [
              "interpolate",
              ["exponential", 1.4],
              ["zoom"],
              4, 0.4,
              10, 2,
              14, 4,
              18, 10,
            ],
            "line-blur": 0.2,
          },
        });
        map.addLayer({
          id: `${displayName}-points`,
          type: "circle",
          source: displayName,
          "source-layer": srcLayer,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 4,
            "circle-color": color,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
          },
        });
        break;
      } catch (e) {
        console.warn(`Trying source-layer='${srcLayer}' failed for ${displayName}`, e);
      }
    }

    const next = new Set(visibleLayersRef.current);
    next.add(displayName);
    setVisibleLayers(next);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <div
        style={{
          position: "absolute",
          top: "1rem",
          left: "1rem",
          width: "320px",
          backgroundColor: "#ffffff",
          color: "#111111",
          border: "1px solid #d1d5db",
          boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
          borderRadius: "0.5rem",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "1rem",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
          onClick={() => setLayersOpen(!layersOpen)}
        >
          <h2 style={{ fontSize: "16px", fontWeight: 600 }}>Map Layers</h2>
          <span style={{ fontSize: "18px", fontWeight: 400 }}>
            {layersOpen ? "–" : "+"}
          </span>
        </div>

        {layersOpen && (
          <>
            <div style={{ padding: "0.75rem", borderBottom: "1px solid #eee" }}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search layers"
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  fontSize: "14px",
                }}
              />
            </div>

            <div
              style={{
                maxHeight: "calc(100vh - 240px)",
                overflowY: filteredLayers.length > 6 ? "auto" : "visible",
                padding: "1rem",
              }}
            >
              {filteredLayers.length ? (
                filteredLayers.map((display) => {
                  const active = visibleLayers.has(display);
                  return (
                    <label
                      key={display}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.5rem 0.75rem",
                        marginBottom: "0.5rem",
                        border: "1px solid #ddd",
                        borderRadius: "4px",
                        backgroundColor: "#f9fafb",
                        fontSize: "14px",
                        cursor: "pointer",
                        gap: "0.75rem",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {display}
                      </span>

                      <span
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "3px",
                          backgroundColor: layerColors[display] || "#cccccc",
                          border: "1px solid #999",
                          flexShrink: 0,
                        }}
                        title={`Color for ${display}`}
                      />

                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleLayer(display)}
                        style={{
                          width: "18px",
                          height: "18px",
                          accentColor: "#4f46e5",
                          cursor: "pointer",
                        }}
                      />
                    </label>
                  );
                })
              ) : (
                <p style={{ color: "#666", fontSize: "13px" }}>
                  {error || "No layers found"}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}