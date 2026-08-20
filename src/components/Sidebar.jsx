import React, { useState } from 'react';
import { Trash2, Undo2, Download, Upload, ChevronDown, ChevronRight } from 'lucide-react';

const Sidebar = ({
  config,
  setConfig,
  simulationSpeed,
  setSimulationSpeed,
  tracingMode,
  setTracingMode,
  pixelsPerMeter,
  boundaries,
  trainPath,
  onUndoPoint,
  onClearAllPoints,
  onExportCoordinates,
  onImportCoordinates,
  onLoadPreset,
}) => {
  const [devModeOpen, setDevModeOpen] = useState(true);
  const [exportText, setExportText] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: parseFloat(value) }));
  };

  const handleSpeedChange = (e) => {
    setSimulationSpeed(parseFloat(e.target.value));
  };

  const handleExport = () => {
    const text = onExportCoordinates();
    setExportText(text);
  };

  const toggleTracingMode = (mode) => {
    setTracingMode(prev => prev === mode ? 'off' : mode);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>ART-Vis</h1>
        <p>Validator Rute Berbasis Citra Satelit — Autonomous Rail Transit</p>
      </div>

      {/* Vehicle Specifications */}
      <div className="control-group">
        <h3>Spesifikasi Kendaraan</h3>

        <div className="input-field">
          <label>
            <span>Jumlah Gerbong (3-5)</span>
            <span className="value">{config.carriages}</span>
          </label>
          <input
            type="range" name="carriages"
            min="3" max="5" step="1"
            value={config.carriages} onChange={handleChange}
          />
        </div>

        <div className="input-field">
          <label>
            <span>Panjang per Gerbong (m)</span>
            <span className="value">{config.length}</span>
          </label>
          <input
            type="range" name="length"
            min="8" max="15" step="0.5"
            value={config.length} onChange={handleChange}
          />
        </div>

        <div className="input-field">
          <label>
            <span>Lebar (m)</span>
            <span className="value">{config.width}</span>
          </label>
          <input
            type="range" name="width"
            min="2.0" max="3.5" step="0.1"
            value={config.width} onChange={handleChange}
          />
        </div>

        <div className="input-field">
          <label>
            <span>Jarak Sumbu Roda / Wheelbase (m)</span>
            <span className="value">{config.wheelbase}</span>
          </label>
          <input
            type="range" name="wheelbase"
            min="4" max="10" step="0.1"
            value={config.wheelbase} onChange={handleChange}
          />
        </div>

        <div className="input-field">
          <label>
            <span>Sudut Belok Maksimal (°)</span>
            <span className="value">{config.maxSteeringAngle}</span>
          </label>
          <input
            type="range" name="maxSteeringAngle"
            min="15" max="45" step="1"
            value={config.maxSteeringAngle} onChange={handleChange}
          />
        </div>

        <div className="input-field">
          <label>
            <span>Jarak Aman / Clearance (m)</span>
            <span className="value">{config.clearance}</span>
          </label>
          <input
            type="range" name="clearance"
            min="0" max="2" step="0.1"
            value={config.clearance} onChange={handleChange}
          />
        </div>
      </div>

      {/* Scale Info (auto from Google Maps zoom) */}
      <div className="control-group">
        <h3>Skala Peta (Otomatis)</h3>
        <div className="input-field">
          <label>
            <span>Resolusi saat ini</span>
            <span className="value">{pixelsPerMeter.toFixed(1)} px/m</span>
          </label>
          <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
            Skala dihitung otomatis dari zoom Google Maps.
            Zoom in untuk presisi lebih tinggi saat tracing.
          </p>
        </div>
      </div>

      {/* Simulation Speed */}
      <div className="control-group">
        <h3>Kecepatan Simulasi</h3>
        <div className="input-field">
          <label>
            <span>Playback Speed (km/h)</span>
            <span className="value">{simulationSpeed}</span>
          </label>
          <input
            type="range"
            min="5" max="80" step="5"
            value={simulationSpeed}
            onChange={handleSpeedChange}
          />
        </div>
      </div>

      {/* Developer Mode — Tracing Tools */}
      <div className="control-group dev-mode-panel">
        <h3
          onClick={() => setDevModeOpen(!devModeOpen)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          {devModeOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          🛠️ Developer Mode
        </h3>

        {devModeOpen && (
          <div className="dev-mode-content">
            <p className="dev-mode-hint">
              Zoom in ke lokasi di Google Maps, lalu klik peta untuk menambah titik.
              Pilih mode di bawah:
            </p>

            {/* Tracing mode toggles */}
            <div className="tracing-buttons">
              <button
                className={`btn-trace ${tracingMode === 'outer' ? 'active' : ''}`}
                onClick={() => toggleTracingMode('outer')}
                style={{ '--trace-color': '#ef4444' }}
              >
                <span className="trace-dot" style={{ background: '#ef4444' }} />
                Batas Luar
                <span className="trace-count">{boundaries.outer.length}</span>
              </button>

              <button
                className={`btn-trace ${tracingMode === 'inner' ? 'active' : ''}`}
                onClick={() => toggleTracingMode('inner')}
                style={{ '--trace-color': '#3b82f6' }}
              >
                <span className="trace-dot" style={{ background: '#3b82f6' }} />
                Batas Dalam
                <span className="trace-count">{boundaries.inner.length}</span>
              </button>

              <button
                className={`btn-trace ${tracingMode === 'path' ? 'active' : ''}`}
                onClick={() => toggleTracingMode('path')}
                style={{ '--trace-color': '#22c55e' }}
              >
                <span className="trace-dot" style={{ background: '#22c55e' }} />
                Path Kereta
                <span className="trace-count">{trainPath.length}</span>
              </button>

              <button
                className={`btn-trace ${tracingMode === 'ruler' ? 'active' : ''}`}
                onClick={() => toggleTracingMode('ruler')}
                style={{ '--trace-color': '#a855f7' }}
                title="Gunakan untuk mengukur jarak dan kalibrasi skala peta"
              >
                <span className="trace-dot" style={{ background: '#a855f7' }} />
                📏 Alat Ukur
              </button>
            </div>

            {/* Action buttons */}
            <div className="trace-actions">
              <button
                className="btn-trace-action"
                onClick={onUndoPoint}
                disabled={tracingMode === 'off'}
                title="Hapus titik terakhir"
              >
                <Undo2 size={14} />
                Undo
              </button>

              <button
                className="btn-trace-action"
                onClick={handleExport}
                title="Export koordinat ke console & textarea"
              >
                <Download size={14} />
                Export
              </button>

              <button
                className="btn-trace-action"
                onClick={onImportCoordinates}
                title="Import koordinat dari kode JSON"
              >
                <Upload size={14} />
                Import
              </button>

              <button
                className="btn-trace-action danger"
                onClick={onClearAllPoints}
                title="Hapus semua titik"
              >
                <Trash2 size={14} />
                Reset
              </button>
            </div>

            {/* Presets */}
            <div className="trace-actions" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="btn-trace-action"
                onClick={() => onLoadPreset('full-route.json')}
                title="Muat Rute Lengkap (Loop 10 Halte)"
                style={{ width: '100%', justifyContent: 'center', background: 'rgba(34, 197, 94, 0.15)', borderColor: 'rgba(34, 197, 94, 0.3)', color: '#86efac' }}
              >
                <Upload size={14} />
                Full Route (Loop 10 Halte)
              </button>
              
              <button
                className="btn-trace-action"
                onClick={() => onLoadPreset('bg-junction.json')}
                title="Muat rute contoh BG Junction (Jl. Blauran - Jl. Praban)"
                style={{ width: '100%', justifyContent: 'center', background: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)', color: '#93c5fd' }}
              >
                <Upload size={14} />
                Contoh: BG Junction
              </button>
            </div>

            {/* Export textarea */}
            {exportText && (
              <textarea
                className="export-textarea"
                readOnly
                value={exportText}
                rows={8}
                onClick={(e) => e.target.select()}
              />
            )}
          </div>
        )}
      </div>

      <div className="control-group" style={{ marginTop: 'auto', opacity: 0.7 }}>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
          <strong>Cara Pakai:</strong> Navigasi Google Maps ke lokasi yang diinginkan,
          zoom in, lalu gunakan Developer Mode untuk trace batas jalan dan path kereta.
          Tekan ▶ untuk menjalankan simulasi.
        </p>
      </div>
    </div>
  );
};

export default Sidebar;
