import React, { useRef, useEffect, useCallback } from 'react';
import {
  createProjection,
  projectRoads,
  generateAllBoundaries,
  buildRoutePath,
  computeCumulativeDistances,
  getPositionAlongPath,
  getVehicleCorners,
  checkVehicleCollision,
  hitTestRoad,
  generateOffsetPolyline,
} from '../utils/geoUtils';

const MapCanvas = ({
  roads,
  config,
  selectedRoute,
  onSelectRoad,
  isPlaying,
  resetTrigger,
  onSimulationUpdate,
}) => {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    distance: 0,
    collisionPoints: [],
    hasCollision: false,
    progress: 0,
    finished: false,
  });
  const cameraRef = useRef({
    x: 0, y: 0,
    zoom: 1,
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
  });
  const projectionRef = useRef(null);
  const projectedRoadsRef = useRef([]);
  const routeDataRef = useRef(null);

  // Reset simulation state when reset is triggered or route changes
  useEffect(() => {
    stateRef.current = {
      distance: 0,
      collisionPoints: [],
      hasCollision: false,
      progress: 0,
      finished: false,
    };
    routeDataRef.current = null;
  }, [resetTrigger, selectedRoute]);

  // Main render loop
  useEffect(() => {
    if (!roads || roads.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
      // Recalculate projection on resize
      projectionRef.current = null;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // ==========================================
    //   MOUSE / INTERACTION HANDLERS
    // ==========================================

    const handlePointerDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Check if it's a click (not a drag) — we'll track this
      cameraRef.current.isDragging = true;
      cameraRef.current.lastMouse = { x: e.clientX, y: e.clientY };
      cameraRef.current.dragDistance = 0;
      cameraRef.current.clickPos = { x: mx, y: my };
      canvas.style.cursor = 'grabbing';
    };

    const handlePointerMove = (e) => {
      if (!cameraRef.current.isDragging) return;
      const dx = e.clientX - cameraRef.current.lastMouse.x;
      const dy = e.clientY - cameraRef.current.lastMouse.y;
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      cameraRef.current.lastMouse = { x: e.clientX, y: e.clientY };
      cameraRef.current.dragDistance += Math.abs(dx) + Math.abs(dy);
    };

    const handlePointerUp = (e) => {
      cameraRef.current.isDragging = false;
      canvas.style.cursor = 'grab';

      // If barely moved, treat as click → select road
      if (cameraRef.current.dragDistance < 5 && projectionRef.current && onSelectRoad) {
        const pos = cameraRef.current.clickPos;
        // Convert screen pos to world pos (undo camera transform)
        const worldX = (pos.x - cameraRef.current.x) / cameraRef.current.zoom;
        const worldY = (pos.y - cameraRef.current.y) / cameraRef.current.zoom;

        const hit = hitTestRoad(
          { x: worldX, y: worldY },
          projectedRoadsRef.current,
          projectionRef.current.pixelsPerMeter,
          20 / cameraRef.current.zoom
        );
        if (hit) {
          onSelectRoad(hit.id);
        }
      }
    };

    const handleWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const oldZoom = cameraRef.current.zoom;
      const newZoom = Math.max(0.1, Math.min(50, oldZoom * zoomFactor));

      // Zoom toward mouse position
      cameraRef.current.x = mx - (mx - cameraRef.current.x) * (newZoom / oldZoom);
      cameraRef.current.y = my - (my - cameraRef.current.y) * (newZoom / oldZoom);
      cameraRef.current.zoom = newZoom;
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    // ==========================================
    //   RENDER FUNCTION
    // ==========================================

    const render = () => {
      const cw = canvas.width;
      const ch = canvas.height;

      // Recompute projection if needed
      if (!projectionRef.current) {
        projectionRef.current = createProjection(roads, cw, ch, 60);
        projectedRoadsRef.current = generateAllBoundaries(
          projectRoads(roads, projectionRef.current.transform),
          projectionRef.current.pixelsPerMeter
        );
        routeDataRef.current = null; // Force route rebuild
      }

      const projection = projectionRef.current;
      const projectedRoads = projectedRoadsRef.current;
      const { pixelsPerMeter } = projection;

      // Build route data if needed
      const selectedIds = new Set(selectedRoute || []);
      const routeSegments = selectedRoute
        ? selectedRoute.map(id => projectedRoads.find(r => r.id === id)).filter(Boolean)
        : [];

      if (routeSegments.length > 0 && !routeDataRef.current) {
        const path = buildRoutePath(routeSegments);
        const cumulDists = computeCumulativeDistances(path);
        routeDataRef.current = { path, cumulDists, totalLength: cumulDists[cumulDists.length - 1] };
      }

      // ---- CLEAR ----
      ctx.clearRect(0, 0, cw, ch);

      // ---- CAMERA TRANSFORM ----
      ctx.save();
      ctx.translate(cameraRef.current.x, cameraRef.current.y);
      ctx.scale(cameraRef.current.zoom, cameraRef.current.zoom);

      // ---- GRID ----
      drawGrid(ctx, cw, ch, cameraRef.current, pixelsPerMeter);

      // ---- DRAW ALL ROADS ----
      for (const road of projectedRoads) {
        const isSelected = selectedIds.has(road.id);
        drawRoad(ctx, road, pixelsPerMeter, isSelected, false);
      }

      // ---- DRAW ROAD BOUNDARIES FOR SELECTED ROUTE ----
      for (const road of routeSegments) {
        drawRoadBoundaries(ctx, road);
      }

      // ---- DRAW ROAD LABELS ----
      const zoom = cameraRef.current.zoom;
      if (zoom > 0.6) {
        for (const road of projectedRoads) {
          drawRoadLabel(ctx, road, zoom);
        }
      }

      // ---- SIMULATION ----
      if (routeDataRef.current && routeSegments.length > 0) {
        const routeData = routeDataRef.current;
        const { carriages, length, width, wheelbase } = config;
        const L = length * pixelsPerMeter;
        const W = width * pixelsPerMeter;
        const WB = wheelbase * pixelsPerMeter;
        const gap = 1 * pixelsPerMeter; // 1m gap between carriages

        // Advance simulation
        if (isPlaying && !stateRef.current.finished) {
          const speedMps = 30 * (1000 / 3600); // 30 km/h in m/s
          const pxPerFrame = (speedMps * pixelsPerMeter) / 60;
          stateRef.current.distance += pxPerFrame;
        }

        const d = stateRef.current.distance;
        const totalTrainLength = carriages * L + (carriages - 1) * gap;

        // Check if train has finished the route
        if (d - totalTrainLength > routeData.totalLength) {
          stateRef.current.finished = true;
        }

        // Calculate progress
        stateRef.current.progress = Math.min(1, d / (routeData.totalLength + totalTrainLength));

        // Draw each carriage
        let allCollisionPoints = [];
        let headDist = d;

        for (let i = 0; i < carriages; i++) {
          const centerDist = headDist - L / 2;
          const pos = getPositionAlongPath(routeData.path, routeData.cumulDists, centerDist);

          // Get corners for collision detection
          const corners = getVehicleCorners(pos.x, pos.y, pos.angle, L / 2, W / 2);

          // Check collision
          const collision = checkVehicleCollision(corners, routeSegments, pixelsPerMeter);
          if (collision.isColliding) {
            allCollisionPoints.push(...collision.collisionPoints);
          }

          // Draw carriage
          drawCarriage(ctx, pos, L, W, WB, i === 0, collision.isColliding);

          // Draw connector to previous carriage
          if (i > 0) {
            const prevDist = headDist + L + gap;
            const prevPos = getPositionAlongPath(routeData.path, routeData.cumulDists, prevDist - L / 2);
            drawConnector(ctx, prevPos, pos, L);
          }

          headDist -= (L + gap);
        }

        // Draw collision markers
        for (const cp of allCollisionPoints) {
          ctx.beginPath();
          ctx.arc(cp.x, cp.y, 5 / zoom, 0, Math.PI * 2);
          ctx.fillStyle = '#ef4444';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
        }

        stateRef.current.collisionPoints = allCollisionPoints;
        stateRef.current.hasCollision =
          stateRef.current.hasCollision || allCollisionPoints.length > 0;

        // Report state to parent
        if (onSimulationUpdate) {
          onSimulationUpdate({
            progress: stateRef.current.progress,
            hasCollision: stateRef.current.hasCollision,
            collisionCount: allCollisionPoints.length,
            finished: stateRef.current.finished,
            distance: stateRef.current.distance / pixelsPerMeter,
          });
        }
      }

      // ---- SCALE BAR ----
      ctx.restore(); // Undo camera transform before drawing HUD elements
      drawScaleBar(ctx, cw, ch, pixelsPerMeter, cameraRef.current.zoom);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('wheel', handleWheel);
      cancelAnimationFrame(animationFrameId);
    };
  }, [roads, config, selectedRoute, isPlaying, resetTrigger, onSelectRoad, onSimulationUpdate]);

  return <canvas ref={canvasRef} />;
};

// ==========================================
//   DRAWING HELPERS
// ==========================================

function drawGrid(ctx, cw, ch, camera, pixelsPerMeter) {
  const zoom = camera.zoom;
  // Adaptive grid spacing based on zoom
  let gridMeters = 50;
  if (zoom > 2) gridMeters = 10;
  else if (zoom > 1) gridMeters = 20;
  else if (zoom < 0.5) gridMeters = 100;

  const gridPx = gridMeters * pixelsPerMeter;

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5 / zoom;

  // Calculate visible area in world coords
  const startX = -camera.x / zoom;
  const startY = -camera.y / zoom;
  const endX = startX + cw / zoom;
  const endY = startY + ch / zoom;

  const firstGX = Math.floor(startX / gridPx) * gridPx;
  const firstGY = Math.floor(startY / gridPx) * gridPx;

  for (let gx = firstGX; gx < endX; gx += gridPx) {
    ctx.beginPath();
    ctx.moveTo(gx, startY);
    ctx.lineTo(gx, endY);
    ctx.stroke();
  }
  for (let gy = firstGY; gy < endY; gy += gridPx) {
    ctx.beginPath();
    ctx.moveTo(startX, gy);
    ctx.lineTo(endX, gy);
    ctx.stroke();
  }
}

function drawRoad(ctx, road, pixelsPerMeter, isSelected, isHover) {
  const { points, width, style, boundaries } = road;
  if (points.length < 2) return;

  const halfWidthPx = (width / 2) * pixelsPerMeter;

  // Draw road asphalt (filled polygon from boundaries)
  if (boundaries && boundaries.left.length > 1) {
    ctx.beginPath();
    // Forward along left boundary
    ctx.moveTo(boundaries.left[0].x, boundaries.left[0].y);
    for (let i = 1; i < boundaries.left.length; i++) {
      ctx.lineTo(boundaries.left[i].x, boundaries.left[i].y);
    }
    // Backward along right boundary
    for (let i = boundaries.right.length - 1; i >= 0; i--) {
      ctx.lineTo(boundaries.right[i].x, boundaries.right[i].y);
    }
    ctx.closePath();

    if (isSelected) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
    } else {
      ctx.fillStyle = 'rgba(51, 65, 85, 0.85)';
    }
    ctx.fill();
  }

  // Draw centerline
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  if (isSelected) {
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = Math.max(2, halfWidthPx * 0.3);
    ctx.setLineDash([8, 6]);
  } else {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = Math.max(1, style.width);
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw curb edges
  if (boundaries) {
    const curbColor = isSelected ? 'rgba(34, 197, 94, 0.6)' : 'rgba(203, 213, 225, 0.3)';
    ctx.strokeStyle = curbColor;
    ctx.lineWidth = isSelected ? 1.5 : 0.8;

    // Left boundary
    if (boundaries.left.length > 1) {
      ctx.beginPath();
      ctx.moveTo(boundaries.left[0].x, boundaries.left[0].y);
      for (let i = 1; i < boundaries.left.length; i++) {
        ctx.lineTo(boundaries.left[i].x, boundaries.left[i].y);
      }
      ctx.stroke();
    }

    // Right boundary
    if (boundaries.right.length > 1) {
      ctx.beginPath();
      ctx.moveTo(boundaries.right[0].x, boundaries.right[0].y);
      for (let i = 1; i < boundaries.right.length; i++) {
        ctx.lineTo(boundaries.right[i].x, boundaries.right[i].y);
      }
      ctx.stroke();
    }
  }
}

function drawRoadBoundaries(ctx, road) {
  if (!road.boundaries) return;

  // Draw thick collision boundaries for selected route
  ctx.lineWidth = 2;

  // Left boundary
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
  if (road.boundaries.left.length > 1) {
    ctx.beginPath();
    ctx.moveTo(road.boundaries.left[0].x, road.boundaries.left[0].y);
    for (let i = 1; i < road.boundaries.left.length; i++) {
      ctx.lineTo(road.boundaries.left[i].x, road.boundaries.left[i].y);
    }
    ctx.stroke();
  }

  // Right boundary
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
  if (road.boundaries.right.length > 1) {
    ctx.beginPath();
    ctx.moveTo(road.boundaries.right[0].x, road.boundaries.right[0].y);
    for (let i = 1; i < road.boundaries.right.length; i++) {
      ctx.lineTo(road.boundaries.right[i].x, road.boundaries.right[i].y);
    }
    ctx.stroke();
  }
}

function drawRoadLabel(ctx, road, zoom) {
  if (!road.name || road.points.length < 2) return;

  // Only show labels for roads with names and sufficient zoom
  const minZoomForType = {
    primary: 0.6, secondary: 0.8, tertiary: 1.2,
    residential: 2.5, living_street: 3.5, service: 5,
  };
  const minZ = minZoomForType[road.highway] || 2;
  if (zoom < minZ) return;

  // Find the midpoint of the road
  const midIdx = Math.floor(road.points.length / 2);
  const p1 = road.points[Math.max(0, midIdx - 1)];
  const p2 = road.points[Math.min(road.points.length - 1, midIdx)];

  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;

  let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  // Keep text readable (not upside down)
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;

  // Font size must counteract the zoom transform so labels appear ~11px on screen
  const fontSize = 11 / zoom;

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angle);

  ctx.font = `600 ${fontSize}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Background
  const text = road.name;
  const metrics = ctx.measureText(text);
  const pad = 3 / zoom;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
  ctx.beginPath();
  ctx.roundRect(-metrics.width / 2 - pad, -fontSize / 2 - pad, metrics.width + pad * 2, fontSize + pad * 2, 3 / zoom);
  ctx.fill();

  // Text
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(text, 0, 0);

  ctx.restore();
}

function drawCarriage(ctx, pos, L, W, WB, isLead, hasCollision) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(pos.angle);

  // Body
  const bodyColor = hasCollision
    ? 'rgba(239, 68, 68, 0.9)'
    : isLead
      ? 'rgba(59, 130, 246, 0.9)'
      : 'rgba(148, 163, 184, 0.9)';

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

  // Direction indicator (front)
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

function drawConnector(ctx, prevPos, currPos, L) {
  const rPx = prevPos.x - (L / 2) * Math.cos(prevPos.angle);
  const rPy = prevPos.y - (L / 2) * Math.sin(prevPos.angle);
  const fCx = currPos.x + (L / 2) * Math.cos(currPos.angle);
  const fCy = currPos.y + (L / 2) * Math.sin(currPos.angle);

  ctx.beginPath();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2.5;
  ctx.moveTo(rPx, rPy);
  ctx.lineTo(fCx, fCy);
  ctx.stroke();

  // Joint dot
  ctx.beginPath();
  ctx.fillStyle = '#ef4444';
  ctx.arc((rPx + fCx) / 2, (rPy + fCy) / 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawScaleBar(ctx, cw, ch, pixelsPerMeter, zoom) {
  // Choose a nice round number for the scale bar
  const targetPx = 120;
  const targetMeters = targetPx / (pixelsPerMeter * zoom);

  let scaleMeters;
  const niceValues = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  scaleMeters = niceValues[0];
  for (const v of niceValues) {
    if (v <= targetMeters) scaleMeters = v;
    else break;
  }

  const scalePx = scaleMeters * pixelsPerMeter * zoom;

  const x = cw - 40 - scalePx;
  const y = ch - 40;

  // Background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.beginPath();
  ctx.roundRect(x - 12, y - 22, scalePx + 24, 34, 8);
  ctx.fill();

  // Bar
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + scalePx, y);
  ctx.stroke();

  // End ticks
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y + 5);
  ctx.moveTo(x + scalePx, y - 5);
  ctx.lineTo(x + scalePx, y + 5);
  ctx.stroke();

  // Label
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${scaleMeters} m`, x + scalePx / 2, y - 6);
}

export default MapCanvas;
