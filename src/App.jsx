import React, { useState, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import DashboardHUD from './components/DashboardHUD';
import ArtCanvas from './components/ArtCanvas';
import { calculatePhysicalRadius, calculateSweepRadii, calculateSweptPath, checkIntersectionCollision, findOptimalRadius } from './utils/simulationMath';
import { Play, Pause, RotateCcw, Ruler } from 'lucide-react';

function App() {
  const [config, setConfig] = useState({
    layoutType: 'intersection',
    carriages: 3,
    length: 10,
    width: 2.65,
    wheelbase: 6,
    maxSteeringAngle: 35,
    targetRadius: 25,
    clearance: 0.5,
    roadWidthPerDirection: 10.5,
    trainLaneWidth: 3.5,
    intersectionMargin: 0,
    showSecondTrain: false,
    showDimensions: false,
  });

  const [isPlaying, setIsPlaying] = useState(true);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [isRulerMode, setIsRulerMode] = useState(false);

  // Derived calculations
  const physicalRadius = useMemo(() => calculatePhysicalRadius(config.wheelbase, config.maxSteeringAngle), [config.wheelbase, config.maxSteeringAngle]);
  
  const laneWidth = config.trainLaneWidth || 3.5;
  const totalRoadWidth = config.roadWidthPerDirection * 2;
  const laneOffset = laneWidth / 2; 

  const optimalRadius = useMemo(() => {
    let opt = findOptimalRadius(config, laneWidth);
    return opt || Math.ceil(physicalRadius);
  }, [config, laneWidth, physicalRadius]);

  const activeConfig = { ...config, targetRadius: optimalRadius };

  const sweptPath = useMemo(() => calculateSweptPath(optimalRadius, config.width, config.wheelbase, config.length, config.clearance), [optimalRadius, config.width, config.wheelbase, config.length, config.clearance]);
  
  // Sweep radii for crash detection
  const { rInner, rOuter } = useMemo(() => calculateSweepRadii(optimalRadius, config.width, config.wheelbase, config.length), [optimalRadius, config.width, config.wheelbase, config.length]);
  
  // Road boundary radii (relative to the arc center of the turn)
  const medianRadius = optimalRadius - laneOffset;   
  const trainLaneOuterRadius = optimalRadius + laneOffset; 
  const roadOuterEdgeRadius = medianRadius + config.roadWidthPerDirection;
  
  // Comprehensive Intersection Crash detection
  const collisionResult = useMemo(() => checkIntersectionCollision(activeConfig, laneWidth), [activeConfig, laneWidth]);
  const isCrash = collisionResult.isCrash;
  const crashReasonsList = collisionResult.crashReasons;
  const overshotX = collisionResult.overshotX || 0;

  return (
    <div className="app-container">
      <Sidebar config={config} setConfig={setConfig} />
      
      <DashboardHUD 
        physicalRadius={physicalRadius}
        sweptPath={sweptPath}
        targetRadius={optimalRadius}
        isCrash={isCrash}
        crashReasonsList={crashReasonsList}
        config={config}
        laneWidth={laneWidth}
        rInner={rInner}
        rOuter={rOuter}
        medianRadius={medianRadius}
        trainLaneOuterRadius={trainLaneOuterRadius}
        roadOuterEdgeRadius={roadOuterEdgeRadius}
      />

      <div className="canvas-container">
        <ArtCanvas config={activeConfig} isPlaying={isPlaying} resetTrigger={resetTrigger} isCrash={isCrash} isRulerMode={isRulerMode} overshotX={overshotX} />
        
        <div className="playback-controls">
          <button 
            className={`btn-icon ${isRulerMode ? 'active' : ''}`} 
            onClick={() => setIsRulerMode(!isRulerMode)}
            title="Mode Penggaris (Ukur Jarak)"
            style={isRulerMode ? { background: '#facc15', color: '#000' } : {}}
          >
            <Ruler size={24} />
          </button>
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)', margin: '0 8px' }}></div>
          <button className="btn-icon" onClick={() => setIsPlaying(!isPlaying)} title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button className="btn-icon" onClick={() => {
            setResetTrigger(prev => prev + 1);
            setIsPlaying(true);
          }}>
            <RotateCcw size={24} />
          </button>
        </div>

        <div className="legend glass-panel">
          <div className="legend-item">
            <div className="legend-color red"></div>
            <span>Jejak Luar (Merah)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color blue"></div>
            <span>Jejak Dalam (Biru)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color green" style={{ borderBottom: '2px dashed #22c55e', background: 'transparent' }}></div>
            <span>Garis Tengah (Hijau)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
