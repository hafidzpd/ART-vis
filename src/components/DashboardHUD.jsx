import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const DashboardHUD = ({
  physicalRadius,
  sweptPath,
  targetRadius,
  isCrash,
  crashReasonsList,
  config,
  laneWidth,
  rInner,
  rOuter,
  medianRadius,
  trainLaneOuterRadius,
  roadOuterEdgeRadius
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const minRequiredRadius = physicalRadius;

  const crashReasons = crashReasonsList || [];

  const totalRoadWidth = config.lanesPerDirection * laneWidth * 2;

  return (
    <div className={`hud-container glass-panel ${isMinimized ? 'minimized' : ''}`}>
      <div className="hud-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
           <span>Status: </span>
           <span className={isCrash ? 'danger' : 'success'}>
             {isCrash ? '❌ TIDAK AMAN' : '✅ AMAN'}
           </span>
         </div>
         <button onClick={() => setIsMinimized(!isMinimized)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', padding: '4px' }}>
           {isMinimized ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
         </button>
      </div>

      {!isMinimized && (
        <div className="hud-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
          <div className="hud-metrics">
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '12px' }}>
              <span className="hud-title">Min Radius Fisik</span>
              <span className="hud-value">{physicalRadius.toFixed(1)} m</span>
            </div>
            
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '12px' }}>
              <span className="hud-title">Lebar Sapuan Bodi</span>
              <span className="hud-value">{sweptPath.toFixed(1)} m</span>
            </div>
          </div>
          
          <div className={`hud-description ${isCrash ? 'hud-desc-danger' : ''}`}>
            <strong>Analisis ART-Vis:</strong> Kereta <b>{config.carriages} gerbong</b> (panjang {config.length}m × lebar {config.width}m) membutuhkan radius putar minimal <b>{minRequiredRadius.toFixed(1)}m</b> secara fisik. Saat berbelok di radius {targetRadius}m, bodi kereta menyapu area selebar <b>{sweptPath.toFixed(1)}m</b> (dari radius {rInner.toFixed(1)}m sampai {rOuter.toFixed(1)}m).
            <br/><br/>
            Kondisi jalan: Total lebar {totalRoadWidth.toFixed(1)}m ({config.lanesPerDirection} lajur per arah @ {laneWidth.toFixed(1)}m). Kereta beroperasi di lajur paling kanan (mepet median). Pembatas median di {medianRadius.toFixed(1)}m, batas lajur ART di {trainLaneOuterRadius.toFixed(1)}m.
            <br/><br/>
            {crashReasons.length > 0 
              ? <><strong className="danger">Masalah:</strong><ul style={{margin: '4px 0 0 16px'}}>{crashReasons.map((r, i) => <li key={i}>{r}</li>)}</ul></>
              : <strong className="success">✅ AMAN: Bodi kereta aman di dalam lajur eksklusif ART tanpa mengenai median maupun lajur mobil biasa.</strong>
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardHUD;
