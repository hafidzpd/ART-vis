import React, { useState, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import DashboardHUD from './components/DashboardHUD';
import ArtCanvas from './components/ArtCanvas';
import { calculatePhysicalRadius, calculateSweepRadii, calculateSweptPath } from './utils/simulationMath';
import { Play, Pause, RotateCcw } from 'lucide-react';

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
    lanesPerDirection: 3,
    showCars: true,
  });

  const [isPlaying, setIsPlaying] = useState(true);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Derived calculations
  const physicalRadius = useMemo(() => calculatePhysicalRadius(config.wheelbase, config.maxSteeringAngle), [config.wheelbase, config.maxSteeringAngle]);
  const sweptPath = useMemo(() => calculateSweptPath(config.targetRadius, config.width, config.wheelbase, config.length, config.clearance), [config.targetRadius, config.width, config.wheelbase, config.length, config.clearance]);
  
  // Sweep radii for crash detection
  const { rInner, rOuter } = useMemo(() => calculateSweepRadii(config.targetRadius, config.width, config.wheelbase, config.length), [config.targetRadius, config.width, config.wheelbase, config.length]);
  
  const laneWidth = 3.5; // Standard Indonesian lane width
  const totalRoadWidth = config.lanesPerDirection * laneWidth * 2;
  
  // The train runs in the innermost lane. The distance from the center divider (median) to the center of the innermost lane is laneWidth / 2.
  const laneOffset = laneWidth / 2; 
  
  // Road boundary radii (relative to the arc center of the turn)
  const medianRadius = config.targetRadius - laneOffset;   // Center divider (median)
  const trainLaneOuterRadius = config.targetRadius + laneOffset; // Line separating ART lane from mixed traffic
  const roadOuterEdgeRadius = medianRadius + (config.lanesPerDirection * laneWidth); // Outer curb (trotoar)
  
  // Crash detection
  const isRadiusCrash = config.targetRadius < physicalRadius;
  const isInnerCrash = rInner < medianRadius;   // body hits or crosses the median into oncoming traffic
  const isLaneCross = rOuter > trainLaneOuterRadius;    // body crosses into the mixed traffic lane
  const isOuterCrash = rOuter > roadOuterEdgeRadius;    // body exits road entirely (rare if lanes >= 2)
  const isCrash = isRadiusCrash || isInnerCrash || isLaneCross || isOuterCrash;

  return (
    <div className="app-container">
      <Sidebar config={config} setConfig={setConfig} />
      
      <DashboardHUD 
        physicalRadius={physicalRadius}
        sweptPath={sweptPath}
        targetRadius={config.targetRadius}
        isCrash={isCrash}
        isRadiusCrash={isRadiusCrash}
        isInnerCrash={isInnerCrash}
        isOuterCrash={isOuterCrash}
        isLaneCross={isLaneCross}
        config={config}
        laneWidth={laneWidth}
        rInner={rInner}
        rOuter={rOuter}
        medianRadius={medianRadius}
        trainLaneOuterRadius={trainLaneOuterRadius}
        roadOuterEdgeRadius={roadOuterEdgeRadius}
      />

      <div className="canvas-container">
        <ArtCanvas config={config} isPlaying={isPlaying} resetTrigger={resetTrigger} isCrash={isCrash} />
        
        <div className="playback-controls">
          <button className="btn-icon" onClick={() => setIsPlaying(!isPlaying)}>
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
