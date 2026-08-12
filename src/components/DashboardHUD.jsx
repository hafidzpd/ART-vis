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
          <div className="hud-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px' }}>
              <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Radius Putar Digunakan</span>
              <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>{targetRadius.toFixed(1)} m</span>
            </div>
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px' }}>
              <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Min Radius Fisik</span>
              <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>{physicalRadius.toFixed(1)} m</span>
            </div>
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px' }}>
              <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Lebar Perempatan Total</span>
              <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>{(totalRoadWidth + (config.intersectionMargin || 0)*2).toFixed(1)} m</span>
            </div>
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px', borderLeft: '3px solid #3b82f6' }}>
              <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Radius Dalam (rInner)</span>
              <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>{rInner.toFixed(1)} m</span>
            </div>
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px', borderLeft: '3px solid #ef4444' }}>
              <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Radius Luar (rOuter)</span>
              <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>{rOuter.toFixed(1)} m</span>
            </div>
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px' }}>
              <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Lebar Sapuan</span>
              <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>{(rOuter - rInner).toFixed(1)} m</span>
            </div>
          </div>
          
          <div className={`hud-description ${isCrash ? 'hud-desc-danger' : ''}`}>
            <strong>Analisis ART-Vis:</strong> Kereta <b>{config.carriages} gerbong</b> (panjang {config.length}m × lebar {config.width}m) membutuhkan radius putar minimal <b>{minRequiredRadius.toFixed(1)}m</b> secara fisik. Saat berbelok di radius {targetRadius}m, lebar sapuan bodi kereta menjadi <b>{sweptPath.toFixed(1)}m</b> (terhitung dari jarak terdalam {rInner.toFixed(1)}m hingga terluar {rOuter.toFixed(1)}m dari titik pusat belokan).
            <br/><br/>
            Kondisi jalan: Total lebar {totalRoadWidth.toFixed(1)}m ({config.lanesPerDirection} lajur per arah @ {laneWidth.toFixed(1)}m). Lebar tambahan perempatan: {(config.intersectionMargin || 0).toFixed(1)}m. Kereta bermanuver dari jalur terdalam (dekat median).
            <br/><br/>
            {crashReasons.length > 0 
              ? <><strong className="danger">Masalah Terdeteksi:</strong><ul style={{margin: '4px 0 0 16px'}}>{crashReasons.map((r, i) => <li key={i}>{r}</li>)}</ul></>
              : <strong className="success">✅ AMAN: Kereta berhasil bermanuver di dalam persimpangan tanpa menyenggol trotoar maupun median jalan.</strong>
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardHUD;
