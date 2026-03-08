import React, { useState, useEffect, useRef, useCallback } from 'react';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [zones, setZones] = useState(() => JSON.parse(localStorage.getItem('zones') || '[]'));
  const [ships, setShips] = useState(() => JSON.parse(localStorage.getItem('ships') || '[]'));
  const [apiKeys, setApiKeys] = useState(() => JSON.parse(localStorage.getItem('apiKeys') || '[]'));
  const [alerts, setAlerts] = useState(() => {
    try {
      const saved = localStorage.getItem('alerts') || '[]';
      return JSON.parse(saved).map(a => ({ ...a, timestamp: new Date(a.timestamp) }));
    } catch {
      return [];
    }
  });
  const [newZone, setNewZone] = useState({ name: '', lat: '', lng: '', radius: '' });
  const [newShip, setNewShip] = useState({ name: '', imo: '', mmsi: '' });
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('email') || '');
  const [debugLog, setDebugLog] = useState([]);
  const [dataUsage, setDataUsage] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dataUsage') || '{"mb":0}');
    } catch {
      return { mb: 0 };
    }
  });

  const processedAlertsRef = useRef(new Set());
  const lastFetchRef = useRef(0);

  useEffect(() => {
    localStorage.setItem('zones', JSON.stringify(zones));
  }, [zones]);

  useEffect(() => {
    localStorage.setItem('ships', JSON.stringify(ships));
  }, [ships]);

  useEffect(() => {
    localStorage.setItem('apiKeys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    localStorage.setItem('alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem('email', userEmail);
  }, [userEmail]);

  useEffect(() => {
    localStorage.setItem('dataUsage', JSON.stringify(dataUsage));
  }, [dataUsage]);

  const addDebugLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setDebugLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
    console.log(`[${time}] ${msg}`);
  };

  const addZone = () => {
    if (newZone.name && newZone.lat && newZone.lng && newZone.radius) {
      setZones([...zones, {
        id: Date.now(),
        name: newZone.name,
        lat: parseFloat(newZone.lat),
        lng: parseFloat(newZone.lng),
        radius: parseFloat(newZone.radius)
      }]);
      setNewZone({ name: '', lat: '', lng: '', radius: '' });
      addDebugLog(`✅ Zone added: ${newZone.name}`);
    }
  };

  const addShip = () => {
    if (newShip.name && (newShip.imo || newShip.mmsi)) {
      setShips([...ships, {
        id: Date.now(),
        name: newShip.name,
        imo: newShip.imo,
        mmsi: newShip.mmsi,
        lastPosition: null,
        lastUpdate: null
      }]);
      setNewShip({ name: '', imo: '', mmsi: '' });
      addDebugLog(`✅ Ship added: ${newShip.name}`);
    }
  };

  const addApiKey = () => {
    if (newApiKey.trim()) {
      setApiKeys([...apiKeys, { id: Date.now(), key: newApiKey }]);
      setNewApiKey('');
      addDebugLog('✅ API key added');
    }
  };

  const distance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const checkAlerts = useCallback((ship, oldPos) => {
    if (!ship.lastPosition) return;
    zones.forEach(zone => {
      const dist = distance(zone.lat, zone.lng, ship.lastPosition.lat, ship.lastPosition.lng);
      if (dist <= zone.radius) {
        const wasOutside = !oldPos || distance(zone.lat, zone.lng, oldPos.lat, oldPos.lng) > zone.radius;
        if (wasOutside) {
          const key = `${ship.id}-${zone.id}-${Math.floor(Date.now() / 60000)}`;
          if (!processedAlertsRef.current.has(key)) {
            processedAlertsRef.current.add(key);
            const alert = {
              id: Date.now(),
              shipName: ship.name,
              zoneName: zone.name,
              timestamp: new Date(),
              imo: ship.imo,
              mmsi: ship.mmsi
            };
            setAlerts(prev => [alert, ...prev]);
            addDebugLog(`🚨 ALERT: ${ship.name} entered ${zone.name}!`);
            
            if (userEmail) {
              fetch('https://api.emailjs.com/api/v1.0/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  service_id: 'service_fwdkx6a',
                  template_id: 'template_48x7yro',
                  user_id: 'Jfn8qIlDqRa1pGMxH',
                  template_params: {
                    to_email: userEmail,
                    shipName: ship.name,
                    zoneName: zone.name,
                    timestamp: alert.timestamp.toLocaleString()
                  }
                })
              }).catch(() => {});
            }
          }
        }
      }
    });
  }, [zones, userEmail]);

  const fetchShips = useCallback(async () => {
    if (!apiKeys.length || !ships.length) return;
    const now = Date.now();
    if (now - lastFetchRef.current < 85000) return;
    lastFetchRef.current = now;

    addDebugLog('📡 Fetching from AISStream via backend...');
    setDataUsage(prev => ({ mb: prev.mb + ships.length * 0.002 }));

    for (const apiKey of apiKeys) {
      try {
        const res = await fetch('/api/ais', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: apiKey.key
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.Message) {
            const msgs = Array.isArray(data.Message) ? data.Message : [data.Message];
            addDebugLog(`✓ Got ${msgs.length} messages`);
            let count = 0;
            setShips(prev => prev.map(ship => {
              const msg = msgs.find(m => m.MessageType === 'PositionReport' && 
                (m.UserID?.toString() === ship.mmsi || m.IMO?.toString() === ship.imo));
              if (msg) {
                count++;
                const oldPos = ship.lastPosition;
                const newPos = { lat: msg.Latitude, lng: msg.Longitude };
                checkAlerts({ ...ship, lastPosition: newPos }, oldPos);
                return { ...ship, lastPosition: newPos, lastUpdate: new Date() };
              }
              return ship;
            }));
            addDebugLog(`✓ Matched ${count} ships`);
          }
        } else {
          addDebugLog(`❌ API error: ${res.status}`);
        }
      } catch (err) {
        addDebugLog(`❌ Fetch error: ${err.message.substring(0, 30)}`);
      }
    }
  }, [apiKeys, ships, checkAlerts]);

  useEffect(() => {
    addDebugLog('🚀 Ship Tracker Started');
    fetchShips();
    const interval = setInterval(fetchShips, 90000);
    return () => clearInterval(interval);
  }, [fetchShips]);

  const styles = {
    container: { backgroundColor: '#0a1128', color: '#e8eef7', fontFamily: 'sans-serif', minHeight: '100vh', padding: '24px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingBottom: '24px', borderBottom: '2px solid #3d5a80' },
    btn: { padding: '10px 16px', backgroundColor: '#00d9ff', color: '#0a1128', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
    btnSecondary: { padding: '10px 16px', backgroundColor: '#1a2847', color: '#e8eef7', border: '1px solid #3d5a80', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
    card: { backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #3d5a80', marginBottom: '16px' },
    input: { padding: '10px 12px', backgroundColor: '#0f1838', border: '1px solid #3d5a80', borderRadius: '6px', color: '#e8eef7', fontSize: '14px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: '8px', fontSize: '28px', color: '#00d9ff' }}>⚓ Ship Tracker</h1>
          <div style={{ fontSize: '13px', color: '#4ade80' }}>📡 Real AIS Tracking</div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {['dashboard', 'zones', 'ships', 'alerts', 'settings', 'debug'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...styles.btnSecondary,
                backgroundColor: activeTab === tab ? '#00d9ff' : '#1a2847',
                color: activeTab === tab ? '#0a1128' : '#e8eef7'
              }}
            >
              {tab === 'dashboard' && '📊'}
              {tab === 'zones' && '🗺️'}
              {tab === 'ships' && '🚢'}
              {tab === 'alerts' && `🔔(${alerts.length})`}
              {tab === 'settings' && '⚙️'}
              {tab === 'debug' && '🐛'}
            </button>
          ))}
        </div>
      </div>

      <div>
        {activeTab === 'dashboard' && (
          <div>
            <h2 style={{ color: '#00d9ff' }}>Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              {[{ l: 'Alerts', v: alerts.length }, { l: 'Zones', v: zones.length }, { l: 'Ships', v: ships.length }, { l: 'API Keys', v: apiKeys.length }].map((c, i) => (
                <div key={i} style={{ ...styles.card, textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#8899bb', marginBottom: '8px' }}>{c.l}</div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#00d9ff' }}>{c.v}</div>
                </div>
              ))}
            </div>
            <div style={styles.card}>
              <h3 style={{ marginTop: 0, color: '#00d9ff' }}>Recent Alerts</h3>
              {alerts.length === 0 ? (
                <p style={{ color: '#8899bb' }}>No alerts yet</p>
              ) : (
                alerts.slice(0, 10).map(a => (
                  <div key={a.id} style={{ padding: '12px', backgroundColor: '#0f1838', borderRadius: '6px', marginBottom: '8px', borderLeft: '3px solid #ef4444' }}>
                    <div style={{ fontWeight: '600', color: '#00d9ff' }}>{a.shipName} → {a.zoneName}</div>
                    <div style={{ fontSize: '11px', color: '#8899bb' }}>{a.timestamp.toLocaleString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'zones' && (
          <div>
            <h2 style={{ color: '#00d9ff' }}>Zones</h2>
            <div style={styles.card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '12px' }}>
                <input type="text" placeholder="Name" value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} style={styles.input} />
                <input type="number" step="0.000001" placeholder="Latitude" value={newZone.lat} onChange={(e) => setNewZone({ ...newZone, lat: e.target.value })} style={styles.input} />
                <input type="number" step="0.000001" placeholder="Longitude" value={newZone.lng} onChange={(e) => setNewZone({ ...newZone, lng: e.target.value })} style={styles.input} />
                <input type="number" placeholder="Radius (m)" value={newZone.radius} onChange={(e) => setNewZone({ ...newZone, radius: e.target.value })} style={styles.input} />
                <button onClick={addZone} style={styles.btn}>➕</button>
              </div>
            </div>
            {zones.map(z => (
              <div key={z.id} style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#00d9ff', fontWeight: '600' }}>🗺️ {z.name}</div>
                  <div style={{ fontSize: '12px', color: '#8899bb', marginTop: '4px' }}>({z.lat.toFixed(6)}, {z.lng.toFixed(6)}) • {z.radius}m</div>
                </div>
                <button onClick={() => setZones(zones.filter(x => x.id !== z.id))} style={{ ...styles.btn, backgroundColor: '#ef4444' }}>🗑️</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'ships' && (
          <div>
            <h2 style={{ color: '#00d9ff' }}>Ships</h2>
            <div style={styles.card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px' }}>
                <input type="text" placeholder="Name" value={newShip.name} onChange={(e) => setNewShip({ ...newShip, name: e.target.value })} style={styles.input} />
                <input type="text" placeholder="IMO" value={newShip.imo} onChange={(e) => setNewShip({ ...newShip, imo: e.target.value })} style={styles.input} />
                <input type="text" placeholder="MMSI" value={newShip.mmsi} onChange={(e) => setNewShip({ ...newShip, mmsi: e.target.value })} style={styles.input} />
                <button onClick={addShip} style={styles.btn}>➕</button>
              </div>
            </div>
            {ships.map(s => (
              <div key={s.id} style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#00d9ff', fontWeight: '600' }}>🚢 {s.name}</div>
                  <div style={{ fontSize: '12px', color: '#8899bb', marginTop: '4px' }}>IMO: {s.imo || 'N/A'} | MMSI: {s.mmsi || 'N/A'}</div>
                  {s.lastPosition && <div style={{ fontSize: '12px', color: '#4ade80', marginTop: '4px' }}>📍 ({s.lastPosition.lat.toFixed(4)}, {s.lastPosition.lng.toFixed(4)})</div>}
                </div>
                <button onClick={() => setShips(ships.filter(x => x.id !== s.id))} style={{ ...styles.btn, backgroundColor: '#ef4444' }}>🗑️</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div>
            <h2 style={{ color: '#00d9ff' }}>🔔 Alerts ({alerts.length})</h2>
            {alerts.map(a => (
              <div key={a.id} style={{ ...styles.card, borderLeft: '4px solid #ef4444' }}>
                <div style={{ fontWeight: '600', color: '#00d9ff' }}>{a.shipName}</div>
                <div style={{ fontSize: '13px', color: '#8899bb', marginTop: '4px' }}>📍 Entered {a.zoneName}</div>
                <div style={{ fontSize: '11px', color: '#8899bb', marginTop: '4px' }}>{a.timestamp.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h2 style={{ color: '#00d9ff' }}>⚙️ Settings</h2>
            <div style={{ ...styles.card, borderColor: '#4ade80' }}>
              <h3 style={{ marginTop: 0, color: '#4ade80' }}>🔑 AISStream API Key</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input type={showApiKey ? 'text' : 'password'} placeholder="API key" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} style={{ ...styles.input, flex: 1 }} />
                <button onClick={() => setShowApiKey(!showApiKey)} style={{ ...styles.btn, backgroundColor: '#3b82f6' }}>👁️</button>
                <button onClick={addApiKey} style={styles.btn}>➕</button>
              </div>
              <p style={{ fontSize: '12px', color: '#8899bb', margin: '0 0 16px 0' }}>Get free key from <a href="https://aisstream.io/" target="_blank" rel="noreferrer" style={{ color: '#00d9ff' }}>aisstream.io</a></p>
              {apiKeys.map((k, i) => (
                <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#0f1838', borderRadius: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#8899bb' }}>Key {i + 1}: {k.key.substring(0, 8)}...</span>
                  <button onClick={() => setApiKeys(apiKeys.filter(x => x.id !== k.id))} style={{ ...styles.btn, backgroundColor: '#ef4444', padding: '6px 10px' }}>🗑️</button>
                </div>
              ))}
            </div>
            <div style={styles.card}>
              <h3 style={{ marginTop: 0, color: '#00d9ff' }}>📧 Email Alerts</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="email" placeholder="your@email.com" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} style={{ ...styles.input, flex: 1 }} />
                <button onClick={() => userEmail && alert('✅ Saved')} style={{ ...styles.btn, backgroundColor: userEmail ? '#4ade80' : '#3d5a80' }}>✓</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'debug' && (
          <div>
            <h2 style={{ color: '#fbbf24' }}>🐛 Debug</h2>
            <div style={{ ...styles.card, borderColor: '#fbbf24' }}>
              <button
                onClick={() => {
                  if (zones.length && ships.length) {
                    setAlerts(prev => [{
                      id: Date.now(),
                      shipName: ships[0].name,
                      zoneName: zones[0].name,
                      timestamp: new Date(),
                      imo: ships[0].imo,
                      mmsi: ships[0].mmsi
                    }, ...prev]);
                  }
                }}
                style={{ ...styles.btn, backgroundColor: '#fbbf24', color: '#0a1128' }}
              >
                🧪 Test Alert
              </button>
            </div>
            <div style={{ ...styles.card, borderColor: '#fbbf24' }}>
              <h3 style={{ marginTop: 0, color: '#fbbf24' }}>Log</h3>
              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#4ade80', backgroundColor: '#0f1838', padding: '12px', borderRadius: '6px', maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {debugLog.length === 0 ? <span style={{ color: '#8899bb' }}>Waiting...</span> : debugLog.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ backgroundColor: '#0f1838', borderTop: '1px solid #3d5a80', padding: '12px 24px', fontSize: '12px', color: '#8899bb', marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
        <span>📊 Data: {dataUsage.mb.toFixed(2)}MB</span>
        <span>✅ Updates every 90 seconds</span>
      </div>
    </div>
  );
}

export default App;
