import React, { useRef, useEffect, useCallback } from 'react';
import { MAP_IMAGE_PATH } from '../utils/scaleConfig';
import { computeCumulativeDistances, getPositionAlongPath, getVehicleCorners, checkPolygonVsPolyline, generateRealizedPath } from '../utils/collisionUtils';

/**
 * SatelliteCanvas — Main rendering canvas for the satellite image-based route validator.
 * 
 * Rendering layers (bottom to top):
 * 1. Satellite image background (static PNG)
 * 2. Boundary polygons (outer = red, inner = blue)
 * 3. Train centerline path (green dashed)
 * 4. Tracing points & lines (when developer mode is active)
 * 5. Vehicle animation with swept path
 * 6. Collision markers
 * 7. HUD overlay (scale bar — drawn in screen space)
 */
const SatelliteCanvas = ({
  config,
  boundaries,
  trainPath,
  rulerPoints,
  tracingMode,
  onAddPoint,
  onUndoPoint,
  isPlaying,
  resetTrigger,
  onSimulationUpdate,
  simulationSpeed,
  pixelsPerMeter,
}) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const imageLoadedRef = useRef(false);

  // Camera state (pan + zoom)
  const cameraRef = useRef({
    x: 0,
    y: 0,
    zoom: 1,
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    dragDistance: 0,
    clickPos: { x: 0, y: 0 },
    button: 0,
  });

  // Simulation state
  const stateRef = useRef({
    distance: 0,
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
      distance: 0,
      hasCollision: false,
      collisionCount: 0,
      progress: 0,
      finished: false,
      sweptTrailOuter: [],
      sweptTrailInner: [],
    };
  }, [resetTrigger]);

  const routeDataRef = useRef(null);

  // Recompute route data when trainPath or config changes
  useEffect(() => {
    if (trainPath.length > 1) {
      // 1. Generate the physically realizable path (clamped by maxSteeringAngle)
      const realizedPath = generateRealizedPath(trainPath, config.wheelbase, config.maxSteeringAngle, pixelsPerMeter);
      
      // 2. Compute cumulative distances for the realized path
      const cumulDists = computeCumulativeDistances(realizedPath);
      
      routeDataRef.current = { 
        originalPath: trainPath,
        path: realizedPath, 
        cumulDists, 
        totalLength: cumulDists[cumulDists.length - 1] 
      };
    } else {
      routeDataRef.current = null;
    }
  }, [trainPath, config.wheelbase, config.maxSteeringAngle, pixelsPerMeter]);

  // Load satellite image once on mount
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      imageLoadedRef.current = true;
    };
    img.onerror = () => {
      console.error(`Failed to load satellite image: ${MAP_IMAGE_PATH}`);
    };
    img.src = MAP_IMAGE_PATH;
  }, []);

  // ==========================================
  //   MAIN RENDER LOOP + EVENT HANDLERS
  // ==========================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    // --- Resize handler ---
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
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

      cameraRef.current.isDragging = true;
      cameraRef.current.lastMouse = { x: e.clientX, y: e.clientY };
      cameraRef.current.dragDistance = 0;
      cameraRef.current.clickPos = { x: mx, y: my };
      cameraRef.current.button = e.button;

      if (tracingMode === 'off') {
        canvas.style.cursor = 'grabbing';
      }
    };

    const handlePointerMove = (e) => {
      if (!cameraRef.current.isDragging) return;

      // In tracing mode, don't pan — only track drag distance for click detection
      if (tracingMode !== 'off') {
        const dx = e.clientX - cameraRef.current.lastMouse.x;
        const dy = e.clientY - cameraRef.current.lastMouse.y;
        cameraRef.current.dragDistance += Math.abs(dx) + Math.abs(dy);
        cameraRef.current.lastMouse = { x: e.clientX, y: e.clientY };
        return;
      }

      const dx = e.clientX - cameraRef.current.lastMouse.x;
      const dy = e.clientY - cameraRef.current.lastMouse.y;
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      cameraRef.current.lastMouse = { x: e.clientX, y: e.clientY };
      cameraRef.current.dragDistance += Math.abs(dx) + Math.abs(dy);
    };

    const handlePointerUp = (e) => {
      const wasDrag = cameraRef.current.dragDistance > 5;
      cameraRef.current.isDragging = false;

      if (tracingMode === 'off') {
        canvas.style.cursor = 'grab';
      }

      // If it was a click (not drag) and we're in tracing mode
      if (!wasDrag && tracingMode !== 'off') {
        if (cameraRef.current.button === 2) {
          // Right click -> Undo
          if (onUndoPoint) onUndoPoint();
        } else if (cameraRef.current.button === 0 && onAddPoint) {
          // Left click -> Add point
          const pos = cameraRef.current.clickPos;
          const cam = cameraRef.current;

          // Convert screen coordinates to image-space coordinates (undo camera transform)
          const imageX = (pos.x - cam.x) / cam.zoom;
          const imageY = (pos.y - cam.y) / cam.zoom;

          onAddPoint({ x: imageX, y: imageY }, tracingMode);
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
      const newZoom = Math.max(0.1, Math.min(20, oldZoom * zoomFactor));

      // Zoom toward mouse position
      cameraRef.current.x = mx - (mx - cameraRef.current.x) * (newZoom / oldZoom);
      cameraRef.current.y = my - (my - cameraRef.current.y) * (newZoom / oldZoom);
      cameraRef.current.zoom = newZoom;
    };

    // Set initial cursor based on mode
    canvas.style.cursor = tracingMode !== 'off' ? 'crosshair' : 'grab';

    // Prevent context menu on right click in canvas
    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    // Keyboard undo (Ctrl+Z)
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
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    // ==========================================
    //   RENDER FUNCTION
    // ==========================================
    const render = () => {
      const cw = canvas.width;
      const ch = canvas.height;
      const cam = cameraRef.current;
      const zoom = cam.zoom;
      
      const metersToPixels = (m) => m * pixelsPerMeter;

      // ---- CLEAR ----
      ctx.clearRect(0, 0, cw, ch);

      // ---- CAMERA TRANSFORM ----
      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.scale(zoom, zoom);

      // ---- LAYER 1: SATELLITE IMAGE ----
      if (imageLoadedRef.current && imageRef.current) {
        ctx.drawImage(imageRef.current, 0, 0);
      } else {
        // Placeholder while image loads
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 1600, 800);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '20px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Memuat citra satelit...', 800, 400);
      }

      // ---- LAYER 2: BOUNDARY POLYGONS ----
      drawBoundaryPolyline(ctx, boundaries.outer, 'rgba(239, 68, 68, 0.8)', 2.5 / zoom, false);
      drawBoundaryPolyline(ctx, boundaries.inner, 'rgba(59, 130, 246, 0.8)', 2.5 / zoom, false);

      // ---- LAYER 3: TRAIN CENTERLINE PATH ----
      drawBoundaryPolyline(ctx, trainPath, 'rgba(34, 197, 94, 0.8)', 2 / zoom, true);

      // ---- LAYER 4: TRACING POINTS (dots on all traced data) ----
      drawTracingPoints(ctx, boundaries.outer, '#ef4444', 5 / zoom);
      drawTracingPoints(ctx, boundaries.inner, '#3b82f6', 5 / zoom);
      drawTracingPoints(ctx, trainPath, '#22c55e', 5 / zoom);
      
      // ---- LAYER 4.2: REALIZED PATH (DASHED) ----
      if (routeDataRef.current && routeDataRef.current.path.length > 1) {
        drawBoundaryPolyline(ctx, routeDataRef.current.path, 'rgba(255, 255, 255, 0.8)', 2 / zoom, true);
      }
      
      // ---- LAYER 4.5: RULER (MEASURING TOOL) ----
      if (rulerPoints && rulerPoints.length > 0) {
        drawTracingPoints(ctx, rulerPoints, '#a855f7', 6 / zoom);
        if (rulerPoints.length === 2) {
          ctx.beginPath();
          ctx.strokeStyle = '#a855f7';
          ctx.lineWidth = 3 / zoom;
          ctx.moveTo(rulerPoints[0].x, rulerPoints[0].y);
          ctx.lineTo(rulerPoints[1].x, rulerPoints[1].y);
          ctx.stroke();
          
          // Calculate and draw distance
          const dx = rulerPoints[1].x - rulerPoints[0].x;
          const dy = rulerPoints[1].y - rulerPoints[0].y;
          const pxDist = Math.sqrt(dx*dx + dy*dy);
          const mDist = pxDist / pixelsPerMeter;
          
          const mx = (rulerPoints[0].x + rulerPoints[1].x) / 2;
          const my = (rulerPoints[0].y + rulerPoints[1].y) / 2;
          
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          const text = `${mDist.toFixed(2)} Meter`;
          ctx.font = `${14/zoom}px Inter`;
          const metrics = ctx.measureText(text);
          ctx.fillRect(mx - metrics.width/2 - 5/zoom, my - 10/zoom - 14/zoom, metrics.width + 10/zoom, 20/zoom);
          
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(text, mx, my - 8/zoom);
        }
      }

      // ---- LAYER 5: VEHICLE SIMULATION ----
      if (routeDataRef.current && trainPath.length > 1) {
        const routeData = routeDataRef.current;
        const { carriages, length, width, wheelbase } = config;
        const L = metersToPixels(length);
        const W = metersToPixels(width);
        const WB = metersToPixels(wheelbase);
        const gap = metersToPixels(1); // 1m gap between carriages

        // Advance simulation
        if (isPlaying && !stateRef.current.finished) {
          const speedMps = simulationSpeed * (1000 / 3600); // km/h to m/s
          const pxPerFrame = metersToPixels(speedMps) / 60; // assume 60fps
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

        let hasCollision = false;
        let collisionCount = 0;
        const carriageStates = [];

        for (let i = 0; i < carriages; i++) {
          // The distance of the front tip of the body of this carriage
          const frontBodyDist = d - i * (L + gap);
          
          // The ART uses Multi-Axle Steering (Virtual Track). 
          // All axles perfectly follow the trace.
          const overhang = (L - WB) / 2;
          const frontAxleDist = frontBodyDist - overhang;
          const rearAxleDist = frontAxleDist - WB;

          const pf = getPositionAlongPath(routeData.path, routeData.cumulDists, frontAxleDist);
          const pr = getPositionAlongPath(routeData.path, routeData.cumulDists, rearAxleDist);
          
          // The rigid body angle is defined by the line connecting its two axles
          const angle = Math.atan2(pf.y - pr.y, pf.x - pr.x);
          
          // Center of the body is the midpoint between the axles
          const cx = (pf.x + pr.x) / 2;
          const cy = (pf.y + pr.y) / 2;
          const pos = { x: cx, y: cy, angle };
          
          // Get corners
          const corners = getVehicleCorners(pos.x, pos.y, pos.angle, L / 2, W / 2);
          
          let carriageColliding = false;

          // Check collisions with outer boundary
          if (boundaries.outer.length > 1) {
            if (checkPolygonVsPolyline(corners, boundaries.outer)) {
               carriageColliding = true;
               collisionCount++;
            }
          }
          
          // Check collisions with inner boundary
          if (boundaries.inner.length > 1) {
            if (checkPolygonVsPolyline(corners, boundaries.inner)) {
               carriageColliding = true;
               collisionCount++;
            }
          }

          if (carriageColliding) hasCollision = true;

          carriageStates.push({ pos, L, W, WB, isColliding: carriageColliding, corners });

          // Record swept path for lead carriage (front corners) and rear carriage (rear corners)
          if (isPlaying && !stateRef.current.finished) {
            if (i === 0) {
               stateRef.current.sweptTrailOuter.push({x: corners[0].x, y: corners[0].y}); // Front-left
               stateRef.current.sweptTrailInner.push({x: corners[1].x, y: corners[1].y}); // Front-right
            }
          }
        }

        // Draw Swept Path Trails
        drawTrace(ctx, stateRef.current.sweptTrailOuter, 'rgba(251, 191, 36, 0.4)', 2 / zoom);
        drawTrace(ctx, stateRef.current.sweptTrailInner, 'rgba(251, 191, 36, 0.4)', 2 / zoom);

        // Draw carriages
        for (let i = 0; i < carriages; i++) {
          const st = carriageStates[i];
          drawCarriage(ctx, st.pos, st.L, st.W, st.WB, i === 0, st.isColliding);
          
          // Draw connector to NEXT carriage (if not last)
          if (i < carriages - 1) {
            const nextSt = carriageStates[i + 1];
            drawConnector(ctx, st.pos, nextSt.pos, st.L);
          }
        }

        // Update state logic
        if (isPlaying || stateRef.current.distance > 0) {
           if (hasCollision && !stateRef.current.hasCollision) {
               stateRef.current.hasCollision = true;
           }
           if (hasCollision) {
               stateRef.current.collisionCount += collisionCount;
           }
           
           if (onSimulationUpdate) {
             onSimulationUpdate({
               progress: stateRef.current.progress,
               hasCollision: stateRef.current.hasCollision,
               collisionCount: stateRef.current.collisionCount,
               finished: stateRef.current.finished,
               distance: stateRef.current.distance / pixelsPerMeter,
             });
           }
        }
      }

      // ---- END CAMERA TRANSFORM ----
      ctx.restore();

      // ---- LAYER 7: HUD (screen space) ----
      drawScaleBar(ctx, cw, ch, pixelsPerMeter, zoom);
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
      canvas.removeEventListener('wheel', handleWheel);
      cancelAnimationFrame(animationFrameId);
    };
  }, [config, boundaries, trainPath, rulerPoints, tracingMode, isPlaying, resetTrigger, onAddPoint, onUndoPoint, onSimulationUpdate, simulationSpeed, pixelsPerMeter]);

  return <canvas ref={canvasRef} />;
};

// ==========================================
//   DRAWING HELPERS
// ==========================================

/**
 * Draw a polyline from an array of {x, y} points.
 * Used for boundaries and the train path.
 */
function drawBoundaryPolyline(ctx, points, color, lineWidth, dashed = false) {
  if (!points || points.length < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (dashed) {
    ctx.setLineDash([lineWidth * 4, lineWidth * 4]);
  }

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw small circles at each traced point for visual feedback.
 */
function drawTracingPoints(ctx, points, color, radius) {
  if (!points || points.length === 0) return;

  for (const pt of points) {
    // Outer ring
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Inner white dot
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}

/**
 * Draw a scale bar in screen space (bottom-right corner).
 */
function drawScaleBar(ctx, cw, ch, pixelsPerMeter, zoom) {
  const targetPx = 120;
  const targetMeters = targetPx / (pixelsPerMeter * zoom);

  const niceValues = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let scaleMeters = niceValues[0];
  for (const v of niceValues) {
    if (v <= targetMeters) scaleMeters = v;
    else break;
  }

  const scalePx = scaleMeters * pixelsPerMeter * zoom;
  const x = cw - 40 - scalePx;
  const y = ch - 40;

  // Background
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.beginPath();
  ctx.roundRect(x - 12, y - 24, scalePx + 24, 38, 8);
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
  ctx.fillText(`${scaleMeters} m`, x + scalePx / 2, y - 7);
}

/**
 * Draw a tracing mode indicator badge at the top-center of the canvas.
 */
function drawTracingModeIndicator(ctx, cw, tracingMode) {
  if (tracingMode === 'off') return;

  const labels = {
    outer: { text: '🔴 TRACING: Batas Luar', color: 'rgba(239, 68, 68, 0.9)' },
    inner: { text: '🔵 TRACING: Batas Dalam', color: 'rgba(59, 130, 246, 0.9)' },
    path:  { text: '🟢 TRACING: Path Kereta', color: 'rgba(34, 197, 94, 0.9)' },
    ruler: { text: '📏 ALAT UKUR (Ruler)', color: 'rgba(168, 85, 247, 0.9)' },
  };

  const info = labels[tracingMode];
  if (!info) return;

  const text = info.text;
  ctx.font = 'bold 14px Inter, sans-serif';
  const metrics = ctx.measureText(text);
  const padX = 20;
  const padY = 10;
  const w = metrics.width + padX * 2;
  const h = 36;
  const x = (cw - w) / 2;
  const y = 16;

  // Background pill
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.fill();

  // Border
  ctx.strokeStyle = info.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 18);
  ctx.stroke();

  // Text
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cw / 2, y + h / 2);
}

/**
 * Draw a trace line
 */
function drawTrace(ctx, points, color, lineWidth) {
  if (!points || points.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

/**
 * Draw a train carriage
 */
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

/**
 * Draw connector between carriages
 */
function drawConnector(ctx, currPos, nextPos, L) {
  // Connector goes from rear of current to front of next
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

  // Joint dot
  ctx.beginPath();
  ctx.fillStyle = '#ef4444';
  ctx.arc((rPx + fCx) / 2, (rPy + fCy) / 2, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

export default SatelliteCanvas;
