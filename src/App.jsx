import React, { useState, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import DashboardHUD from './components/DashboardHUD';
import ArtCanvas from './components/ArtCanvas';
import { calculatePhysicalRadius, calculateSweepRadii, calculateSweptPath, checkIntersectionCollision, findOptimalRadius } from './utils/simulationMath';
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
    laneWidth: 3.5,
    intersectionMargin: 0,
    showSecondTrain: false,
  });

  const [isPlaying, setIsPlaying] = useState(true);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Derived calculations
  const physicalRadius = useMemo(() => calculatePhysicalRadius(config.wheelbase, config.maxSteeringAngle), [config.wheelbase, config.maxSteeringAngle]);
  const sweptPath = useMemo(() => calculateSweptPath(config.targetRadius, config.width, config.wheelbase, config.length, config.clearance), [config.targetRadius, config.width, config.wheelbase, config.length, config.clearance]);
  
  // Sweep radii for crash detection
  const { rInner, rOuter } = useMemo(() => calculateSweepRadii(config.targetRadius, config.width, config.wheelbase, config.length), [config.targetRadius, config.width, config.wheelbase, config.length]);
  
  const laneWidth = config.laneWidth || 3.5; // Customizable lane width
  const totalRoadWidth = config.lanesPerDirection * laneWidth * 2;
  
  // The train runs in the innermost lane. The distance from the center divider (median) to the center of the innermost lane is laneWidth / 2.
  const laneOffset = laneWidth / 2; 
  
  // Road boundary radii (relative to the arc center of the turn)
  const medianRadius = config.targetRadius - laneOffset;   
  const trainLaneOuterRadius = config.targetRadius + laneOffset; 
  const roadOuterEdgeRadius = medianRadius + (config.lanesPerDirection * laneWidth);
  
  // Comprehensive Intersection Crash detection
  const collisionResult = useMemo(() => checkIntersectionCollision(config, laneWidth), [config, laneWidth]);
  const isCrash = collisionResult.isCrash;
  const crashReasonsList = collisionResult.crashReasons;

  const handleAutoRecommend = () => {
    let optimal = findOptimalRadius(config, laneWidth);
    if (optimal) {
      setConfig(prev => ({ ...prev, targetRadius: optimal }));
    } else {
      let found = false;
      for (let margin = 1; margin <= 30; margin++) {
        const testConfig = { ...config, intersectionMargin: (config.intersectionMargin || 0) + margin };
        optimal = findOptimalRadius(testConfig, laneWidth);
        if (optimal) {
          setConfig(prev => ({ ...prev, targetRadius: optimal, intersectionMargin: testConfig.intersectionMargin }));
          found = true;
          break;
        }
      }
      if (!found) alert("Kendaraan terlalu besar untuk jalan ini. Coba kurangi gerbong atau tambah lajur.");
    }
  };

  return (
    <div className="app-container">
      <Sidebar config={config} setConfig={setConfig} onAutoRecommend={handleAutoRecommend} />
      
      <DashboardHUD 
        physicalRadius={physicalRadius}
        sweptPath={sweptPath}
        targetRadius={config.targetRadius}
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
