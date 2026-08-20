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

  // ---- Pixels-per-meter (computed dynamically from Google Maps zoom) ----
  const [pixelsPerMeter, setPixelsPerMeter] = useState(4.5);

  // ---- Boundary, Path & Ruler Data ----
  // Points are now stored as { lat, lng } (v2 keys avoid conflicts with old pixel-space data)
  const [boundaries, setBoundaries] = useState(() => {
    const saved = localStorage.getItem('artvis_boundaries_v2');
    return saved ? JSON.parse(saved) : { outer: [], inner: [] };
  });
  const [trainPath, setTrainPath] = useState(() => {
    const saved = localStorage.getItem('artvis_path_v2');
    return saved ? JSON.parse(saved) : [];
  });
  const [rulerPoints, setRulerPoints] = useState(() => {
    const saved = localStorage.getItem('artvis_ruler_v2');
    return saved ? JSON.parse(saved) : [];
  });
  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem('artvis_boundaries_v2', JSON.stringify(boundaries));
    localStorage.setItem('artvis_path_v2', JSON.stringify(trainPath));
    localStorage.setItem('artvis_ruler_v2', JSON.stringify(rulerPoints));
  }, [boundaries, trainPath, rulerPoints]);

  // ---- Simulation State ----
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [focusLocation, setFocusLocation] = useState(null);
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

  /**
   * Add a traced lat/lng point to the appropriate data array.
   * Points are { lat, lng } — the canvas converts them to pixels each frame.
   */
  const handleAddPoint = useCallback((point, mode) => {
    if (mode === 'outer') {
      setBoundaries(prev => ({ ...prev, outer: [...prev.outer, point] }));
    } else if (mode === 'inner') {
      setBoundaries(prev => ({ ...prev, inner: [...prev.inner, point] }));
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
      setBoundaries(prev => ({ ...prev, outer: prev.outer.slice(0, -1) }));
    } else if (tracingMode === 'inner') {
      setBoundaries(prev => ({ ...prev, inner: prev.inner.slice(0, -1) }));
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

  /** Export traced coordinates for saving/sharing */
  const handleExportCoordinates = useCallback(() => {
    const data = {
      version: 2,
      format: 'lat-lng',
      outer: boundaries.outer,
      inner: boundaries.inner,
      trainPath,
      rulerPoints,
    };
    console.log('=== ART-Vis Traced Coordinates (v2 lat/lng) ===');
    console.log(JSON.stringify(data, null, 2));
    return JSON.stringify(data, null, 2);
  }, [boundaries, trainPath, rulerPoints]);

  /** Import traced coordinates from JSON */
  const handleImportCoordinates = useCallback(() => {
    const jsonStr = prompt('Tempelkan (Paste) kode hasil export di sini:');
    if (!jsonStr) return;
    try {
      const data = JSON.parse(jsonStr);
      // Support v2 format (lat/lng)
      if (data.outer && data.inner && data.trainPath) {
        setBoundaries({ outer: data.outer, inner: data.inner });
        setTrainPath(data.trainPath);
        if (data.rulerPoints) setRulerPoints(data.rulerPoints);
        alert('Berhasil mengimpor data trace!');
        setResetTrigger(t => t + 1);
        setSimState({ progress: 0, hasCollision: false, collisionCount: 0, finished: false, distance: 0 });
        setIsPlaying(false);
      } else {
        alert('Format data tidak valid. Pastikan Anda menggunakan export versi terbaru (lat/lng).');
      }
    } catch (e) {
      alert('Error: Kode tidak valid. ' + e.message);
    }
  }, []);

  const handleLoadPreset = useCallback(async (presetFilename) => {
    try {
      const response = await fetch(`/presets/${presetFilename}`);
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      
      if (data.outer && data.inner && data.trainPath) {
        setBoundaries({ outer: data.outer, inner: data.inner });
        setTrainPath(data.trainPath);
        if (data.rulerPoints) setRulerPoints(data.rulerPoints);
        
        // Focus the map on the first point of the train path
        if (data.trainPath.length > 0) {
          setFocusLocation({ ...data.trainPath[0], zoom: 18, _t: Date.now() });
        }
        
        setResetTrigger(t => t + 1);
        setSimState({ progress: 0, hasCollision: false, collisionCount: 0, finished: false, distance: 0 });
        setIsPlaying(false);
      }
    } catch (error) {
      console.error("Failed to load preset:", error);
      alert('Gagal memuat preset rute.');
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

  /** Callback from SatelliteCanvas when map zoom changes */
  const handlePixelsPerMeterChange = useCallback((ppm) => {
    setPixelsPerMeter(ppm);
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
        boundaries={boundaries}
        trainPath={trainPath}
        onUndoPoint={handleUndoPoint}
        onClearAllPoints={handleClearAllPoints}
        onExportCoordinates={handleExportCoordinates}
        onImportCoordinates={handleImportCoordinates}
        onLoadPreset={handleLoadPreset}
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
          onPixelsPerMeterChange={handlePixelsPerMeterChange}
          focusLocation={focusLocation}
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
