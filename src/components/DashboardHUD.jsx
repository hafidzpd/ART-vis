import React from 'react';

const DashboardHUD = ({
  physicalRadius,
  sweptPath,
  targetRadius,
  isCrash,
  isRadiusCrash,
  isInnerCrash,
  isOuterCrash,
  isLaneCross,
  config,
  laneWidth,
  rInner,
  rOuter,
  medianRadius,
  trainLaneOuterRadius,
  roadOuterEdgeRadius
}) => {
  const minRequiredRadius = physicalRadius;

  // Build crash reason text
  let crashReasons = [];
  if (isRadiusCrash) {
    if (targetRadius < physicalRadius) crashReasons.push(`Radius ${targetRadius}m lebih kecil dari batas fisik roda (${physicalRadius.toFixed(1)}m)`);
  }
  if (isInnerCrash) crashReasons.push(`Bodi dalam kereta (${rInner.toFixed(1)}m) menabrak pembatas jalan/median (${medianRadius.toFixed(1)}m)`);
  if (isLaneCross && !isOuterCrash) crashReasons.push(`Bodi luar kereta (${rOuter.toFixed(1)}m) keluar dari lajur ART (${trainLaneOuterRadius.toFixed(1)}m) dan memakan lajur kendaraan biasa!`);
  if (isOuterCrash) crashReasons.push(`Bodi luar kereta (${rOuter.toFixed(1)}m) keluar dari trotoar jalan (${roadOuterEdgeRadius.toFixed(1)}m)`);
  
  // Note: we don't have isCenterCross warning anymore because hitting the median is an outright crash.

  const totalRoadWidth = config.lanesPerDirection * laneWidth * 2;

  return (
    <div className="hud-container">
      <div className="hud-metrics">
        <div className="hud-card glass-panel">
          <span className="hud-title">Min Radius Fisik</span>
          <span className="hud-value">{physicalRadius.toFixed(1)} m</span>
        </div>
        
        <div className="hud-card glass-panel">
          <span className="hud-title">Lebar Sapuan Bodi</span>
          <span className="hud-value">{sweptPath.toFixed(1)} m</span>
        </div>

        <div className="hud-card glass-panel">
          <span className="hud-title">Status Kelayakan</span>
          <span className={`hud-value ${isCrash ? 'danger' : 'success'}`}>
            {isCrash ? '❌ TIDAK AMAN' : '✅ AMAN'}
          </span>
        </div>
      </div>
      
      <div className={`hud-description glass-panel ${isCrash ? 'hud-desc-danger' : ''}`}>
        <strong>Analisis ART-Vis:</strong> Kereta <b>{config.carriages} gerbong</b> (panjang {config.length}m × lebar {config.width}m) membutuhkan radius putar minimal <b>{minRequiredRadius.toFixed(1)}m</b> secara fisik. Saat berbelok di radius {targetRadius}m, bodi kereta menyapu area selebar <b>{sweptPath.toFixed(1)}m</b> (dari radius {rInner.toFixed(1)}m sampai {rOuter.toFixed(1)}m).
        <br/><br/>
        Kondisi jalan: Total lebar {totalRoadWidth}m ({config.lanesPerDirection} lajur per arah @ {laneWidth.toFixed(1)}m). Kereta beroperasi di lajur paling kanan (mepet median). Pembatas median di {medianRadius.toFixed(1)}m, batas lajur ART di {trainLaneOuterRadius.toFixed(1)}m.
        <br/><br/>
        {crashReasons.length > 0 
          ? <><strong className="danger">Masalah:</strong><ul style={{margin: '4px 0 0 16px'}}>{crashReasons.map((r, i) => <li key={i}>{r}</li>)}</ul></>
          : <strong className="success">✅ AMAN: Bodi kereta aman di dalam lajur eksklusif ART tanpa mengenai median maupun lajur mobil biasa.</strong>
        }
      </div>
    </div>
  );
};

export default DashboardHUD;
