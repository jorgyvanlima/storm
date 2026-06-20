import React, { useState, useEffect, useRef } from 'react';
import { 
  Thermometer, 
  Droplets, 
  CloudRain, 
  Gauge, 
  Activity, 
  AlertTriangle, 
  RefreshCw 
} from 'lucide-react';

function App() {
  const [telemetry, setTelemetry] = useState({
    temperature: 31.5,
    humidity: 45.0,
    precipitation: 0.0,
    pressure: 1014.2,
    source: 'simulador',
    risk_level: 'BAIXO',
    neighborhoods_status: {
      "Doca de Souza Franco": { status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 1.2, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 },
      "Jurunas": { status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 1.8, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 },
      "Umarizal": { status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 2.2, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 },
      "Cidade Velha": { status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 1.5, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 },
      "Batista Campos": { status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 3.5, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 },
      "Marco": { status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 4.2, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 }
    }
  });
  
  const [activePanel, setActivePanel] = useState('simulacao'); 
  const [logs, setLogs] = useState([]);
  const [preset, setPreset] = useState('dry'); 
  const [dataSource, setDataSource] = useState('simulador'); 
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const terminalRef = useRef(null);

  const dataSourceRef = useRef(dataSource);
  useEffect(() => { dataSourceRef.current = dataSource; }, [dataSource]);

  useEffect(() => {
    const connectWS = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host; 
      const wsUrl = `${protocol}//${host}/ws`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({ action: 'change_source', source: dataSourceRef.current }));
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'init' || payload.type === 'telemetry') {
            setTelemetry(payload.data);
            if (payload.data.source) {
              setDataSource(payload.data.source);
              setActivePanel(payload.data.source === 'sensor' ? 'iot' : 'simulacao');
            }
          }
        } catch (e) { console.error("WS error", e); }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(connectWS, 3000);
      };
    };

    connectWS();

    const fetchInitData = async () => {
      try {
        const resLogs = await fetch('/api/logs');
        if (resLogs.ok) {
          const dataLogs = await resLogs.json();
          const formatted = dataLogs.map(line => {
            let type = "LOG-INFO";
            if (line.includes("Prediction") || line.includes("AI")) type = "LOG-IA";
            if (line.includes("Stored") || line.includes("PostgreSQL")) type = "LOG-DB";
            if (line.includes("IoT") || line.includes("Recebida")) type = "LOG-IOT";
            return { type, text: line };
          });
          setLogs(formatted);
        }
      } catch (e) {}
    };

    const interval = setInterval(fetchInitData, 1500);
    return () => { if (wsRef.current) wsRef.current.close(); clearInterval(interval); };
  }, []);

  const changePreset = async (newPreset) => {
    setPreset(newPreset);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'change_preset', preset: newPreset }));
    }
  };

  const changeSource = (newSource) => {
    setDataSource(newSource);
    setActivePanel(newSource === 'sensor' ? 'iot' : 'simulacao');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'change_source', source: newSource }));
    }
  };

  const getLogClass = (type) => {
    switch (type) {
      case 'LOG-IOT': return 'terminal-line-iot';
      case 'LOG-DB': return 'terminal-line-db';
      case 'LOG-IA': return 'terminal-line-ia';
      default: return 'terminal-line-info';
    }
  };

  const getRiskBadgeStyle = (level) => {
    const lvl = level ? level.toUpperCase() : 'BAIXO';
    if (lvl === 'ALTO') {
      return { backgroundColor: 'rgba(239, 68, 68, 0.25)', color: '#ef4444', border: '1px solid #ef4444' };
    }
    if (lvl === 'MODERADO') {
      return { backgroundColor: 'rgba(249, 115, 22, 0.25)', color: '#f97316', border: '1px solid #f97316' };
    }
    return { backgroundColor: 'rgba(16, 185, 129, 0.25)', color: '#10b981', border: '1px solid #10b981' };
  };

  const getNeighborhoodStatusStyle = (status) => {
    if (status === 'Alagamento Iminente') {
      return { backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171' };
    }
    if (status === 'Atenção') {
      return { backgroundColor: 'rgba(249, 115, 22, 0.2)', color: '#ffa657' };
    }
    return { backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399' };
  };

  const getNeighborhoodCardStyle = (status) => {
    if (status === 'Alagamento Iminente') {
      return { border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.02)' };
    }
    if (status === 'Atenção') {
      return { border: '1px solid #f97316', background: 'rgba(249, 115, 22, 0.02)' };
    }
    return { border: '1px solid rgba(255,255,255,0.05)' };
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-title-container">
          <span className="header-logo">⚡</span>
          <div>
            <h1 className="storm-logo-text">PROJECT STORM</h1>
            <p style={{ fontSize: '0.85rem', color: '#a0aec0', marginTop: '2px' }}>
              Sistema Inteligente de Alerta e Telemetria Climática • Belém-PA
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#cbd5e1' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isConnected ? '#10b981' : '#ef4444' }} />
            <span>{isConnected ? 'Servidor Conectado' : 'Conectando...'}</span>
          </div>
          
          {dataSource === 'simulador' && (
            <span className="status-badge" style={{ ...getRiskBadgeStyle(telemetry.risk_level), fontWeight: 'bold', textShadow: 'none' }}>
              IA Status: {telemetry.risk_level}
            </span>
          )}
        </div>
      </header>

      <div className="dashboard-grid">
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel">
            <h3 style={{ marginBottom: '16px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} /> MODO DE OPERAÇÃO
            </h3>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button onClick={() => changeSource('simulador')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', backgroundColor: dataSource === 'simulador' ? 'rgba(168, 85, 247, 0.2)' : 'transparent', color: dataSource === 'simulador' ? '#a855f7' : '#a0aec0', fontWeight: 'bold', cursor: 'pointer' }}>🤖 Simulador</button>
              <button onClick={() => changeSource('sensor')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', backgroundColor: dataSource === 'sensor' ? 'rgba(6, 182, 212, 0.2)' : 'transparent', color: dataSource === 'sensor' ? '#06b6d4' : '#a0aec0', fontWeight: 'bold', cursor: 'pointer' }}>📡 Sensor Real</button>
            </div>
            {dataSource === 'simulador' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button 
                  className={`control-btn ${preset === 'dry' ? 'control-btn-active' : ''}`} 
                  onClick={() => changePreset('dry')}
                  style={preset === 'dry' ? { backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981', borderColor: '#10b981' } : {}}
                >
                  ☀️ Dia Limpo / Seco
                </button>
                <button 
                  className={`control-btn ${preset === 'moderate' ? 'control-btn-active' : ''}`} 
                  onClick={() => changePreset('moderate')}
                  style={preset === 'moderate' ? { backgroundColor: 'rgba(249, 115, 22, 0.2)', color: '#f97316', borderColor: '#f97316' } : {}}
                >
                  🌧️ Chuva Moderada
                </button>
                <button 
                  className={`control-btn ${preset === 'storm' ? 'control-btn-active btn-storm' : ''}`} 
                  onClick={() => changePreset('storm')}
                  style={preset === 'storm' ? { backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', borderColor: '#ef4444' } : {}}
                >
                  ⚡ Tempestade Extrema
                </button>
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <h3><RefreshCw size={16} /> CONSOLE DE EVENTOS</h3>
            <div className="terminal-view" ref={terminalRef} style={{ flexGrow: 1, minHeight: '300px' }}>
              {logs.map((log, idx) => (
                <div key={idx} className={`terminal-line ${getLogClass(log.type)}`}>{log.text}</div>
              ))}
            </div>
          </div>
        </aside>

        <main className="main-content">
          <div className="stats-grid">
            <div className="glass-panel telemetry-card">
              <div><Thermometer size={24} /> {dataSource === 'sensor' ? 'MÉDIA MALHA' : 'TEMP. AMBIENTE'}</div>
              <div className="widget-value">{telemetry ? `${telemetry.temperature}°C` : '--'}</div>
            </div>
            <div className="glass-panel telemetry-card">
              <div><Droplets size={24} /> {dataSource === 'sensor' ? 'MÉDIA MALHA' : 'UMIDADE REL.'}</div>
              <div className="widget-value">{telemetry ? `${telemetry.humidity}%` : '--'}</div>
            </div>
            <div className="glass-panel telemetry-card">
              <div><CloudRain size={24} /> PICO CHUVA</div>
              <div className="widget-value">{telemetry ? `${telemetry.precipitation} mm` : '--'}</div>
            </div>
            <div className="glass-panel telemetry-card">
              <div><Gauge size={24} /> MÉDIA PRESSÃO</div>
              <div className="widget-value">{telemetry ? `${telemetry.pressure} hPa` : '--'}</div>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }} />

          {activePanel === 'simulacao' && (
            <div className="glass-panel" style={{ flexGrow: 1 }}>
              <h2><AlertTriangle size={20} /> ALAGAMENTO IMINENTE POR BAIRRO</h2>
              <div className="neighborhoods-grid">
                {telemetry && telemetry.neighborhoods_status && Object.entries(telemetry.neighborhoods_status).map(([key, statusObj]) => {
                  const isCrit = statusObj.status === 'Alagamento Iminente';
                  const isWarn = statusObj.status === 'Atenção';
                  let fillPercent = Math.min(100, (statusObj.water_level / 1.0) * 100);

                  return (
                    <div 
                      key={key} 
                      className="glass-panel neighborhood-card" 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '12px', 
                        minHeight: '220px', 
                        position: 'relative', 
                        ...getNeighborhoodCardStyle(statusObj.status) 
                      }}
                    >
                      <div 
                        className="water-wave" 
                        style={{ 
                          height: `${fillPercent || 5}%`, 
                          position: 'absolute', 
                          bottom: 0, 
                          left: 0, 
                          right: 0, 
                          background: isCrit ? 'rgba(239, 68, 68, 0.15)' : (isWarn ? 'rgba(249, 115, 22, 0.12)' : 'rgba(6, 182, 212, 0.08)'), 
                          zIndex: 1 
                        }} 
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', zIndex: 2 }}>
                        <div>
                          <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{key}</h4>
                          <p style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Altitude: {statusObj.elevation}m</p>
                        </div>
                        <span className="status-dot" style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', ...getNeighborhoodStatusStyle(statusObj.status) }}>{statusObj.status}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', zIndex: 2 }}>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: '#a0aec0' }}>NÍVEL DA ÁGUA</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>{statusObj.water_level}m</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.7rem', color: '#a0aec0' }}>PROBABILIDADE</div>
                          <div style={{ fontSize: '1rem', fontWeight: 'bold', color: isCrit ? '#ef4444' : (isWarn ? '#f97316' : '#10b981') }}>{statusObj.probability}%</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activePanel === 'iot' && (
            <div className="glass-panel" style={{ flexGrow: 1, borderColor: '#06b6d4' }}>
              <h2 style={{ color: '#22d3ee' }}><Activity size={20} /> LEITURAS EM TEMPO REAL POR SENSOR INDIVIDUAL</h2>
              <div className="neighborhoods-grid">
                {telemetry && telemetry.neighborhoods_status && Object.entries(telemetry.neighborhoods_status).map(([key, statusObj]) => {
                  return (
                    <div 
                      key={key} 
                      className="glass-panel neighborhood-card" 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '14px', 
                        minHeight: '220px',
                        ...getNeighborhoodCardStyle(statusObj.status)
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#22d3ee' }}>{key}</h4>
                          {/* 🛑 AJUSTE SOLICITADO: Altitude adicionada explicitamente nos cards do modo sensor */}
                          <p style={{ fontSize: '0.75rem', color: '#cbd5e1', margin: '2px 0' }}>Altitude: {statusObj.elevation}m</p>
                          <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Módulo I2C LCD + DHT22</p>
                        </div>
                        <span className="status-dot" style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', ...getNeighborhoodStatusStyle(statusObj.status) }}>
                          {statusObj.status}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                        <div style={{ color: '#f87171' }}>Temp: <span style={{ color: '#fff', fontWeight: 'bold' }}>{statusObj.temperature ? statusObj.temperature.toFixed(1) : '31.5'}°C</span></div>
                        <div style={{ color: '#60a5fa' }}>Umid: <span style={{ color: '#fff', fontWeight: 'bold' }}>{statusObj.humidity ? statusObj.humidity.toFixed(1) : '45.0'}%</span></div>
                        <div style={{ color: '#c084fc' }}>Chuva: <span style={{ color: '#fff', fontWeight: 'bold' }}>{statusObj.precipitation ? statusObj.precipitation.toFixed(1) : '0.0'}mm</span></div>
                        <div style={{ color: '#fb923c' }}>Pres: <span style={{ color: '#fff', fontWeight: 'bold' }}>{statusObj.pressure ? statusObj.pressure.toFixed(1) : '1014.2'}hPa</span></div>
                      </div>

                      <div style={{ marginTop: 'auto', fontSize: '0.72rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Origem: {telemetry.source.toUpperCase()}</span>
                        <span style={{ color: '#4ade80' }}>● Sincronizado</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
export default App;
