import React, { useRef, useEffect } from 'react';

const ArtCanvas = ({ config, isPlaying, resetTrigger, isCrash, isRulerMode, overshotX }) => {
  const canvasRef = useRef(null);
  const stateRef = useRef({ distance: 0, traces: { red: [], blue: [], green: [] } });
  const cameraRef = useRef({ x: 0, y: 0, isDragging: false, lastMouse: { x: 0, y: 0 } });
  const rulerRef = useRef({ isDrawing: false, start: null, end: null });
  const modeRef = useRef(isRulerMode);
  const SCALE = 12; // 1 meter = 12 pixels

  useEffect(() => {
    modeRef.current = isRulerMode;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = isRulerMode ? 'crosshair' : 'grab';
    }
  }, [isRulerMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resizeCanvas = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const resetState = () => {
      stateRef.current = { distance: 0, traces: { red: [], blue: [], green: [] } };
      // Note: We deliberately don't reset camera offset here so panning is preserved when parameters change
    };
    resetState();

    // Panning & Ruler event listeners
    const handlePointerDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (modeRef.current) {
        // Ruler Mode
        rulerRef.current.isDrawing = true;
        rulerRef.current.start = { 
          x: mouseX - cameraRef.current.x, 
          y: mouseY - cameraRef.current.y 
        };
        rulerRef.current.end = { ...rulerRef.current.start };
      } else {
        // Panning Mode
        cameraRef.current.isDragging = true;
        cameraRef.current.lastMouse = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
      }
    };

    const handlePointerMove = (e) => {
      if (modeRef.current && rulerRef.current.isDrawing) {
        const rect = canvas.getBoundingClientRect();
        rulerRef.current.end = {
          x: (e.clientX - rect.left) - cameraRef.current.x,
          y: (e.clientY - rect.top) - cameraRef.current.y
        };
      } else if (!modeRef.current && cameraRef.current.isDragging) {
        const dx = e.clientX - cameraRef.current.lastMouse.x;
        const dy = e.clientY - cameraRef.current.lastMouse.y;
        cameraRef.current.x += dx;
        cameraRef.current.y += dy;
        cameraRef.current.lastMouse = { x: e.clientX, y: e.clientY };
      }
    };

    const handlePointerUpOrLeave = () => {
      if (modeRef.current) {
        rulerRef.current.isDrawing = false;
      } else {
        cameraRef.current.isDragging = false;
        canvas.style.cursor = 'grab';
      }
    };

    canvas.style.cursor = modeRef.current ? 'crosshair' : 'grab';
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUpOrLeave);

    const render = () => {
      // --- Base variables ---
      const cw = canvas.width;
      const ch = canvas.height;
      const { carriages, length, width, wheelbase, targetRadius, layoutType, showCars, showSecondTrain } = config;

      // --- Pixel conversions ---
      const R = targetRadius * SCALE;
      const W = width * SCALE;
      const L = length * SCALE;
      const WB = wheelbase * SCALE;
      
      const laneWidthPx = (config.trainLaneWidth || 3.5) * SCALE;
      const roadWidthPerDirectionPx = (config.roadWidthPerDirection || 10.5) * SCALE;
      const intersectionMarginPx = (config.intersectionMargin || 0) * SCALE;
      const halfRW = roadWidthPerDirectionPx + intersectionMarginPx;
      const RW = halfRW * 2;
      
      // Train is in the innermost lane (LHT: rightmost lane of the left side)
      // So it's adjacent to the median. Distance from median to lane center is laneWidthPx / 2.
      const laneOff = laneWidthPx / 2;

      // --- Fixed intersection anchor (World Coordinates) ---
      const intX = cw * 0.55;
      const intY = ch * 0.55;

      // Road edges (fixed)
      const rTop = intY - halfRW;
      const rBot = intY + halfRW;
      const rLeft = intX - halfRW;
      const rRight = intX + halfRW;

      const overshotXPx = (overshotX || 0) * SCALE;
      // Vehicle path 1: Eastbound (top half) turning Southbound (right half) - LHT Right Turn
      const cy = intY - laneOff;
      const vx = intX + laneOff + overshotXPx;
      const acy = cy + R;
      const acx = vx - R;
      const cx = acx;

      // Vehicle path 2: Northbound (from South) turning Westbound - LHT Left Turn
      const vx2 = intX - laneOff;
      const cy2 = intY + laneOff - overshotXPx;
      const acy2 = cy2 + R;
      const acx2 = vx2 - R;

      // Concentric radii from arc center
      const rInnerSweep = R - W / 2;
      const rOuterSweep = Math.sqrt(Math.pow(R + W / 2, 2) + Math.pow(WB + (L - WB) / 2, 2));

      // Clear canvas
      ctx.clearRect(0, 0, cw, ch);
      
      // Apply camera panning translation
      ctx.save();
      ctx.translate(cameraRef.current.x, cameraRef.current.y);

      // --- Grid (expanded to allow panning) ---
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      const gridExt = 2000;
      for (let gx = -gridExt; gx < cw + gridExt; gx += SCALE * 5) {
        ctx.beginPath(); ctx.moveTo(gx, -gridExt); ctx.lineTo(gx, ch + gridExt); ctx.stroke();
      }
      for (let gy = -gridExt; gy < ch + gridExt; gy += SCALE * 5) {
        ctx.beginPath(); ctx.moveTo(-gridExt, gy); ctx.lineTo(cw + gridExt, gy); ctx.stroke();
      }

      // ==========================================
      //   DRAW ENVIRONMENT
      // ==========================================

      drawIntersection(ctx, cw, ch, intX, intY, rTop, rBot, rLeft, rRight, RW, halfRW, acx, acy, laneWidthPx, roadWidthPerDirectionPx, rInnerSweep, rOuterSweep, SCALE);
      
      if (showSecondTrain) {
         // Draw sweep paths for second train
         if (rInnerSweep > 0) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(59,130,246,0.4)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.arc(acx2, acy2, rInnerSweep, 0, -Math.PI / 2, true);
            ctx.stroke();
            ctx.setLineDash([]);
         }
         if (rOuterSweep > 0) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(239,68,68,0.4)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.arc(acx2, acy2, rOuterSweep, 0, -Math.PI / 2, true);
            ctx.stroke();
            ctx.setLineDash([]);
         }
      }

      if (config.showDimensions) {
        const drawDim = (r, angle, color, label, val) => {
          if (r <= 0) return;
          const ex = acx + r * Math.cos(angle);
          const ey = acy + r * Math.sin(angle);
          
          ctx.beginPath();
          ctx.moveTo(acx, acy);
          ctx.lineTo(ex, ey);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          
          ctx.beginPath();
          ctx.arc(ex, ey, 4, 0, Math.PI*2);
          ctx.fillStyle = color;
          ctx.fill();
          
          ctx.save();
          const midX = acx + (r/2) * Math.cos(angle);
          const midY = acy + (r/2) * Math.sin(angle);
          ctx.translate(midX, midY);
          let textAngle = angle;
          if (textAngle > Math.PI/2 || textAngle < -Math.PI/2) textAngle += Math.PI;
          ctx.rotate(textAngle);
          
          const text = `${label}: ${val.toFixed(1)}m`;
          ctx.font = 'bold 12px Inter, sans-serif';
          const tMetrics = ctx.measureText(text);
          const tWidth = tMetrics.width + 12;
          
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.beginPath();
          ctx.roundRect(-tWidth/2, -12, tWidth, 24, 4);
          ctx.fill();
          
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, 0, 0);
          ctx.restore();
        };

        // Draw radial dimensions pointing to the Top-Right quadrant of the arc center (where the primary turn is)
        // Note: Canvas Y is down, so Top is -Y, Right is +X. Angles between 0 and -PI/2.
        drawDim(rInnerSweep, -Math.PI / 2.5, '#3b82f6', 'rInner', rInnerSweep / SCALE);
        drawDim(R, -Math.PI / 4, '#22c55e', 'Radius', R / SCALE);
        drawDim(rOuterSweep, -Math.PI / 7, '#ef4444', 'rOuter', rOuterSweep / SCALE);
        
        ctx.beginPath();
        ctx.arc(acx, acy, 6, 0, Math.PI*2);
        ctx.fillStyle = '#facc15';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#000';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.fillText("Pusat Radius", acx - 40, acy + 18);
        ctx.fillStyle = '#facc15';
        ctx.fillText("Pusat Radius", acx - 41, acy + 17);
      }

      if (showCars) {
          drawCarsForScale(ctx, intX, intY, laneWidthPx, roadWidthPerDirectionPx, SCALE);
      }

      // ==========================================
      //   ANIMATION / VEHICLE
      // ==========================================

      if (isPlaying) {
        const pxPerFrame = (30 * (1000 / 3600) * SCALE) / 60;
        stateRef.current.distance += pxPerFrame;
      }

      const d = stateRef.current.distance;

      // Path state function 1 (Eastbound to Southbound Right Turn)
      const getPathState = (dist) => {
        if (dist < cx) {
          return { x: dist, y: cy, angle: 0 };
        }
        const arcDist = dist - cx;
        const arcLen = (Math.PI / 2) * R;
        if (arcDist < arcLen) {
          const theta = arcDist / R;
          return {
            x: acx + R * Math.sin(theta),
            y: acy - R * Math.cos(theta),
            angle: theta
          };
        } else {
          const straightDist = arcDist - arcLen;
          return {
            x: vx,
            y: acy + straightDist,
            angle: Math.PI / 2
          };
        }
      };

      // Path state function 2 (South to West Left Turn)
      const getSecondaryPathState = (dist) => {
        const startY = ch + L; 
        const cx2 = startY - acy2;
        if (dist < cx2) {
          return { x: vx2, y: startY - dist, angle: -Math.PI / 2 };
        }
        const arcDist = dist - cx2;
        const arcLen = (Math.PI / 2) * R;
        if (arcDist < arcLen) {
          const theta = -(arcDist / R);
          return {
            x: acx2 + R * Math.cos(theta),
            y: acy2 + R * Math.sin(theta),
            angle: theta - Math.PI / 2
          };
        } else {
          const straightDist = arcDist - arcLen;
          return {
            x: acx2 - straightDist,
            y: cy2,
            angle: Math.PI
          };
        }
      };

      // Calculate carriage positions
      const carriageStates = [];
      const carriageStates2 = [];
      let headDist = d;
      for (let i = 0; i < carriages; i++) {
        carriageStates.push(getPathState(headDist - L / 2));
        if (showSecondTrain) carriageStates2.push(getSecondaryPathState(headDist - L / 2));
        headDist -= L + 1 * SCALE;
      }

      // Record traces from lead carriage (only for primary train to avoid clutter)
      const lead = carriageStates[0];
      if (lead.x > -L && lead.x < cw + L && lead.y > -L && lead.y < ch + L && isPlaying) {
        const cos_a = Math.cos(lead.angle);
        const sin_a = Math.sin(lead.angle);
        const fOx = lead.x + (L/2) * cos_a - (W/2) * sin_a;
        const fOy = lead.y + (L/2) * sin_a + (W/2) * cos_a;
        const rIx = lead.x - (L/2) * cos_a + (W/2) * sin_a;
        const rIy = lead.y - (L/2) * sin_a - (W/2) * cos_a;
        stateRef.current.traces.red.push({ x: fOx, y: fOy });
        stateRef.current.traces.blue.push({ x: rIx, y: rIy });
        stateRef.current.traces.green.push({ x: lead.x, y: lead.y });
      }

      // Draw traces
      const drawTrace = (pts, color, dash = false) => {
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        if (dash) ctx.setLineDash([5, 5]);
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      drawTrace(stateRef.current.traces.red, '#ef4444');
      drawTrace(stateRef.current.traces.blue, '#3b82f6');
      drawTrace(stateRef.current.traces.green, '#22c55e', true);

      // Helper to draw trains
      const drawTrain = (states, isPrimary) => {
        states.forEach((st, i) => {
          ctx.save();
          ctx.translate(st.x, st.y);
          ctx.rotate(st.angle);

          const bodyColor = isPrimary && isCrash ? 'rgba(239, 68, 68, 0.85)' : (i === 0 ? 'rgba(59, 130, 246, 0.9)' : 'rgba(148, 163, 184, 0.9)');
          ctx.fillStyle = bodyColor;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(-L / 2, -W / 2, L, W, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#111';
          const ww = 4, wh = 6;
          ctx.fillRect(WB/2 - ww/2, -W/2 - 2, ww, wh);
          ctx.fillRect(WB/2 - ww/2, W/2 - wh + 2, ww, wh);
          ctx.fillRect(-WB/2 - ww/2, -W/2 - 2, ww, wh);
          ctx.fillRect(-WB/2 - ww/2, W/2 - wh + 2, ww, wh);
          ctx.restore();

          if (i > 0) {
            const prev = states[i - 1];
            const rPx = prev.x - (L/2) * Math.cos(prev.angle);
            const rPy = prev.y - (L/2) * Math.sin(prev.angle);
            const fCx = st.x + (L/2) * Math.cos(st.angle);
            const fCy = st.y + (L/2) * Math.sin(st.angle);
            ctx.beginPath();
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 3;
            ctx.moveTo(rPx, rPy);
            ctx.lineTo(fCx, fCy);
            ctx.stroke();
            ctx.beginPath();
            ctx.fillStyle = '#ef4444';
            ctx.arc((rPx + fCx) / 2, (rPy + fCy) / 2, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      };

      drawTrain(carriageStates, true);
      if (showSecondTrain) drawTrain(carriageStates2, false);

      // ==========================================
      //   RULER
      // ==========================================
      const rStart = rulerRef.current.start;
      const rEnd = rulerRef.current.end;
      if (rStart && rEnd) {
        ctx.beginPath();
        ctx.moveTo(rStart.x, rStart.y);
        ctx.lineTo(rEnd.x, rEnd.y);
        ctx.strokeStyle = '#facc15'; 
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#facc15';
        ctx.beginPath(); ctx.arc(rStart.x, rStart.y, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(rEnd.x, rEnd.y, 4, 0, Math.PI*2); ctx.fill();
        
        const dx = rEnd.x - rStart.x;
        const dy = rEnd.y - rStart.y;
        const distPx = Math.sqrt(dx*dx + dy*dy);
        const distM = (distPx / SCALE).toFixed(2);
        
        const midX = rStart.x + dx / 2;
        const midY = rStart.y + dy / 2;
        
        ctx.save();
        ctx.translate(midX, midY);
        let angle = Math.atan2(dy, dx);
        if (angle > Math.PI/2 || angle < -Math.PI/2) angle += Math.PI;
        ctx.rotate(angle);
        
        const text = `${distM} m`;
        ctx.font = 'bold 14px Inter, sans-serif';
        const tMetrics = ctx.measureText(text);
        const tWidth = tMetrics.width + 16;
        
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.beginPath();
        ctx.roundRect(-tWidth/2, -26, tWidth, 24, 6);
        ctx.fill();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.fillStyle = '#facc15';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, -14);
        ctx.restore();
      }

      // Loop animation
      const last = carriageStates[carriageStates.length - 1];
      if (last.y > -L * 2) {
        animationFrameId = requestAnimationFrame(render);
      } else if (isPlaying) {
        resetState();
        animationFrameId = requestAnimationFrame(render);
      }
      
      // Restore from camera translation
      ctx.restore();
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUpOrLeave);
      if (canvas) canvas.removeEventListener('pointerdown', handlePointerDown);
      cancelAnimationFrame(animationFrameId);
    };
  }, [config, isPlaying, resetTrigger, isCrash, isRulerMode]);

  return <canvas ref={canvasRef} />;
};

// ==========================================
//   INTERSECTION DRAWING
// ==========================================
function drawIntersection(ctx, cw, ch, intX, intY, rTop, rBot, rLeft, rRight, RW, halfRW, acx, acy, laneWidthPx, roadWidthPerDirectionPx, rInnerSweep, rOuterSweep, SCALE) {
  // 1. Green islands (4 quadrants)
  ctx.fillStyle = 'rgba(34,197,94,0.12)';
  ctx.fillRect(-2000, -2000, rLeft + 2000, rTop + 2000);
  ctx.fillRect(rRight, -2000, cw + 2000 - rRight, rTop + 2000);
  ctx.fillRect(-2000, rBot, rLeft + 2000, ch + 2000 - rBot);
  ctx.fillRect(rRight, rBot, cw + 2000 - rRight, ch + 2000 - rBot);

  // 2. Asphalt roads (cross)
  ctx.fillStyle = '#334155';
  ctx.fillRect(-2000, rTop, cw + 4000, RW); // Horizontal road
  ctx.fillRect(rLeft, -2000, RW, ch + 4000); // Vertical road

  // 3. Center dividers (solid yellow double line)
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  
  // Horizontal median
  ctx.beginPath();
  ctx.moveTo(-2000, intY - 1); ctx.lineTo(rLeft, intY - 1);
  ctx.moveTo(-2000, intY + 1); ctx.lineTo(rLeft, intY + 1);
  
  ctx.moveTo(rRight, intY - 1); ctx.lineTo(cw + 2000, intY - 1);
  ctx.moveTo(rRight, intY + 1); ctx.lineTo(cw + 2000, intY + 1);
  ctx.stroke();

  // Vertical median
  ctx.beginPath();
  ctx.moveTo(intX - 1, -2000); ctx.lineTo(intX - 1, rTop);
  ctx.moveTo(intX + 1, -2000); ctx.lineTo(intX + 1, rTop);
  
  ctx.moveTo(intX - 1, rBot); ctx.lineTo(intX - 1, ch + 2000);
  ctx.moveTo(intX + 1, rBot); ctx.lineTo(intX + 1, ch + 2000);
  ctx.stroke();

  // 4. Lane markings
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  
  // Solid line for ART lane
  ctx.beginPath();
  const artL = laneWidthPx;
  ctx.moveTo(-2000, intY - artL); ctx.lineTo(rLeft, intY - artL);
  ctx.moveTo(rRight, intY - artL); ctx.lineTo(cw + 2000, intY - artL);
  ctx.moveTo(-2000, intY + artL); ctx.lineTo(rLeft, intY + artL);
  ctx.moveTo(rRight, intY + artL); ctx.lineTo(cw + 2000, intY + artL);

  ctx.moveTo(intX - artL, -2000); ctx.lineTo(intX - artL, rTop);
  ctx.moveTo(intX - artL, rBot); ctx.lineTo(intX - artL, ch + 2000);
  ctx.moveTo(intX + artL, -2000); ctx.lineTo(intX + artL, rTop);
  ctx.moveTo(intX + artL, rBot); ctx.lineTo(intX + artL, ch + 2000);
  ctx.stroke();

  // Dashed lines for remaining lanes
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.setLineDash([15, 15]);
  const remW = roadWidthPerDirectionPx - artL;
  const numLanes = Math.max(1, Math.floor(remW / (3.5 * SCALE)));
  if (numLanes > 1) {
    const wPerLane = remW / numLanes;
    for (let i = 1; i < numLanes; i++) {
      const offset = artL + i * wPerLane;
      ctx.beginPath();
      // Horizontal
      ctx.moveTo(-2000, intY - offset); ctx.lineTo(rLeft, intY - offset);
      ctx.moveTo(rRight, intY - offset); ctx.lineTo(cw + 2000, intY - offset);
      ctx.moveTo(-2000, intY + offset); ctx.lineTo(rLeft, intY + offset);
      ctx.moveTo(rRight, intY + offset); ctx.lineTo(cw + 2000, intY + offset);
      // Vertical
      ctx.moveTo(intX - offset, -2000); ctx.lineTo(intX - offset, rTop);
      ctx.moveTo(intX - offset, rBot); ctx.lineTo(intX - offset, ch + 2000);
      ctx.moveTo(intX + offset, -2000); ctx.lineTo(intX + offset, rTop);
      ctx.moveTo(intX + offset, rBot); ctx.lineTo(intX + offset, ch + 2000);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // 5. Outer Curbs (trotoar)
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  const cf = 6 * SCALE; // corner fillet radius

  // TL corner
  ctx.beginPath();
  ctx.moveTo(-2000, rTop);
  ctx.lineTo(rLeft - cf, rTop);
  ctx.arcTo(rLeft, rTop, rLeft, rTop - cf, cf);
  ctx.lineTo(rLeft, -2000);
  ctx.stroke();

  // TR corner
  ctx.beginPath();
  ctx.moveTo(cw + 2000, rTop);
  ctx.lineTo(rRight + cf, rTop);
  ctx.arcTo(rRight, rTop, rRight, rTop - cf, cf);
  ctx.lineTo(rRight, -2000);
  ctx.stroke();

  // BR corner
  ctx.beginPath();
  ctx.moveTo(cw + 2000, rBot);
  ctx.lineTo(rRight + cf, rBot);
  ctx.arcTo(rRight, rBot, rRight, rBot + cf, cf);
  ctx.lineTo(rRight, ch + 2000);
  ctx.stroke();

  // BL corner
  ctx.beginPath();
  ctx.moveTo(-2000, rBot);
  ctx.lineTo(rLeft - cf, rBot);
  ctx.arcTo(rLeft, rBot, rLeft, rBot + cf, cf);
  ctx.lineTo(rLeft, ch + 2000);
  ctx.stroke();

  // 6. Swept path overlay
  if (rInnerSweep > 0) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(59,130,246,0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    // The turn is from 0 (East) to PI/2 (South).
    // The arc center is (acx, acy). Start is (acx, acy-R), End is (acx+R, acy).
    // In canvas arc(), 0 is right, PI/2 is down.
    // Start angle: -Math.PI/2 (top). End angle: 0 (right). Clockwise.
    ctx.arc(acx, acy, rInnerSweep, -Math.PI / 2, 0, false);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (rOuterSweep > 0) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(239,68,68,0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.arc(acx, acy, rOuterSweep, -Math.PI / 2, 0, false);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ==========================================
//   CURVE DRAWING
// ==========================================
function drawCurve(ctx, cw, ch, intX, intY, acx, acy, cx, cy, vx, R, RW, halfRW, laneOff, rIC, rCL, rOC, rInnerSweep, rOuterSweep, SCALE) {
  // Road center: radius rCL from arc center
  // Horizontal center: y = acy + rCL = cy
  // Wait, road center y = intY = cy + laneOff

  const roadCenterY = intY; // = cy + laneOff
  const roadCenterX = intX; // = vx + laneOff

  // 1. Draw asphalt as thick stroke along road centerline
  ctx.beginPath();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = RW;
  ctx.lineCap = 'butt';
  ctx.moveTo(0, roadCenterY);
  ctx.lineTo(acx, roadCenterY);
  ctx.arc(acx, acy, rCL, Math.PI / 2, 0, true);
  ctx.lineTo(roadCenterX, 0);
  ctx.stroke();

  // 2. Green fill - inner island
  if (rIC > 0) {
    ctx.fillStyle = 'rgba(34,197,94,0.12)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(roadCenterX - halfRW, 0);
    ctx.lineTo(roadCenterX - halfRW, acy);
    ctx.arc(acx, acy, rIC, 0, Math.PI / 2, false);
    ctx.lineTo(0, roadCenterY - halfRW);
    ctx.closePath();
    ctx.fill();
  }

  // Green fill - outer
  ctx.fillStyle = 'rgba(34,197,94,0.12)';
  ctx.beginPath();
  ctx.moveTo(0, ch);
  ctx.lineTo(cw, ch);
  ctx.lineTo(cw, 0);
  ctx.lineTo(roadCenterX + halfRW, 0);
  ctx.lineTo(roadCenterX + halfRW, acy);
  ctx.arc(acx, acy, rOC, 0, Math.PI / 2, true);
  ctx.lineTo(0, roadCenterY + halfRW);
  ctx.closePath();
  ctx.fill();

  // 3. Curb lines
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2.5;

  // Inner curb
  if (rIC > 0) {
    ctx.beginPath();
    ctx.moveTo(0, roadCenterY - halfRW);
    ctx.lineTo(acx, roadCenterY - halfRW);
    ctx.arc(acx, acy, rIC, Math.PI / 2, 0, true);
    ctx.lineTo(roadCenterX - halfRW, 0);
    ctx.stroke();
  }

  // Outer curb
  ctx.beginPath();
  ctx.moveTo(0, roadCenterY + halfRW);
  ctx.lineTo(acx, roadCenterY + halfRW);
  ctx.arc(acx, acy, rOC, Math.PI / 2, 0, true);
  ctx.lineTo(roadCenterX + halfRW, 0);
  ctx.stroke();

  // 4. Center divider (dashed yellow)
  ctx.beginPath();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.moveTo(0, roadCenterY);
  ctx.lineTo(acx, roadCenterY);
  ctx.arc(acx, acy, rCL, Math.PI / 2, 0, true);
  ctx.lineTo(roadCenterX, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  // 5. Swept path overlay
  if (rInnerSweep > 0) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(59,130,246,0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.arc(acx, acy, rInnerSweep, Math.PI / 2, 0, true);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(239,68,68,0.4)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.arc(acx, acy, rOuterSweep, Math.PI / 2, 0, true);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ==========================================
//   STATIC CARS (FOR VISUAL SCALE)
// ==========================================
function drawCarsForScale(ctx, intX, intY, laneWidthPx, roadWidthPerDirectionPx, SCALE) {
  // Typical family car dimensions: 4.5m length, 1.8m width
  const carL = 4.5 * SCALE;
  const carW = 1.8 * SCALE;

  const drawCar = (x, y, angle, color) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.roundRect(-carL/2 + 2, -carW/2 + 2, carL, carW, 4);
    ctx.fill();

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-carL/2, -carW/2, carL, carW, 4);
    ctx.fill();

    // Windshield/Windows
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(carL/2 - 10, -carW/2 + 3, 6, carW - 6); // Front
    ctx.fillRect(-carL/2 + 4, -carW/2 + 3, 5, carW - 6); // Rear
    ctx.fillRect(-carL/2 + 10, -carW/2 + 1.5, carL - 22, 2); // Side
    ctx.fillRect(-carL/2 + 10, carW/2 - 3.5, carL - 22, 2); // Side

    ctx.restore();
  };

  const halfRW = roadWidthPerDirectionPx;
  const remW = roadWidthPerDirectionPx - laneWidthPx;
  const numLanes = Math.max(1, Math.floor(remW / (3.5 * SCALE)));
  const wPerLane = remW / numLanes;

  // LHT: Traffic waits before entering the intersection box.
  
  // Westbound traffic (Bottom half) waiting at the East intersection line (facing Left / Math.PI)
  for (let i = 0; i < numLanes; i++) {
    const laneY = intY + laneWidthPx + (wPerLane / 2) + (i * wPerLane);
    drawCar(intX + halfRW + 4*SCALE, laneY, Math.PI, i === 0 ? '#facc15' : '#38bdf8');
    if (i > 0) drawCar(intX + halfRW + 10*SCALE, laneY, Math.PI, '#94a3b8'); // Second car in outer lanes
  }

  // Northbound traffic (Left half) waiting at the South intersection line (facing Up / -Math.PI/2)
  for (let i = 0; i < numLanes; i++) {
    const laneX = intX - laneWidthPx - (wPerLane / 2) - (i * wPerLane);
    drawCar(laneX, intY + halfRW + 4*SCALE, -Math.PI/2, '#ef4444');
    if (i > 0) drawCar(laneX, intY + halfRW + 11*SCALE, -Math.PI/2, '#a8a29e');
  }
}

export default ArtCanvas;
