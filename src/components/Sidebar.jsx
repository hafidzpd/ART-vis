import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';

const Sidebar = ({ config, setConfig, onAutoRecommend }) => {
  const [chatInput, setChatInput] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig((prev) => ({ ...prev, [name]: parseFloat(value) }));
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    const text = chatInput.toLowerCase();
    
    let newConfig = { ...config };
    
    // Parse gerbong (carriages)
    const gerbongMatch = text.match(/(\d+)\s*gerbong/);
    if (gerbongMatch) {
      const val = parseInt(gerbongMatch[1]);
      if (val >= 3 && val <= 5) newConfig.carriages = val;
    }

    // Parse kecepatan (speed)
    const speedMatch = text.match(/kecepatan\s*(\d+)/) || text.match(/(\d+)\s*km\/jam/);
    if (speedMatch) {
      const val = parseInt(speedMatch[1]);
      if (val >= 5 && val <= 70) newConfig.speed = val;
    }

    // Parse radius
    const radiusMatch = text.match(/radius\s*(\d+)/) || text.match(/(\d+)\s*meter/);
    if (radiusMatch) {
      const val = parseInt(radiusMatch[1]);
      if (val >= 10 && val <= 100) newConfig.targetRadius = val;
    }
    
    // Parse lebar jalan (road width)
    const lanesMatch = text.match(/(\d+)\s*lajur/);
    if (lanesMatch) {
      const val = parseInt(lanesMatch[1]);
      if (val >= 2 && val <= 5) newConfig.lanesPerDirection = val;
    }

    // Parse layout
    if (text.includes('perempatan')) {
      newConfig.layoutType = 'intersection';
    } else if (text.includes('belokan') || text.includes('tikungan')) {
      newConfig.layoutType = 'curve';
    }

    setConfig(newConfig);
    setChatInput('');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>ART-Vis</h1>
        <p>Simulator Dimensi & Fisika Autonomous Rail Transit</p>
      </div>

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
            <span>Sudut Belok Maksimal (derajat)</span>
            <span className="value">{config.maxSteeringAngle}</span>
          </label>
          <input 
            type="range" name="maxSteeringAngle" 
            min="15" max="45" step="1" 
            value={config.maxSteeringAngle} onChange={handleChange} 
          />
        </div>
      </div>

      <div className="control-group">
        <h3>Dinamika & Lingkungan</h3>
        
        <div className="input-field" style={{ flexDirection: 'row', gap: '16px', alignItems: 'center' }}>
           <label style={{ flex: 1, color: 'white', fontWeight: 600 }}>Tipe Jalan:</label>
           <select 
             name="layoutType" 
             value={config.layoutType} 
             onChange={(e) => setConfig(prev => ({ ...prev, layoutType: e.target.value }))}
             style={{ flex: 2, padding: '8px', borderRadius: '4px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
           >
             <option value="intersection">Perempatan</option>
             <option value="curve">Belokan Biasa</option>
           </select>
        </div>

        <div className="input-field">
          <label>
            <span>Jumlah Lajur (Per Arah)</span>
            <span className="value">{config.lanesPerDirection}</span>
          </label>
          <input 
            type="range" name="lanesPerDirection" 
            min="2" max="5" step="1" 
            value={config.lanesPerDirection} onChange={handleChange} 
          />
        </div>

        <div className="input-field">
          <label>
            <span>Lebar per Lajur (m)</span>
            <span className="value">{config.laneWidth}</span>
          </label>
          <input 
            type="range" name="laneWidth" 
            min="2.5" max="6.0" step="0.1" 
            value={config.laneWidth} onChange={handleChange} 
          />
        </div>

        <div className="input-field">
          <label>
            <span>Luas Ekstra Perempatan (m)</span>
            <span className="value">{config.intersectionMargin}</span>
          </label>
          <input 
            type="range" name="intersectionMargin" 
            min="0" max="50" step="1" 
            value={config.intersectionMargin} onChange={handleChange} 
          />
        </div>

        <div className="input-field">
          <label>
            <span>Target Radius Jalan (m)</span>
            <span className="value">{config.targetRadius}</span>
          </label>
          <input 
            type="range" name="targetRadius" 
            min="10" max="100" step="1" 
            value={config.targetRadius} onChange={handleChange} 
          />
          <button 
            type="button" 
            onClick={onAutoRecommend}
            style={{ marginTop: '8px', padding: '8px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', transition: 'background 0.2s' }}
            onMouseOver={(e) => e.target.style.background = 'var(--accent-hover)'}
            onMouseOut={(e) => e.target.style.background = 'var(--accent-primary)'}
          >
            ✨ Auto Rekomendasi Radius
          </button>
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

        <div className="control-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
            <input 
              type="checkbox" 
              checked={config.showCars} 
              onChange={(e) => setConfig({ ...config, showCars: e.target.checked })}
              style={{ width: '16px', height: '16px' }}
            />
            Tampilkan Mobil (Skala)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
            <input 
              type="checkbox" 
              checked={config.showSecondTrain} 
              onChange={(e) => setConfig({ ...config, showSecondTrain: e.target.checked })}
              style={{ width: '16px', height: '16px' }}
            />
            Simulasi 2 Kereta (Berlawanan)
          </label>
        </div>
      </div>

      <div className="control-group chatbot-group">
        <h3><MessageSquare size={16} /> Perintah AI</h3>
        <form onSubmit={handleChatSubmit}>
          <input 
            type="text" 
            className="chatbot-input"
            placeholder="Coba: 'buat 4 gerbong dengan radius 50 meter'"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
        </form>
      </div>
    </div>
  );
};

export default Sidebar;
