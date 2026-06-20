import React, { useState, useEffect, useRef } from 'react';
import { 
  Thermometer, 
  Droplets, 
  CloudRain, 
  Gauge, 
  Activity, 
  AlertTriangle, 
  CloudLightning, 
  ShieldCheck, 
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
      "Doca": { ui_name: "Doca", status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 1.2, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 },
      "Jurunas": { ui_name: "Jurunas", status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 1.8, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 },
      "Umarizal": { ui_name: "Umarizal", status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 2.2, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 },
      "CidadeVelha": { ui_name: "Cidade Velha", status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 1.5, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 },
      "BatistaCampos": { ui_name: "Batista Campos", status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 3.5, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 },
      "Marco": { ui_name: "Marco", status: "Sem Risco", water_level: 0.0, probability: 0.0, elevation: 4.2, temperature: 31.5, humidity: 45.0, precipitation: 0.0, pressure: 1014.2 }
    }
  });
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
        addLogItem("LOG-INFO", "Conectado ao canal de dados em tempo real (WebSockets)");
        ws.send(JSON.stringify({ action: 'change_source', source: dataSourceRef.current }));
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'init' || payload.type === 'telemetry') {
            if (dataSourceRef.current === 'sensor' && payload.data.source === 'simulador') return; 

            // ALINHAMENTO COMPATÍVEL: Sincroniza e preserva as chaves PascalCase exatas do DevTools
            setTelemetry(payload.data);
            if (payload.data.source) setDataSource(payload.data.source);
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
            if (line.includes("IoT") || line.includes("Unificada") || line.includes("Recebida")) type = "LOG-IOT";
            if (line.includes("ALERT") || line.includes("ALERTA")) type = "LOG-ALERT";
            return { type, text: line };
          });
          setLogs(formatted);
        }
      } catch (e) {}
    };

    const interval = setInterval(fetchInitData, 2000);
    return () => { if (wsRef.current) wsRef.current.close(); clearInterval(interval); };
  }, []);

  const addLogItem = (type, text) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { type, text: `[${timestamp}] ${text}` }].slice(-100));
  };

  const changePreset = async (newPreset) => {
    setPreset(newPreset);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'change_preset', preset: newPreset }));
    }
  };

  const changeSource = (newSource) => {
    setDataSource(newSource);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'change_source', source: newSource }));
    }
  };

  const getLogClass = (type) => {
    switch (type) {
      case 'LOG-IOT': return 'terminal-line-iot';
      case 'LOG-DB': return 'terminal-line-db';
      case 'LOG-IA': return 'terminal-line-ia';
      case 'LOG-ALERT': return 'terminal-line-alert';
      default: return 'terminal-line-info';
    }
  };

  const sensorBlurStyle = {
    filter: dataSource === 'sensor' ? 'blur(5px)' : 'none',
    transition: 'filter 0.4s ease-in-out'
  };

  return (
    <>
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
            {dataSource === 'simulador' && telemetry && (
              <span className="status-badge">IA Status: {telemetry.risk_level}</span>
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
                <button onClick={() => changeSource('simulador')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', backgroundColor: dataSource === 'simulador' ? 'rgba(168, 85, 247, 0.2)' : 'transparent', color: dataSource === 'simulador' ? '#a855f7' : '#a0aec0' }}>🤖 Simulador</button>
                <button onClick={() => changeSource('sensor')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', backgroundColor: dataSource === 'sensor' ? 'rgba(6, 182, 212, 0.2)' : 'transparent', color: dataSource === 'sensor' ? '#06b6d4' : '#a0aec0' }}>📡 Sensor Real</button>
              </div>
              {dataSource === 'simulador' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button className={`control-btn ${preset === 'dry' ? 'control-btn-active' : ''}`} onClick={() => changePreset('dry')}>☀️ Dia Limpo / Seco</button>
                  <button className={`control-btn ${preset === 'moderate' ? 'control-btn-active' : ''}`} onClick={() => changePreset('moderate')}>🌧️ Chuva Moderada</button>
                  <button className={`control-btn ${preset === 'storm' ? 'control-btn-active' : ''}`} onClick={() => changePreset('storm')}>⚡ Tempestade Extrema</button>
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
              <div className="glass-panel telemetry-card" style={sensorBlurStyle}>
                <div><Thermometer size={24} /> MÉDIA TEMP.</div>
                <div className="widget-value">{telemetry ? `${telemetry.temperature}°C` : '--'}</div>
              </div>
              <div className="glass-panel telemetry-card" style={sensorBlurStyle}>
                <div><Droplets size={24} /> MÉDIA UMID.</div>
                <div className="widget-value">{telemetry ? `${telemetry.humidity}%` : '--'}</div>
              </div>
              <div className="glass-panel telemetry-card" style={sensorBlurStyle}>
                <div><CloudRain size={24} /> PICO CHUVA</div>
                <div className="widget-value">{telemetry ? `${telemetry.precipitation} mm` : '--'}</div>
              </div>
              <div className="glass-panel telemetry-card" style={sensorBlurStyle}>
                <div><Gauge size={24} /> MÉDIA PRESSÃO</div>
                <div className="widget-value">{telemetry ? `${telemetry.pressure} hPa` : '--'}</div>
              </div>
            </div>

            <div className="glass-panel" style={{ flexGrow: 1 }}>
              <h2><AlertTriangle size={20} /> MONITORAMENTO DE TELEMETRIA SETORIAL (BAIRROS)</h2>
              <div className="neighborhoods-grid">
                {telemetry && telemetry.neighborhoods_status ? (
                  Object.entries(telemetry.neighborhoods_status).map(([key, statusObj]) => {
                    const isCrit = statusObj.status === 'Alagamento Iminente';
                    const isAtt = statusObj.status === 'Atenção';
                    let fillPercent = Math.min(100, (statusObj.water_level / 1.0) * 100);

                    // Fallback estético para o ui_name baseado no mapeamento correto do DevTools
                    const uiName = statusObj.ui_name || (key === 'CidadeVelha' ? 'Cidade Velha' : (key === 'BatistaCampos' ? 'Batista Campos' : key));

                    return (
                      <div key={key} className="glass-panel neighborhood-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '260px', position: 'relative', border: isCrit ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="water-wave" style={{ height: `${fillPercent || 5}%`, position: 'absolute', bottom: 0, left: 0, right: 0, background: isCrit ? 'rgba(239, 68, 68, 0.15)' : 'rgba(6, 182, 212, 0.08)', zIndex: 1, transition: 'height 0.5s ease' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', zIndex: 2 }}>
                          <div>
                            <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{uiName}</h4>
                            <p style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Altitude: {statusObj.elevation}m</p>
                          </div>
                          <span>{isCrit ? '🚨' : (isAtt ? '⚠️' : '🟢')}</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', backgroundColor: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px', fontSize: '0.75rem', zIndex: 2, fontFamily: 'monospace' }}>
                          <div>🌡️ T: <strong>{statusObj.temperature}°C</strong></div>
                          <div>💧 U: <strong>{statusObj.humidity}%</strong></div>
                          <div>🌧️ C: <strong>{statusObj.precipitation}mm</strong></div>
                          <div>🌀 P: <strong>{Math.round(statusObj.pressure)}hPa</strong></div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', zIndex: 2 }}>
                          <div>
                            <div style={{ fontSize: '0.7rem', color: '#a0aec0' }}>ACÚMULO</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>{statusObj.water_level}m</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.7rem', color: '#a0aec0' }}>RISCO</div>
                            <div style={{ fontSize: '1rem', fontWeight: 'bold', color: isCrit ? '#ef4444' : '#10b981' }}>{statusObj.probability}%</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: '#a0aec0', fontStyle: 'italic' }}>Carregando malha setorial de Belém...</div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
export default App;
