import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const DashboardHUD = ({
  physicalRadius,
  sweptPath,
  config,
  rInner,
  rOuter,
  simState,
  canSimulate,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  const isSimulating = simState.progress > 0;
  const isSafe = simState.finished && !simState.hasCollision;
  const isDanger = simState.hasCollision;

  // Determine status display
  let statusText = '⏳ Menunggu';
  let statusClass = '';
  if (!canSimulate) {
    statusText = '📍 Trace path kereta terlebih dahulu (min. 2 titik)';
    statusClass = '';
  } else if (!isSimulating) {
    statusText = '▶ Tekan Play untuk Simulasi';
    statusClass = '';
  } else if (simState.finished && isSafe) {
    statusText = '✅ AMAN';
    statusClass = 'success';
  } else if (isDanger) {
    statusText = '❌ TIDAK AMAN';
    statusClass = 'danger';
  } else {
    statusText = '🔄 Simulasi Berjalan...';
    statusClass = '';
  }

  return (
    <div className={`hud-container glass-panel ${isMinimized ? 'minimized' : ''}`}>
      <div className="hud-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Status: </span>
          <span className={statusClass}>{statusText}</span>
        </div>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', padding: '4px' }}
        >
          {isMinimized ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        </button>
      </div>

      {!isMinimized && (
        <div className="hud-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
          {/* Progress bar */}
          {canSimulate && isSimulating && (
            <div className="hud-progress">
              <div className="hud-progress-bar" style={{
                width: `${(simState.progress * 100).toFixed(1)}%`,
                background: isDanger
                  ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                  : 'linear-gradient(90deg, #3b82f6, #22c55e)',
              }} />
              <span className="hud-progress-text">
                {(simState.progress * 100).toFixed(0)}%
              </span>
            </div>
          )}

          {/* Metrics */}
          <div className="hud-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px' }}>
              <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Min Radius Fisik</span>
              <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>
                {physicalRadius === Infinity ? '∞' : `${physicalRadius.toFixed(1)} m`}
              </span>
            </div>
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px', borderLeft: '3px solid #3b82f6' }}>
              <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Radius Dalam</span>
              <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>
                {rInner.toFixed(1)} m
              </span>
            </div>
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px', borderLeft: '3px solid #ef4444' }}>
              <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Radius Luar</span>
              <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>
                {rOuter.toFixed(1)} m
              </span>
            </div>
            <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px' }}>
              <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Lebar Sapuan</span>
              <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>
                {sweptPath.toFixed(1)} m
              </span>
            </div>
            {isSimulating && (
              <div className="hud-card" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px' }}>
                <span className="hud-title" style={{ fontSize: '11px', color: '#94a3b8' }}>Jarak Tempuh</span>
                <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold' }}>
                  {simState.distance.toFixed(0)} m
                </span>
              </div>
            )}
            {isDanger && (
              <div className="hud-card" style={{ background: 'rgba(239,68,68,0.1)', borderRadius: '8px', padding: '10px', borderLeft: '3px solid #ef4444' }}>
                <span className="hud-title" style={{ fontSize: '11px', color: '#fca5a5' }}>Titik Tabrakan</span>
                <span className="hud-value" style={{ display: 'block', fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>
                  {simState.collisionCount}
                </span>
              </div>
            )}
          </div>

          {/* Analysis Text */}
          <div className={`hud-description ${isDanger ? 'hud-desc-danger' : ''}`}>
            <strong>Analisis ART-Vis:</strong> Kereta <b>{config.carriages} gerbong</b> (panjang {config.length}m × lebar {config.width}m)
            membutuhkan lebar sapuan <b>{sweptPath.toFixed(1)}m</b> saat berbelok (dari jarak terdalam {rInner.toFixed(1)}m
            hingga terluar {rOuter.toFixed(1)}m dari titik pusat belokan).
            <br /><br />
            {!canSimulate ? (
              <span style={{ color: '#94a3b8' }}>
                Gunakan Developer Mode untuk trace batas jalan dan path kereta di atas gambar peta, lalu tekan Play untuk mulai validasi.
              </span>
            ) : simState.finished ? (
              isDanger ? (
                <strong className="danger">
                  ❌ TIDAK AMAN: Bodi kereta menyentuh batas tepi jalan di beberapa titik.
                  Pertimbangkan untuk memperkecil dimensi kereta atau memperlebar batas jalan.
                </strong>
              ) : (
                <strong className="success">
                  ✅ AMAN: Kereta berhasil melewati seluruh rute tanpa menyentuh batas tepi jalan.
                </strong>
              )
            ) : isSimulating ? (
              <span>
                Simulasi sedang berjalan... Jarak tempuh: <b>{simState.distance.toFixed(0)}m</b>
                {simState.hasCollision && (
                  <span className="danger"> — Tabrakan terdeteksi!</span>
                )}
              </span>
            ) : (
              <span style={{ color: '#94a3b8' }}>
                Path kereta siap. Tekan ▶ untuk mulai simulasi.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardHUD;
