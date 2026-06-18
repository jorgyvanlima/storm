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
  const [telemetry, setTelemetry] = useState(null);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [preset, setPreset] = useState('dry'); // dry, moderate, storm
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const terminalEndRef = useRef(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Connect WebSockets
  useEffect(() => {
    const connectWS = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In production, Vite is served by Nginx on port 8080, and proxies to backend
      const host = window.location.host; 
      const wsUrl = `${protocol}//${host}/ws`;
      
      console.log(`Connecting to WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log("WebSocket connection established");
        addLogItem("LOG-INFO", "Conectado ao canal de dados em tempo real (WebSockets)");
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'init') {
            setTelemetry(payload.data);
          } else if (payload.type === 'telemetry') {
            setTelemetry(payload.data);
            setHistory(prev => [payload.data, ...prev.slice(0, 19)]);
            
            // Format dynamic logs for UI console based on telemetry contents
            const t = payload.data;
            addLogItem("LOG-IOT", `IoT Telemetria Recebida: Temp=${t.temperature}°C, Umid=${t.humidity}%, Chuva=${t.precipitation}mm, Pressão=${t.pressure}hPa`);
            addLogItem("LOG-DB", `Banco de Dados: Registro climático salvo em PostgreSQL.`);
            addLogItem("LOG-IA", `Inteligência Artificial: KMeans predisse nível climático: ${t.risk_level.toUpperCase()}`);
            
            // Check if any neighborhood is flooding
            let flooding = [];
            if (t.neighborhoods_status) {
              Object.entries(t.neighborhoods_status).forEach(([name, statusObj]) => {
                if (statusObj.status === 'Alagamento Iminente') {
                  flooding.push(name);
                }
              });
            }
            if (flooding.length > 0) {
              addLogItem("LOG-ALERT", `ALERTA DE ALAGAMENTO! Risco crítico de transbordo nas seguintes regiões: ${flooding.join(', ')}`);
            }
          }
        } catch (e) {
          console.error("Error parsing WS data", e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log("WebSocket connection closed. Retrying in 3s...");
        addLogItem("LOG-INFO", "Conexão com servidor perdida. Tentando reconectar...");
        setTimeout(connectWS, 3000);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
      };
    };

    connectWS();

    // Fetch initial HTTP logs and history
    const fetchInitData = async () => {
      try {
        const resHistory = await fetch('/api/telemetry');
        if (resHistory.ok) {
          const dataHistory = await resHistory.json();
          setHistory(dataHistory);
          if (dataHistory.length > 0 && !telemetry) {
            setTelemetry(dataHistory[0]);
          }
        }
        
        const resLogs = await fetch('/api/logs');
        if (resLogs.ok) {
          const dataLogs = await resLogs.json();
          // Map backend strings to console format
          const formatted = dataLogs.map(line => {
            let type = "LOG-INFO";
            if (line.includes("Prediction")) type = "LOG-IA";
            if (line.includes("Stored")) type = "LOG-DB";
            if (line.includes("MQTT Message")) type = "LOG-IOT";
            if (line.includes("WARNING") || line.includes("ALERT")) type = "LOG-ALERT";
            return { type, text: line };
          });
          setLogs(formatted);
        }
      } catch (e) {
        console.warn("Could not fetch HTTP initial endpoints. Waiting for WebSocket updates.");
      }
    };

    fetchInitData();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const addLogItem = (type, text) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { type, text: `[${timestamp}] ${text}` }].slice(-100));
  };

  // Trigger preset changes
  const changePreset = async (newPreset) => {
    setPreset(newPreset);
    addLogItem("LOG-INFO", `Enviando comando de clima: ${newPreset.toUpperCase()}`);
    
    // Send via WebSocket if open
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'change_preset',
        preset: newPreset
      }));
    } else {
      // Fallback to REST API
      try {
        await fetch('/api/simulator/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preset: newPreset })
        });
      } catch (e) {
        console.error("Failed to change preset via REST API:", e);
      }
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

  const getGlobalRisk = () => {
    if (!telemetry) return 'Carregando...';
    return telemetry.risk_level || 'Indefinido';
  };

  const getBadgeClass = (risk) => {
    const r = (risk || '').toLowerCase();
    if (r === 'baixo') return 'status-baixo';
    if (r === 'moderado') return 'status-moderado';
    if (r === 'alto') return 'status-alto';
    return 'status-baixo';
  };

  const isStorming = getGlobalRisk().toLowerCase() === 'alto';

  return (
    <>
      {/* Background lightning simulation layer */}
      <div className={`lightning-bg ${isStorming ? 'lightning-storm-active' : ''}`} />
      
      <div className="app-container">
        
        {/* Dynamic Storm-Themed Header */}
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
            {/* Connection Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#cbd5e1' }}>
              <span style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isConnected ? '#10b981' : '#ef4444',
                boxShadow: isConnected ? '0 0 10px #10b981' : '0 0 10px #ef4444'
              }} />
              <span>{isConnected ? 'Servidor Conectado' : 'Conectando...'}</span>
            </div>

            {/* Global IA Status */}
            {telemetry && (
              <span className={`status-badge ${getBadgeClass(telemetry.risk_level)}`}>
                {isStorming ? <CloudLightning size={16} /> : <ShieldCheck size={16} />}
                IA Status: {getGlobalRisk()}
              </span>
            )}
          </div>
        </header>

        {/* Dashboard Grid Layout */}
        <div className="dashboard-grid">
          
          {/* Sidebar Area: Simulator controls and Log Console */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Control Panel Card */}
            <div className={`glass-panel ${isStorming ? 'neon-border-red' : 'neon-border-purple'}`}>
              <h3 style={{ marginBottom: '16px', fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} style={{ color: '#a855f7' }} />
                CONTROLE DO SIMULADOR
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#a0aec0', marginBottom: '20px' }}>
                Simule diferentes intensidades de clima na nuvem para treinar e disparar os alertas visuais da IA:
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button 
                  className={`control-btn ${preset === 'dry' ? 'control-btn-active btn-dry' : ''}`}
                  onClick={() => changePreset('dry')}
                >
                  ☀️ Dia Limpo / Seco
                </button>
                <button 
                  className={`control-btn ${preset === 'moderate' ? 'control-btn-active btn-moderate' : ''}`}
                  onClick={() => changePreset('moderate')}
                >
                  🌧️ Chuva Moderada
                </button>
                <button 
                  className={`control-btn ${preset === 'storm' ? 'control-btn-active btn-storm' : ''}`}
                  onClick={() => changePreset('storm')}
                >
                  ⚡ Tempestade Extrema
                </button>
              </div>
            </div>

            {/* Live Terminal Log Card */}
            <div className="glass-panel" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ marginBottom: '12px', fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={16} className={isConnected ? 'animate-spin' : ''} style={{ color: '#06b6d4' }} />
                CONSOLE DE EVENTOS (PIPELINE)
              </h3>
              <div className="terminal-view" style={{ flexGrow: 1 }}>
                {logs.length === 0 ? (
                  <div style={{ color: '#718096', fontStyle: 'italic' }}>Aguardando pacotes de dados...</div>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className={`terminal-line ${getLogClass(log.type)}`}>
                      {log.text}
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          </aside>

          {/* Main Dashboard: Weather Stats & Neighborhood warning cards */}
          <main className="main-content">
            
            {/* Weather Gauges Grid */}
            <div className="stats-grid">
              
              {/* Temp Gauge */}
              <div className="glass-panel glass-panel-hover telemetry-card">
                <div className="icon-wrapper icon-temp">
                  <Thermometer size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#a0aec0', textTransform: 'uppercase' }}>Temperatura</div>
                  <div className="widget-value">{telemetry ? `${telemetry.temperature}°C` : '--'}</div>
                </div>
              </div>

              {/* Humidity Gauge */}
              <div className="glass-panel glass-panel-hover telemetry-card">
                <div className="icon-wrapper icon-humidity">
                  <Droplets size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#a0aec0', textTransform: 'uppercase' }}>Umidade</div>
                  <div className="widget-value">{telemetry ? `${telemetry.humidity}%` : '--'}</div>
                </div>
              </div>

              {/* Precipitation Gauge */}
              <div className="glass-panel glass-panel-hover telemetry-card">
                <div className="icon-wrapper icon-precip">
                  <CloudRain size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#a0aec0', textTransform: 'uppercase' }}>Precipitação</div>
                  <div className="widget-value">{telemetry ? `${telemetry.precipitation} mm` : '--'}</div>
                </div>
              </div>

              {/* Pressure Gauge */}
              <div className="glass-panel glass-panel-hover telemetry-card">
                <div className="icon-wrapper icon-pressure">
                  <Gauge size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#a0aec0', textTransform: 'uppercase' }}>Pressão</div>
                  <div className="widget-value">{telemetry ? `${telemetry.pressure} hPa` : '--'}</div>
                </div>
              </div>

            </div>

            {/* Neighborhood Flood Hazards Grid */}
            <div className="glass-panel" style={{ flexGrow: 1 }}>
              <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={20} style={{ color: isStorming ? '#ef4444' : '#fbbf24' }} />
                MAPA DE RISCO DE ALAGAMENTO (BAIRROS DE BELÉM)
              </h2>

              <div className="neighborhoods-grid">
                {telemetry && telemetry.neighborhoods_status ? (
                  Object.entries(telemetry.neighborhoods_status).map(([name, statusObj]) => {
                    const isCrit = statusObj.status === 'Alagamento Iminente';
                    const isAtt = statusObj.status === 'Atenção';
                    
                    // Dynamic styling for water waves
                    let fillPercent = Math.min(100, (statusObj.water_level / 1.0) * 100);
                    if (statusObj.status === 'Sem Risco' && fillPercent === 0) fillPercent = 5;

                    return (
                      <div 
                        key={name} 
                        className={`glass-panel neighborhood-card ${isCrit ? 'neon-border-red' : ''}`}
                        style={{
                          border: isCrit ? '1px solid rgba(239,68,68,0.4)' : (isAtt ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.05)')
                        }}
                      >
                        {/* Dynamic Wave background */}
                        <div 
                          className={`water-wave ${isCrit ? 'water-wave-active' : ''}`}
                          style={{ 
                            height: `${fillPercent}%`,
                            background: isCrit 
                              ? 'linear-gradient(180deg, rgba(239, 68, 68, 0.25) 0%, rgba(239, 68, 68, 0.45) 100%)' 
                              : (isAtt 
                                  ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.45) 100%)' 
                                  : 'linear-gradient(180deg, rgba(6, 182, 212, 0.15) 0%, rgba(6, 182, 212, 0.35) 100%)'),
                            borderTopColor: isCrit ? '#ef4444' : (isAtt ? '#f59e0b' : '#06b6d4')
                          }} 
                        />

                        {/* Card Content */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                          <div>
                            <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold' }}>{name}</h4>
                            <p style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '2px' }}>
                              Altitude: {statusObj.elevation}m
                            </p>
                          </div>
                          <span style={{ fontSize: '1.2rem' }}>
                            {isCrit ? '🚨' : (isAtt ? '⚠️' : '🟢')}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', marginTop: 'auto' }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: '#a0aec0', textTransform: 'uppercase' }}>Acúmulo</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 'bold', fontFamily: 'Orbitron' }}>
                              {statusObj.water_level}m
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.75rem', color: '#a0aec0', textTransform: 'uppercase' }}>Probabilidade</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isCrit ? '#ef4444' : (isAtt ? '#f59e0b' : '#10b981') }}>
                              {statusObj.probability}%
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#718096', fontStyle: 'italic' }}>
                    Aguardando telemetria inicial do termômetro...
                  </div>
                )}
              </div>
            </div>

          </main>
          
        </div>

        {/* Footer */}
        <footer style={{ marginTop: '48px', textAlign: 'center', fontSize: '0.8rem', color: '#718096', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
          Projeto STORM • 100% Dockerizado • IA baseada em Agrupamento KMeans (sklearn) • Belém, Pará, Brasil.
        </footer>

      </div>
    </>
  );
}

export default App;
