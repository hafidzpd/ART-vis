import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import DashboardHUD from './components/DashboardHUD';
import SatelliteCanvas from './components/SatelliteCanvas';
import { calculatePhysicalRadius, calculateSweepRadii, calculateSweptPath } from './utils/simulationMath';
import { Play, Pause, RotateCcw } from 'lucide-react';

function App() {
  // ---- Vehicle Config ----
  const [config, setConfig] = useState({
    carriages: 3,
    length: 10,
    width: 2.65,
    wheelbase: 6,
    maxSteeringAngle: 18,
    clearance: 0.5,
  });

  // ---- Simulation Speed (km/h) ----
  const [simulationSpeed, setSimulationSpeed] = useState(30);

  // ---- Tracing Mode (Developer Mode) ----
  // 'off' | 'outer' | 'inner' | 'path' | 'ruler'
  const [tracingMode, setTracingMode] = useState('off');

  // ---- Scale ----
  const [pixelsPerMeter, setPixelsPerMeter] = useState(() => {
    const saved = localStorage.getItem('artvis_scale');
    return saved ? parseFloat(saved) : 4.5;
  });

  // ---- Boundary, Path & Ruler Data ----
  const [boundaries, setBoundaries] = useState(() => {
    const saved = localStorage.getItem('artvis_boundaries');
    return saved ? JSON.parse(saved) : { outer: [], inner: [] };
  });
  const [trainPath, setTrainPath] = useState(() => {
    const saved = localStorage.getItem('artvis_path');
    return saved ? JSON.parse(saved) : [];
  });
  const [rulerPoints, setRulerPoints] = useState(() => {
    const saved = localStorage.getItem('artvis_ruler');
    return saved ? JSON.parse(saved) : [];
  });

  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem('artvis_scale', pixelsPerMeter);
    localStorage.setItem('artvis_boundaries', JSON.stringify(boundaries));
    localStorage.setItem('artvis_path', JSON.stringify(trainPath));
    localStorage.setItem('artvis_ruler', JSON.stringify(rulerPoints));
  }, [pixelsPerMeter, boundaries, trainPath, rulerPoints]);

  // ---- Simulation State ----
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [simState, setSimState] = useState({
    progress: 0,
    hasCollision: false,
    collisionCount: 0,
    finished: false,
    distance: 0,
  });

  // ---- Derived calculations ----
  const physicalRadius = useMemo(
    () => calculatePhysicalRadius(config.wheelbase, config.maxSteeringAngle),
    [config.wheelbase, config.maxSteeringAngle]
  );

  const sweptPath = useMemo(
    () => calculateSweptPath(physicalRadius, config.width, config.wheelbase, config.length, config.clearance),
    [physicalRadius, config.width, config.wheelbase, config.length, config.clearance]
  );

  const { rInner, rOuter } = useMemo(
    () => calculateSweepRadii(physicalRadius, config.width, config.wheelbase, config.length),
    [physicalRadius, config.width, config.wheelbase, config.length]
  );

  // ---- Handlers ----

  /** Add a traced point to the appropriate data array */
  const handleAddPoint = useCallback((point, mode) => {
    if (mode === 'outer') {
      setBoundaries(prev => ({
        ...prev,
        outer: [...prev.outer, point],
      }));
    } else if (mode === 'inner') {
      setBoundaries(prev => ({
        ...prev,
        inner: [...prev.inner, point],
      }));
    } else if (mode === 'path') {
      setTrainPath(prev => [...prev, point]);
    } else if (mode === 'ruler') {
      setRulerPoints(prev => {
        if (prev.length >= 2) return [point];
        return [...prev, point];
      });
    }
  }, []);

  /** Remove the last traced point from the active tracing target */
  const handleUndoPoint = useCallback(() => {
    if (tracingMode === 'outer') {
      setBoundaries(prev => ({
        ...prev,
        outer: prev.outer.slice(0, -1),
      }));
    } else if (tracingMode === 'inner') {
      setBoundaries(prev => ({
        ...prev,
        inner: prev.inner.slice(0, -1),
      }));
    } else if (tracingMode === 'path') {
      setTrainPath(prev => prev.slice(0, -1));
    } else if (tracingMode === 'ruler') {
      setRulerPoints(prev => prev.slice(0, -1));
    }
  }, [tracingMode]);

  /** Clear all traced data */
  const handleClearAllPoints = useCallback(() => {
    setBoundaries({ outer: [], inner: [] });
    setTrainPath([]);
    setRulerPoints([]);
    setIsPlaying(false);
    setResetTrigger(t => t + 1);
    setSimState({ progress: 0, hasCollision: false, collisionCount: 0, finished: false, distance: 0 });
  }, []);

  /** Export traced coordinates for hardcoding */
  const handleExportCoordinates = useCallback(() => {
    const data = {
      outer: boundaries.outer,
      inner: boundaries.inner,
      trainPath: trainPath,
      rulerPoints: rulerPoints,
      pixelsPerMeter: pixelsPerMeter
    };
    // Safe structured logging for developer use only
    console.log('=== ART-Vis Traced Coordinates ===');
    console.log(JSON.stringify(data, null, 2));
    return JSON.stringify(data, null, 2);
  }, [boundaries, trainPath, rulerPoints, pixelsPerMeter]);

  /** Import traced coordinates from JSON */
  const handleImportCoordinates = useCallback(() => {
    const jsonStr = prompt("Tempelkan (Paste) kode hasil export di sini:");
    if (!jsonStr) return;
    try {
      const data = JSON.parse(jsonStr);
      if (data.outer && data.inner && data.trainPath) {
        setBoundaries({ outer: data.outer, inner: data.inner });
        setTrainPath(data.trainPath);
        if (data.rulerPoints) setRulerPoints(data.rulerPoints);
        if (data.pixelsPerMeter) setPixelsPerMeter(data.pixelsPerMeter);
        alert("Berhasil mengimpor data trace!");
        setResetTrigger(t => t + 1);
        setSimState({ progress: 0, hasCollision: false, collisionCount: 0, finished: false, distance: 0 });
        setIsPlaying(false);
      } else {
        alert("Format data tidak valid.");
      }
    } catch (e) {
      alert("Error: Kode tidak valid. " + e.message);
    }
  }, []);

  const handleReset = useCallback(() => {
    setResetTrigger(t => t + 1);
    setIsPlaying(true);
    setSimState({ progress: 0, hasCollision: false, collisionCount: 0, finished: false, distance: 0 });
  }, []);

  const handleSimulationUpdate = useCallback((state) => {
    setSimState(state);
  }, []);

  // Determine if simulation can be run
  const canSimulate = trainPath.length >= 2;

  return (
    <div className="app-container">
      <Sidebar
        config={config}
        setConfig={setConfig}
        simulationSpeed={simulationSpeed}
        setSimulationSpeed={setSimulationSpeed}
        tracingMode={tracingMode}
        setTracingMode={setTracingMode}
        pixelsPerMeter={pixelsPerMeter}
        setPixelsPerMeter={setPixelsPerMeter}
        boundaries={boundaries}
        trainPath={trainPath}
        onUndoPoint={handleUndoPoint}
        onClearAllPoints={handleClearAllPoints}
        onExportCoordinates={handleExportCoordinates}
        onImportCoordinates={handleImportCoordinates}
      />

      <DashboardHUD
        physicalRadius={physicalRadius}
        sweptPath={sweptPath}
        config={config}
        rInner={rInner}
        rOuter={rOuter}
        simState={simState}
        canSimulate={canSimulate}
      />

      <div className="canvas-container">
        <SatelliteCanvas
          config={config}
          boundaries={boundaries}
          trainPath={trainPath}
          rulerPoints={rulerPoints}
          tracingMode={tracingMode}
          onAddPoint={handleAddPoint}
          onUndoPoint={handleUndoPoint}
          isPlaying={isPlaying}
          resetTrigger={resetTrigger}
          onSimulationUpdate={handleSimulationUpdate}
          simulationSpeed={simulationSpeed}
          pixelsPerMeter={pixelsPerMeter}
        />

        <div className="playback-controls">
          <button
            className="btn-icon"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pause' : 'Play'}
            disabled={!canSimulate}
            style={!canSimulate ? { opacity: 0.4 } : {}}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            className="btn-icon"
            onClick={handleReset}
            title="Reset Simulasi"
            disabled={!canSimulate}
            style={!canSimulate ? { opacity: 0.4 } : {}}
          >
            <RotateCcw size={24} />
          </button>
        </div>

        <div className="legend glass-panel">
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#ef4444' }}></div>
            <span>Batas Luar (Trotoar)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#3b82f6' }}></div>
            <span>Batas Dalam (Median)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#22c55e' }}></div>
            <span>Path Kereta</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#fbbf24' }}></div>
            <span>Swept Path</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
