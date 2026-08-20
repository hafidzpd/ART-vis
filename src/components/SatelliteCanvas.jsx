import React, { useRef, useEffect, useState } from 'react';
import { MAP_CENTER, MAP_ZOOM } from '../utils/scaleConfig';
import {
  computeCumulativeDistances,
  getPositionAlongPath,
  getVehicleCorners,
  checkPolygonVsPolyline,
  generateRealizedPath,
} from '../utils/collisionUtils';

/**
 * SatelliteCanvas — Route validator backed by live Google Maps satellite imagery.
 *
 * Rendering layers (bottom to top):
 * 1. Google Maps satellite tile (rendered in a background <div>)
 * 2. Canvas overlay — boundary polygons, train path, tracing dots (transparent bg)
 * 3. Vehicle animation with swept path
 * 4. Collision markers
 * 5. HUD (scale bar, tracing mode indicator — drawn in screen space on canvas)
 *
 * Coordinate system:
 * - Stored points: { lat, lng }
 * - Each render frame: converted → canvas pixels using the map's OverlayView projection
 * - Simulation distance: stored in meters, converted to pixels each frame
 */

// ==========================================
//   COORDINATE HELPERS
// ==========================================

/** Convert a stored {lat, lng} point to canvas container pixels. */
function latLngToCanvas(point, projection) {
  if (!projection || !point || !window.google) return { x: 0, y: 0 };
  const latLng = new window.google.maps.LatLng(point.lat, point.lng);
  const px = projection.fromLatLngToContainerPixel(latLng);
  return px ? { x: px.x, y: px.y } : { x: 0, y: 0 };
}

/** Convert a canvas {x, y} click to a {lat, lng} point. */
function canvasToLatLng(x, y, projection) {
  if (!projection || !window.google) return null;
  const pt = new window.google.maps.Point(x, y);
  const latLng = projection.fromContainerPixelToLatLng(pt);
  if (!latLng) return null;
  return { lat: latLng.lat(), lng: latLng.lng() };
}

/** Compute pixels-per-meter at the current map zoom / center. */
function getPixelsPerMeter(map) {
  if (!map) return 4.5;
  const zoom = map.getZoom();
  const lat = map.getCenter().lat();
  const metersPerPixel = (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);
  return 1 / metersPerPixel;
}

/** Haversine distance in meters between two {lat, lng} points. */
function latLngDistanceMeters(p1, p2) {
  const R = 6371000;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1.lat * Math.PI / 180) *
    Math.cos(p2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute total path length in meters from an array of {lat, lng} points. */
function computePathLengthMeters(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += latLngDistanceMeters(points[i - 1], points[i]);
  }
  return total;
}

// ==========================================
//   PLAN STATIONS (HALTE)
// ==========================================

const PLAN_STATIONS = [
  { id: 1, name: "Halte Terminal Intermoda Joyoboyo", lat: -7.29862, lng: 112.73642 },
  { id: 2, name: "Halte Raya Darmo", lat: -7.287044, lng: 112.739376 },
  { id: 3, name: "Halte Urip Sumoharjo", lat: -7.274010, lng: 112.741940 },
  { id: 4, name: "Halte Basuki Rahmat", lat: -7.271783, lng: 112.741561 },
  { id: 5, name: "Halte Embong Malang", lat: -7.258985, lng: 112.734124 },
  { id: 6, name: "Halte Blauran", lat: -7.255178, lng: 112.734052 },
  { id: 7, name: "Halte Praban", lat: -7.25006, lng: 112.73734 },
  { id: 8, name: "Halte Tunjungan", lat: -7.259898, lng: 112.739251 },
  { id: 9, name: "Halte Gubernur Suryo", lat: -7.263731, lng: 112.744015 },
  { id: 10, name: "Halte Panglima Sudirman", lat: -7.269609, lng: 112.743886 }
];

// ==========================================
//   COMPONENT
// ==========================================

const SatelliteCanvas = ({
  config,
  boundaries,
  trainPath,
  rulerPoints,
  workZone = [],
  tracingMode,
  onAddPoint,
  onUndoPoint,
  isPlaying,
  resetTrigger,
  onSimulationUpdate,
  simulationSpeed,
  onPixelsPerMeterChange,
  focusLocation,
}) => {
  const canvasRef = useRef(null);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const projectionRef = useRef(null);
  const geocoderRef = useRef(null);
  const searchedLocationRef = useRef(null);

  // Location search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Total route length in meters (recomputed when trainPath changes)
  const routeLengthMetersRef = useRef(0);

  // Simulation state — distance is in meters (projection-independent)
  const stateRef = useRef({
    distanceMeters: 0,
    hasCollision: false,
    collisionCount: 0,
    progress: 0,
    finished: false,
    sweptTrailOuter: [],
    sweptTrailInner: [],
  });

  // Reset simulation when trigger changes
  useEffect(() => {
    stateRef.current = {
      distanceMeters: 0,
      hasCollision: false,
      collisionCount: 0,
      progress: 0,
      finished: false,
      sweptTrailOuter: [],
      sweptTrailInner: [],
    };
  }, [resetTrigger]);

  // Recompute route length in meters when path changes
  useEffect(() => {
    if (trainPath.length > 1) {
      routeLengthMetersRef.current = computePathLengthMeters(trainPath);
    } else {
      routeLengthMetersRef.current = 0;
    }
  }, [trainPath]);

  // ==========================================
  //   GOOGLE MAPS INITIALIZATION
  // ==========================================
  useEffect(() => {
    const initMap = () => {
      if (!mapDivRef.current || !window.google || !window.google.maps) return;

      const map = new window.google.maps.Map(mapDivRef.current, {
        center: { lat: MAP_CENTER.lat, lng: MAP_CENTER.lng },
        zoom: MAP_ZOOM,
        mapTypeId: 'satellite',
        tilt: 0,
        rotateControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: window.google.maps.MapTypeControlStyle.DROPDOWN_MENU,
          position: window.google.maps.ControlPosition.TOP_RIGHT,
          mapTypeIds: ['satellite', 'hybrid', 'roadmap'],
        },
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_CENTER,
        },
        gestureHandling: 'greedy',
        restriction: {
          latLngBounds: {
            north: -7.15,
            south: -7.40,
            east: 112.85,
            west: 112.55,
          },
          strictBounds: true,
        },
      });
      mapRef.current = map;

      // Create an OverlayView to access the map's projection for coordinate conversion
      const OverlayView = window.google.maps.OverlayView;
      const overlay = new OverlayView();
      overlay.onAdd = function () { };
      overlay.draw = function () {
        projectionRef.current = this.getProjection();
      };
      overlay.onRemove = function () { };
      overlay.setMap(map);

      // Initialize Geocoder for location search
      geocoderRef.current = new window.google.maps.Geocoder();

      // Notify parent whenever zoom changes (tilesloaded fires after the first full render)
      const notifyPpm = () => {
        if (onPixelsPerMeterChange) onPixelsPerMeterChange(getPixelsPerMeter(map));
      };
      map.addListener('tilesloaded', notifyPpm);
      map.addListener('zoom_changed', notifyPpm);
    };

    if (window.google && window.google.maps) {
      initMap();
    } else {
      // Poll until the async Maps script finishes loading
      const id = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(id);
          initMap();
        }
      }, 100);
      return () => clearInterval(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle focusLocation changes to pan/zoom the map
  useEffect(() => {
    if (focusLocation && mapRef.current) {
      mapRef.current.setCenter({ lat: focusLocation.lat, lng: focusLocation.lng });
      if (focusLocation.zoom) {
        mapRef.current.setZoom(focusLocation.zoom);
      }
    }
  }, [focusLocation]);

  // ==========================================
  //   MAIN CANVAS RENDER LOOP
  // ==========================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // ---- Click / tracing handlers (only active when canvas has pointer-events) ----
    const handlePointerDown = (e) => {
      if (tracingMode === 'off') return;
      canvas._dragDist = 0;
      canvas._lastMouse = { x: e.clientX, y: e.clientY };
      canvas._button = e.button;
    };

    const handlePointerMove = (e) => {
      if (tracingMode === 'off' || !canvas._lastMouse) return;
      const dx = e.clientX - canvas._lastMouse.x;
      const dy = e.clientY - canvas._lastMouse.y;
      canvas._dragDist = (canvas._dragDist || 0) + Math.abs(dx) + Math.abs(dy);
      canvas._lastMouse = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e) => {
      if (tracingMode === 'off') return;

      // Only process pointerup if a pointerdown was registered on the canvas
      if (canvas._button == null) return;

      const wasDrag = (canvas._dragDist || 0) > 5;
      const btn = canvas._button;

      // Reset state for next interaction
      canvas._button = null;
      canvas._lastMouse = null;
      canvas._dragDist = 0;

      if (!wasDrag) {
        if (btn === 2) {
          // Right-click → undo
          if (onUndoPoint) onUndoPoint();
        } else if (btn === 0 && onAddPoint && projectionRef.current) {
          // Left-click → add point
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const latLng = canvasToLatLng(x, y, projectionRef.current);
          if (latLng) onAddPoint(latLng, tracingMode);
        }
      }
    };

    const handleContextMenu = (e) => e.preventDefault();

    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (tracingMode !== 'off' && onUndoPoint) {
          e.preventDefault();
          onUndoPoint();
        }
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);

    // ---- Render ----
    const render = () => {
      const cw = canvas.width;
      const ch = canvas.height;

      ctx.clearRect(0, 0, cw, ch);

      const projection = projectionRef.current;
      const map = mapRef.current;

      // Wait for projection to be ready
      if (!projection || !map) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const pixelsPerMeter = getPixelsPerMeter(map);

      // ---- Convert lat/lng paths → canvas pixels ----
      const outerPx = boundaries.outer.map(p => latLngToCanvas(p, projection));
      const innerPx = boundaries.inner.map(p => latLngToCanvas(p, projection));
      const pathPx = trainPath.map(p => latLngToCanvas(p, projection));
      const rulerPx = rulerPoints.map(p => latLngToCanvas(p, projection));

      // ---- LAYER 2: BOUNDARY POLYLINES ----
      drawBoundaryPolyline(ctx, outerPx, 'rgba(239, 68, 68, 0.85)', 2.5);
      drawBoundaryPolyline(ctx, innerPx, 'rgba(59, 130, 246, 0.85)', 2.5);
      drawBoundaryPolyline(ctx, pathPx, 'rgba(34, 197, 94, 0.85)', 2, true);

      // ---- LAYER 3: TRACING POINTS ----
      drawTracingPoints(ctx, outerPx, '#ef4444', 5);
      drawTracingPoints(ctx, innerPx, '#3b82f6', 5);
      drawTracingPoints(ctx, pathPx, '#22c55e', 5);

      // ---- LAYER 4: REALIZED PATH (physically smoothed) ----
      let realizedPathPx = pathPx;
      if (pathPx.length > 1) {
        realizedPathPx = generateRealizedPath(
          pathPx,
          config.wheelbase,
          config.maxSteeringAngle,
          pixelsPerMeter,
        );
        drawBoundaryPolyline(ctx, realizedPathPx, 'rgba(255, 255, 255, 0.75)', 1.5, true);
      }

      // ---- LAYER 4.5: RULER ----
      if (rulerPx && rulerPx.length > 0) {
        drawTracingPoints(ctx, rulerPx, '#a855f7', 6);
        if (rulerPx.length === 2) {
          ctx.beginPath();
          ctx.strokeStyle = '#a855f7';
          ctx.lineWidth = 2.5;
          ctx.moveTo(rulerPx[0].x, rulerPx[0].y);
          ctx.lineTo(rulerPx[1].x, rulerPx[1].y);
          ctx.stroke();

          // Compute real-world distance using lat/lng
          if (rulerPoints.length === 2) {
            const mDist = latLngDistanceMeters(rulerPoints[0], rulerPoints[1]);
            const mx = (rulerPx[0].x + rulerPx[1].x) / 2;
            const my = (rulerPx[0].y + rulerPx[1].y) / 2;
            const text = `${mDist.toFixed(2)} m`;
            ctx.font = '14px Inter, sans-serif';
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fillRect(mx - tw / 2 - 6, my - 24, tw + 12, 22);
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(text, mx, my - 5);
          }
        }
      }

      // ---- LAYER 5: VEHICLE SIMULATION ----
      if (pathPx.length > 1 && realizedPathPx.length > 1) {
        // Build pixel-space cumulative distances for the realized path
        const cumulDistsPx = computeCumulativeDistances(realizedPathPx);
        const totalLengthPx = cumulDistsPx[cumulDistsPx.length - 1] || 0;

        const { carriages, length, width, wheelbase } = config;
        const L = length * pixelsPerMeter;
        const W = width * pixelsPerMeter;
        const WB = wheelbase * pixelsPerMeter;
        const gap = 1 * pixelsPerMeter; // 1 m gap

        // Advance simulation (distance stored in meters)
        if (isPlaying && !stateRef.current.finished) {
          const speedMps = simulationSpeed * (1000 / 3600);
          stateRef.current.distanceMeters += speedMps / 60; // 60fps assumed
        }

        // Convert to pixels for positioning
        const d = stateRef.current.distanceMeters * pixelsPerMeter;
        const totalTrainLength = carriages * L + (carriages - 1) * gap;

        if (d - totalTrainLength > totalLengthPx) {
          stateRef.current.finished = true;
        }

        stateRef.current.progress = Math.min(1, d / (totalLengthPx + totalTrainLength));

        let hasCollision = false;
        let collisionCount = 0;
        const carriageStates = [];

        for (let i = 0; i < carriages; i++) {
          const frontBodyDist = d - i * (L + gap);
          const overhang = (L - WB) / 2;
          const frontAxleDist = frontBodyDist - overhang;
          const rearAxleDist = frontAxleDist - WB;

          const pf = getPositionAlongPath(realizedPathPx, cumulDistsPx, frontAxleDist);
          const pr = getPositionAlongPath(realizedPathPx, cumulDistsPx, rearAxleDist);

          const angle = Math.atan2(pf.y - pr.y, pf.x - pr.x);
          const cx = (pf.x + pr.x) / 2;
          const cy = (pf.y + pr.y) / 2;
          const pos = { x: cx, y: cy, angle };

          const corners = getVehicleCorners(pos.x, pos.y, pos.angle, L / 2, W / 2);
          let carriageColliding = false;

          if (outerPx.length > 1 && checkPolygonVsPolyline(corners, outerPx)) {
            carriageColliding = true;
            collisionCount++;
          }
          if (innerPx.length > 1 && checkPolygonVsPolyline(corners, innerPx)) {
            carriageColliding = true;
            collisionCount++;
          }

          if (carriageColliding) hasCollision = true;
          carriageStates.push({ pos, L, W, WB, isColliding: carriageColliding, corners });

          // Record swept path (front-left & front-right corners of lead carriage)
          if (isPlaying && !stateRef.current.finished && i === 0) {
            stateRef.current.sweptTrailOuter.push({ x: corners[0].x, y: corners[0].y });
            stateRef.current.sweptTrailInner.push({ x: corners[1].x, y: corners[1].y });
          }
        }

        // Draw swept trails
        drawTrace(ctx, stateRef.current.sweptTrailOuter, 'rgba(251, 191, 36, 0.45)', 2);
        drawTrace(ctx, stateRef.current.sweptTrailInner, 'rgba(251, 191, 36, 0.45)', 2);

        // Draw carriages + connectors
        for (let i = 0; i < carriages; i++) {
          const st = carriageStates[i];
          drawCarriage(ctx, st.pos, st.L, st.W, st.WB, i === 0, st.isColliding);
          if (i < carriages - 1) {
            drawConnector(ctx, st.pos, carriageStates[i + 1].pos, st.L);
          }
        }

        // Update persistent collision state
        if (hasCollision) {
          stateRef.current.hasCollision = true;
          stateRef.current.collisionCount += collisionCount;
        }

        if (onSimulationUpdate) {
          onSimulationUpdate({
            progress: stateRef.current.progress,
            hasCollision: stateRef.current.hasCollision,
            collisionCount: stateRef.current.collisionCount,
            finished: stateRef.current.finished,
            distance: stateRef.current.distanceMeters,
          });
        }
      }


      // ---- LAYER 6.5: PLAN STATIONS ----
      PLAN_STATIONS.forEach(station => {
        const markerPx = latLngToCanvas(station, projection);
        // Only draw if within reasonable distance of screen (optimization)
        if (markerPx.x > -100 && markerPx.x < cw + 100 && markerPx.y > -100 && markerPx.y < ch + 100) {
          // Inner circle (number bg)
          ctx.beginPath();
          ctx.arc(markerPx.x, markerPx.y, 12, 0, Math.PI * 2);
          ctx.fillStyle = '#f8fafc';
          ctx.fill();

          // Outer border
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#3b82f6';
          ctx.stroke();

          // Text (number)
          ctx.font = '700 12px Inter, sans-serif';
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(station.id.toString(), markerPx.x, markerPx.y + 1);

          // Station Name Label
          ctx.font = '600 11px Inter, sans-serif';
          const tw = ctx.measureText(station.name).width;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.beginPath();
          ctx.roundRect(markerPx.x - tw / 2 - 6, markerPx.y + 16, tw + 12, 18, 4);
          ctx.fill();

          ctx.fillStyle = '#f8fafc';
          ctx.fillText(station.name, markerPx.x, markerPx.y + 25);
        }
      });

      // ---- LAYER 7: HUD (screen space) ----
      drawScaleBar(ctx, cw, ch, pixelsPerMeter);
      drawTracingModeIndicator(ctx, cw, tracingMode);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    config, boundaries, trainPath, rulerPoints, workZone, tracingMode,
    isPlaying, resetTrigger, onAddPoint, onUndoPoint,
    onSimulationUpdate, simulationSpeed,
  ]);


  // ---- Location search handler ----
  const handleSearch = (e, overrideQuery) => {
    if (e) e.preventDefault();
    const q = (overrideQuery || searchQuery).trim();
    if (!q || !geocoderRef.current || !mapRef.current) return;

    setSearchLoading(true);
    setSearchError('');

    // Bias results to Surabaya
    geocoderRef.current.geocode(
      { address: q + ', Surabaya, Jawa Timur, Indonesia' },
      (results, status) => {
        setSearchLoading(false);
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry;
          searchedLocationRef.current = { lat: loc.location.lat(), lng: loc.location.lng(), label: q };

          if (loc.viewport) {
            mapRef.current.fitBounds(loc.viewport);
          } else {
            mapRef.current.setCenter(loc.location);
            mapRef.current.setZoom(18);
          }
        } else {
          searchedLocationRef.current = null;
          setSearchError('Lokasi tidak ditemukan');
          setTimeout(() => setSearchError(''), 3000);
        }
      },
    );
  };

  // Quick-access preset locations (common Surabaya junctions)
  const QUICK_SPOTS = [
    { label: 'Bundaran Waru', query: 'Bundaran Waru' },
    { label: 'Joyoboyo', query: 'Terminal Joyoboyo' },
    { label: 'Wonokromo', query: 'Bundaran Wonokromo' },
    { label: 'Mayjen Sungkono', query: 'Jl Mayjen Sungkono' },
    { label: 'Ahmad Yani', query: 'Jl Ahmad Yani Surabaya' },
  ];

  // Canvas pointer-events: only intercept when in tracing mode.
  // In normal mode, let events pass through to Google Maps for native pan/zoom.
  const canvasPointerEvents = tracingMode !== 'off' ? 'all' : 'none';
  const canvasCursor = tracingMode !== 'off' ? 'crosshair' : 'default';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Google Maps background */}
      <div
        ref={mapDivRef}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Transparent canvas overlay for all drawings */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: canvasPointerEvents,
          cursor: canvasCursor,
        }}
      />

      {/* ---- FLOATING LOCATION SEARCH BAR ---- */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          zIndex: 20,
          pointerEvents: 'all',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 6,
          width: 'clamp(280px, 35vw, 360px)',
        }}
      >
        {/* Search input row */}
        <form
          onSubmit={handleSearch}
          style={{
            display: 'flex',
            width: '100%',
            background: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(12px)',
            borderRadius: 12,
            border: '1px solid rgba(148, 163, 184, 0.2)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          <span style={{
            padding: '10px 10px 10px 14px',
            fontSize: 16,
            userSelect: 'none',
            color: '#64748b',
          }}>
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari lokasi di Surabaya…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f1f5f9',
              fontSize: 14,
              fontFamily: 'Inter, sans-serif',
              padding: '10px 6px',
            }}
          />
          <button
            type="submit"
            disabled={searchLoading}
            style={{
              background: searchLoading ? 'rgba(59,130,246,0.4)' : 'rgba(59, 130, 246, 0.9)',
              border: 'none',
              color: '#fff',
              padding: '0 18px',
              cursor: searchLoading ? 'wait' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'Inter, sans-serif',
              transition: 'background 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {searchLoading ? '...' : 'Cari'}
          </button>
        </form>

        {/* Error message */}
        {searchError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.9)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'Inter, sans-serif',
          }}>
            {searchError}
          </div>
        )}

        {/* Quick-access chips */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 5,
          justifyContent: 'flex-start',
        }}>
          {QUICK_SPOTS.map(spot => (
            <button
              key={spot.label}
              type="button"
              onClick={() => {
                setSearchQuery(spot.query);
                handleSearch(null, spot.query);
              }}
              style={{
                background: 'rgba(15, 23, 42, 0.78)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: 20,
                color: '#cbd5e1',
                fontSize: 12,
                fontFamily: 'Inter, sans-serif',
                padding: '4px 12px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                e.target.style.background = 'rgba(59, 130, 246, 0.7)';
                e.target.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.target.style.background = 'rgba(15, 23, 42, 0.78)';
                e.target.style.color = '#cbd5e1';
              }}
            >
              {spot.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};


// ==========================================
//   DRAWING HELPERS
// ==========================================

/**
 * Draw a polyline from an array of {x, y} canvas-pixel points.
 */
function drawBoundaryPolyline(ctx, points, color, lineWidth, dashed = false) {
  if (!points || points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (dashed) ctx.setLineDash([lineWidth * 4, lineWidth * 4]);
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw small circles at each traced point for visual feedback.
 */
function drawTracingPoints(ctx, points, color, radius) {
  if (!points || points.length === 0) return;
  for (const pt of points) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}

/**
 * Draw a continuous trace line (for swept path).
 */
function drawTrace(ctx, points, color, lineWidth) {
  if (!points || points.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

/**
 * Draw a train carriage rectangle with wheels and direction indicator.
 */
function drawCarriage(ctx, pos, L, W, WB, isLead, hasCollision) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(pos.angle);

  const bodyColor = hasCollision
    ? 'rgba(239, 68, 68, 0.92)'
    : isLead
      ? 'rgba(59, 130, 246, 0.92)'
      : 'rgba(148, 163, 184, 0.92)';

  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W, 3);
  ctx.fill();
  ctx.stroke();

  // Wheels
  ctx.fillStyle = '#111';
  const ww = 3, wh = 5;
  ctx.fillRect(WB / 2 - ww / 2, -W / 2 - 1, ww, wh);
  ctx.fillRect(WB / 2 - ww / 2, W / 2 - wh + 1, ww, wh);
  ctx.fillRect(-WB / 2 - ww / 2, -W / 2 - 1, ww, wh);
  ctx.fillRect(-WB / 2 - ww / 2, W / 2 - wh + 1, ww, wh);

  // Direction indicator
  if (isLead) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(L / 2, 0);
    ctx.lineTo(L / 2 - 4, -3);
    ctx.lineTo(L / 2 - 4, 3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw coupler between two carriages.
 */
function drawConnector(ctx, currPos, nextPos, L) {
  const rPx = currPos.x - (L / 2) * Math.cos(currPos.angle);
  const rPy = currPos.y - (L / 2) * Math.sin(currPos.angle);
  const fCx = nextPos.x + (L / 2) * Math.cos(nextPos.angle);
  const fCy = nextPos.y + (L / 2) * Math.sin(nextPos.angle);

  ctx.beginPath();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.5;
  ctx.moveTo(rPx, rPy);
  ctx.lineTo(fCx, fCy);
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = '#ef4444';
  ctx.arc((rPx + fCx) / 2, (rPy + fCy) / 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draw a scale bar in the bottom-right corner (screen space).
 * pixelsPerMeter is computed dynamically from the current map zoom.
 */
function drawScaleBar(ctx, cw, ch, pixelsPerMeter) {
  const targetPx = 120;
  const targetMeters = targetPx / pixelsPerMeter;

  const niceValues = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let scaleMeters = niceValues[0];
  for (const v of niceValues) {
    if (v <= targetMeters) scaleMeters = v;
    else break;
  }

  const scalePx = scaleMeters * pixelsPerMeter;
  const x = cw - 40 - scalePx;
  const y = ch - 40;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.beginPath();
  ctx.roundRect(x - 12, y - 24, scalePx + 24, 38, 8);
  ctx.fill();

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + scalePx, y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
  ctx.moveTo(x + scalePx, y - 5); ctx.lineTo(x + scalePx, y + 5);
  ctx.stroke();

  const label = scaleMeters >= 1000 ? `${scaleMeters / 1000} km` : `${scaleMeters} m`;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, x + scalePx / 2, y - 7);
}

/**
 * Draw a tracing-mode indicator badge at the top-center of the canvas.
 */
function drawTracingModeIndicator(ctx, cw, tracingMode) {
  if (tracingMode === 'off') return;

  const labels = {
    outer: { text: '🔴 TRACING: Batas Luar', color: 'rgba(239, 68, 68, 0.9)' },
    inner: { text: '🔵 TRACING: Batas Dalam', color: 'rgba(59, 130, 246, 0.9)' },
    path: { text: '🟢 TRACING: Path Kereta', color: 'rgba(34, 197, 94, 0.9)' },
    ruler: { text: '📏 ALAT UKUR (Ruler)', color: 'rgba(168, 85, 247, 0.9)' },
  };

  const info = labels[tracingMode];
  if (!info) return;

  ctx.font = 'bold 14px Inter, sans-serif';
  const metrics = ctx.measureText(info.text);
  const padX = 20, h = 36;
  const w = metrics.width + padX * 2;
  const x = (cw - w) / 2;
  const y = 16;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.fill();

  ctx.strokeStyle = info.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.text, cw / 2, y + h / 2);
}

export default SatelliteCanvas;
