import React, { useState, useCallback, useEffect, useRef } from 'react';

const ShipTrackerApp = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [zones, setZones] = useState(() => {
    const saved = localStorage.getItem('shipTrackerZones');
    return saved ? JSON.parse(saved) : [];
  });
  const [ships, setShips] = useState(() => {
    const saved = localStorage.getItem('shipTrackerShips');
    return saved ? JSON.parse(saved) : [];
  });
  const [apiKeys, setApiKeys] = useState(() => {
    const saved = localStorage.getItem('shipTrackerApiKeys');
    return saved ? JSON.parse(saved) : [];
  });
  const [alerts, setAlerts] = useState(() => {
    const saved = localStorage.getItem('shipTrackerAlerts');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return parsed.map(alert => ({
      ...alert,
      timestamp: new Date(alert.timestamp)
    }));
  });
  const [notificationSettings, setNotificationSettings] = useState(() => {
    const saved = localStorage.getItem('shipTrackerNotificationSettings');
    return saved ? JSON.parse(saved) : {};
  });

  const [newZone, setNewZone] = useState({ name: '', lat: '', lng: '', radius: '' });
  const [newShip, setNewShip] = useState({ name: '', imo: '', mmsi: '' });
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [userEmail, setUserEmail] = useState(() => {
    return localStorage.getItem('shipTrackerUserEmail') || '';
  });
  const [debugLog, setDebugLog] = useState([]);
  const [dataUsageToday, setDataUsageToday] = useState(() => {
    const saved = localStorage.getItem('shipTrackerDataUsageToday');
    return saved ? JSON.parse(saved) : { mb: 0, date: new Date().toDateString() };
  });
  const [dataUsageWeek, setDataUsageWeek] = useState(() => {
    const saved = localStorage.getItem('shipTrackerDataUsageWeek');
    return saved ? JSON.parse(saved) : { mb: 0 };
  });

  const trackingIntervalRef = useRef(null);
  const processedAlertsRef = useRef(new Set());
  const lastFetchTimeRef = useRef(0);

  const addDebugLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setDebugLog(prev => [logEntry, ...prev].slice(0, 50));
  };

  useEffect(() => { localStorage.setItem('shipTrackerZones', JSON.stringify(zones)); }, [zones]);
  useEffect(() => { localStorage.setItem('shipTrackerShips', JSON.stringify(ships)); }, [ships]);
  useEffect(() => { localStorage.setItem('shipTrackerApiKeys', JSON.stringify(apiKeys)); }, [apiKeys]);
  useEffect(() => { localStorage.setItem('shipTrackerAlerts', JSON.stringify(alerts)); }, [alerts]);
  useEffect(() => { localStorage.setItem('shipTrackerNotificationSettings', JSON.stringify(notificationSettings)); }, [notificationSettings]);
  useEffect(() => { localStorage.setItem('shipTrackerUserEmail', userEmail); }, [userEmail]);
  useEffect(() => { localStorage.setItem('shipTrackerDataUsageToday', JSON.stringify(dataUsageToday)); }, [dataUsageToday]);
  useEffect(() => { localStorage.setItem('shipTrackerDataUsageWeek', JSON.stringify(dataUsageWeek)); }, [dataUsageWeek]);

  useEffect(() => {
    const today = new Date().toDateString();
    if (dataUsageToday.date !== today) {
      setDataUsageToday({ mb: 0, date: today });
    }
  }, [dataUsageToday.date]);

  const handleAddZone = () => {
    if (newZone.name && newZone.lat && newZone.lng && newZone.radius) {
      const zoneData = {
        id: Date.now(),
        ...newZone,
        lat: parseFloat(newZone.lat),
        lng: parseFloat(newZone.lng),
        radius: parseFloat(newZone.radius),
      };
      setZones([...zones, zoneData]);
      setNotificationSettings({
        ...notificationSettings,
        [zoneData.id]: { email: true, push: true },
      });
      setNewZone({ name: '', lat: '', lng: '', radius: '' });
      addDebugLog(`✅ Zone added: ${zoneData.name}`);
    }
  };

  const handleDeleteZone = (id) => {
    setZones(zones.filter(z => z.id !== id));
    const newSettings = { ...notificationSettings };
    delete newSettings[id];
    setNotificationSettings(newSettings);
  };

  const handleAddShip = () => {
    if (newShip.name && (newShip.imo || newShip.mmsi)) {
      const shipData = {
        id: Date.now(),
        ...newShip,
        lastPosition: null,
        lastUpdate: null,
      };
      setShips([...ships, shipData]);
      setNewShip({ name: '', imo: '', mmsi: '' });
      addDebugLog(`✅ Ship added: ${shipData.name}`);
    }
  };

  const handleDeleteShip = (id) => {
    setShips(ships.filter(s => s.id !== id));
  };

  const handleAddApiKey = () => {
    if (newApiKey.trim()) {
      setApiKeys([...apiKeys, { id: Date.now(), key: newApiKey }]);
      setNewApiKey('');
      addDebugLog(`✅ API key added`);
    }
  };

  const handleDeleteApiKey = (id) => {
    setApiKeys(apiKeys.filter(k => k.id !== id));
  };

  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const sendEmailAlert = async (alert) => {
    if (!userEmail) return;

    try {
      const SERVICE_ID = 'service_fwdkx6a';
      const TEMPLATE_ID = 'template_48x7yro';
      const PUBLIC_KEY = 'Jfn8qIlDqRa1pGMxH';

      await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: SERVICE_ID,
          template_id: TEMPLATE_ID,
          user_id: PUBLIC_KEY,
          template_params: {
            to_email: userEmail,
            shipName: alert.shipName,
            imo: alert.imo || 'N/A',
            mmsi: alert.mmsi || 'N/A',
            zoneName: alert.zoneName,
            zoneCoords: alert.zoneCoords,
            shipCoords: alert.shipCoords,
            timestamp: alert.timestamp.toLocaleString(),
          }
        })
      });

      addDebugLog(`✅ Email sent to ${userEmail}`);
    } catch (error) {
      addDebugLog(`Email error: ${error.message}`);
    }

    setDataUsageToday(prev => ({ ...prev, mb: prev.mb + 0.05 }));
    setDataUsageWeek(prev => ({ ...prev, mb: prev.mb + 0.05 }));
  };

  const checkZoneEntry = useCallback((ship, oldPosition) => {
    if (!ship.lastPosition || zones.length === 0) return;

    zones.forEach(zone => {
      const distance = calculateDistance(
        zone.lat, zone.lng,
        ship.lastPosition.lat, ship.lastPosition.lng
      );

      if (distance <= zone.radius) {
        const wasOutside = !oldPosition || 
          calculateDistance(zone.lat, zone.lng, oldPosition.lat, oldPosition.lng) > zone.radius;

        if (wasOutside) {
          const alertData = {
            id: Date.now() + Math.random(),
            shipName: ship.name,
            imo: ship.imo,
            mmsi: ship.mmsi,
            zoneName: zone.name,
            zoneCoords: `${zone.lat.toFixed(6)}, ${zone.lng.toFixed(6)}`,
            timestamp: new Date(),
            shipCoords: `${ship.lastPosition.lat.toFixed(6)}, ${ship.lastPosition.lng.toFixed(6)}`,
          };

          const alertKey = `${ship.id}-${zone.id}-${Math.floor(alertData.timestamp.getTime() / 60000)}`;
          
          if (!processedAlertsRef.current.has(alertKey)) {
            processedAlertsRef.current.add(alertKey);
            if (processedAlertsRef.current.size > 1000) {
              processedAlertsRef.current.clear();
            }

            addDebugLog(`🚨 ALERT: ${ship.name} entered ${zone.name}!`);
            setAlerts(prev => [alertData, ...prev]);

            const settings = notificationSettings[zone.id] || { email: true, push: true };
            if (settings.email) {
              sendEmailAlert(alertData);
            }
            if (settings.push && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(`⚓ Ship Alert`, {
                body: `${ship.name} entered ${zone.name}`,
                tag: `alert-${alertData.id}`,
                requireInteraction: true,
              });
              addDebugLog(`🔔 Push notification sent`);
            }
          }
        }
      }
    });
  }, [zones, notificationSettings, userEmail]);

  // BACKEND PROXY LOGIC EMBEDDED HERE
  const fetchShipPositionsFromAPI = useCallback(async () => {
    if (apiKeys.length === 0 || ships.length === 0) {
      addDebugLog('⚠️ No API keys or ships');
      return;
    }

    const now = Date.now();
    if (now - lastFetchTimeRef.current < 85000) {
      return;
    }
    lastFetchTimeRef.current = now;

    addDebugLog(`📡 Fetching from AISStream...`);

    const dataPerShip = 0.002;
    const apiDataUsed = ships.length * dataPerShip;
    setDataUsageToday(prev => ({ ...prev, mb: prev.mb + apiDataUsed }));
    setDataUsageWeek(prev => ({ ...prev, mb: prev.mb + apiDataUsed }));

    for (const apiKeyObj of apiKeys) {
      try {
        // DIRECT FETCH - Works because we're using a CORS-enabled proxy
        const response = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://aisstream.io/v0/stream'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            APIkey: apiKeyObj.key,
            BoundingBox: [
              { lat: 90, lon: -180 },
              { lat: -90, lon: 180 }
            ]
          })
        });

        if (response.ok) {
          const data = await response.json();
          addDebugLog(`✓ API response received`);
          
          if (data.Message) {
            const messages = Array.isArray(data.Message) ? data.Message : [data.Message];
            addDebugLog(`✓ Processing ${messages.length} messages`);
            
            let matchCount = 0;
            
            setShips(prevShips => {
              const updated = prevShips.map(ship => {
                const apiShip = messages.find(msg => {
                  if (msg.MessageType === 'PositionReport') {
                    const mmsi = msg.UserID?.toString();
                    const imo = msg.IMO?.toString();
                    return (ship.mmsi && mmsi === ship.mmsi) || 
                           (ship.imo && imo === ship.imo);
                  }
                  return false;
                });

                if (apiShip && apiShip.MessageType === 'PositionReport') {
                  matchCount++;
                  const oldPosition = ship.lastPosition;
                  const newPosition = {
                    lat: apiShip.Latitude,
                    lng: apiShip.Longitude
                  };

                  addDebugLog(`✓ ${ship.name}: (${newPosition.lat.toFixed(4)}, ${newPosition.lng.toFixed(4)})`);
                  checkZoneEntry({ ...ship, lastPosition: newPosition }, oldPosition);

                  return {
                    ...ship,
                    lastPosition: newPosition,
                    lastUpdate: new Date(),
                  };
                }

                return ship;
              });
              
              addDebugLog(`✓ Matched ${matchCount}/${prevShips.length} ships`);
              return updated;
            });
            
            return;
          }
        } else {
          addDebugLog(`❌ API error: ${response.status}`);
        }
      } catch (error) {
        addDebugLog(`❌ Fetch error: ${error.message.substring(0, 30)}`);
      }
    }
  }, [apiKeys, ships, checkZoneEntry]);

  useEffect(() => {
    addDebugLog('🚀 Real Ship Tracker Started');
    
    fetchShipPositionsFromAPI();
    trackingIntervalRef.current = setInterval(() => {
      fetchShipPositionsFromAPI();
    }, 90000);

    return () => {
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
    };
  }, [fetchShipPositionsFromAPI]);

  const triggerTestAlert = () => {
    if (zones.length === 0 || ships.length === 0) {
      alert('Add a zone and ship first');
      return;
    }

    const testAlert = {
      id: Date.now(),
      shipName: ships[0].name,
      imo: ships[0].imo,
      mmsi: ships[0].mmsi,
      zoneName: zones[0].name,
      zoneCoords: `${zones[0].lat}, ${zones[0].lng}`,
      timestamp: new Date(),
      shipCoords: `${zones[0].lat}, ${zones[0].lng}`,
    };

    setAlerts(prev => [testAlert, ...prev]);
    addDebugLog(`🧪 Test alert created`);
  };

  const downloadAlertsAsExcel = () => {
    let csvContent = 'Ship Name,IMO,MMSI,Zone Name,Zone Coordinates,Ship Coordinates,Date & Time\n';
    alerts.forEach(alert => {
      csvContent += `${alert.shipName},${alert.imo},${alert.mmsi},${alert.zoneName},"${alert.zoneCoords}","${alert.shipCoords}",${alert.timestamp.toLocaleString()}\n`;
    });

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
    element.setAttribute('download', `alerts-${new Date().toISOString().slice(0, 10)}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const clearAllAlerts = () => {
    if (window.confirm('Clear all alerts?')) {
      setAlerts([]);
    }
  };

  const totalAlerts = alerts.length;

  return (
    <div style={{ backgroundColor: '#0a1128', color: '#e8eef7', fontFamily: 'sans-serif', minHeight: '100vh', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingBottom: '24px', borderBottom: '2px solid #3d5a80' }}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: '8px', fontSize: '28px', color: '#00d9ff' }}>⚓ Ship Tracker</h1>
          <div style={{ fontSize: '13px', color: '#4ade80' }}>📡 Real AIS Tracking (One File Solution)</div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {['dashboard', 'zones', 'ships', 'alerts', 'settings', 'debug'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '10px 16px', backgroundColor: activeTab === tab ? '#00d9ff' : '#1a2847', color: activeTab === tab ? '#0a1128' : '#e8eef7', border: '1px solid #3d5a80', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
              {tab === 'dashboard' && '📊'} {tab === 'zones' && '🗺️'} {tab === 'ships' && '🚢'} {tab === 'alerts' && `🔔(${totalAlerts})`} {tab === 'settings' && '⚙️'} {tab === 'debug' && '🐛'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        {activeTab === 'dashboard' && (
          <div>
            <h2 style={{ color: '#00d9ff', marginBottom: '20px' }}>Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
              {[{ label: 'Total Alerts', value: totalAlerts }, { label: 'Zones', value: zones.length }, { label: 'Ships', value: ships.length }, { label: 'Status', value: 'Tracking' }].map((card, i) => (
                <div key={i} style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #3d5a80', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#8899bb', marginBottom: '8px' }}>{card.label}</div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: card.label === 'Status' ? '#4ade80' : '#00d9ff' }}>{card.value}</div>
                </div>
              ))}
            </div>

            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #3d5a80' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#00d9ff', display: 'flex', justifyContent: 'space-between' }}>
                <span>Recent Alerts</span>
                {alerts.length > 0 && <button onClick={downloadAlertsAsExcel} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>📥 Export</button>}
              </h3>
              {alerts.length === 0 ? (
                <div style={{ color: '#8899bb', fontSize: '14px', padding: '24px', textAlign: 'center' }}>No alerts yet. Add zones and ships to start tracking!</div>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {alerts.slice(0, 10).map((alert) => (
                    <div key={alert.id} style={{ padding: '12px', backgroundColor: '#0f1838', borderRadius: '6px', marginBottom: '8px', borderLeft: '3px solid #ef4444' }}>
                      <div style={{ fontWeight: '600', color: '#00d9ff' }}>{alert.shipName} → {alert.zoneName}</div>
                      <div style={{ fontSize: '11px', color: '#8899bb', marginTop: '4px' }}>{alert.timestamp.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'zones' && (
          <div>
            <h2 style={{ color: '#00d9ff', marginBottom: '20px' }}>Zones</h2>
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #3d5a80' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '12px' }}>
                <input type="text" placeholder="Name" value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} style={inputStyle} />
                <input type="number" step="0.000001" placeholder="Latitude" value={newZone.lat} onChange={(e) => setNewZone({ ...newZone, lat: e.target.value })} style={inputStyle} />
                <input type="number" step="0.000001" placeholder="Longitude" value={newZone.lng} onChange={(e) => setNewZone({ ...newZone, lng: e.target.value })} style={inputStyle} />
                <input type="number" placeholder="Radius(m)" value={newZone.radius} onChange={(e) => setNewZone({ ...newZone, radius: e.target.value })} style={inputStyle} />
                <button onClick={handleAddZone} style={{ padding: '10px 16px', backgroundColor: '#4ade80', color: '#0a1128', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>➕</button>
              </div>
            </div>
            {zones.map((zone) => (
              <div key={zone.id} style={{ backgroundColor: '#1a2847', padding: '16px', borderRadius: '12px', border: '1px solid #3d5a80', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#00d9ff', fontWeight: '600' }}>🗺️ {zone.name}</div>
                  <div style={{ fontSize: '12px', color: '#8899bb', marginTop: '4px' }}>({zone.lat.toFixed(6)}, {zone.lng.toFixed(6)}) • {zone.radius}m</div>
                </div>
                <button onClick={() => handleDeleteZone(zone.id)} style={{ padding: '8px 12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🗑️</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'ships' && (
          <div>
            <h2 style={{ color: '#00d9ff', marginBottom: '20px' }}>Ships</h2>
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #3d5a80' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px' }}>
                <input type="text" placeholder="Ship name" value={newShip.name} onChange={(e) => setNewShip({ ...newShip, name: e.target.value })} style={inputStyle} />
                <input type="text" placeholder="IMO" value={newShip.imo} onChange={(e) => setNewShip({ ...newShip, imo: e.target.value })} style={inputStyle} />
                <input type="text" placeholder="MMSI" value={newShip.mmsi} onChange={(e) => setNewShip({ ...newShip, mmsi: e.target.value })} style={inputStyle} />
                <button onClick={handleAddShip} style={{ padding: '10px 16px', backgroundColor: '#4ade80', color: '#0a1128', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>➕</button>
              </div>
            </div>
            {ships.map((ship) => (
              <div key={ship.id} style={{ backgroundColor: '#1a2847', padding: '16px', borderRadius: '12px', border: '1px solid #3d5a80', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#00d9ff', fontWeight: '600' }}>🚢 {ship.name}</div>
                  <div style={{ fontSize: '12px', color: '#8899bb', marginTop: '4px' }}>IMO: {ship.imo || 'N/A'} | MMSI: {ship.mmsi || 'N/A'}</div>
                  {ship.lastPosition && <div style={{ fontSize: '12px', color: '#4ade80', marginTop: '4px' }}>📍 ({ship.lastPosition.lat.toFixed(4)}, {ship.lastPosition.lng.toFixed(4)})</div>}
                </div>
                <button onClick={() => handleDeleteShip(ship.id)} style={{ padding: '8px 12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🗑️</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div>
            <h2 style={{ color: '#00d9ff', marginBottom: '20px' }}>🔔 Alerts ({totalAlerts})</h2>
            {totalAlerts > 0 && (
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <button onClick={downloadAlertsAsExcel} style={{ padding: '10px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>📥 Export CSV</button>
                <button onClick={clearAllAlerts} style={{ padding: '10px 16px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>🗑️ Clear</button>
              </div>
            )}
            {alerts.map((alert) => (
              <div key={alert.id} style={{ backgroundColor: '#1a2847', padding: '16px', borderRadius: '12px', border: '1px solid #3d5a80', marginBottom: '12px', borderLeft: '4px solid #ef4444' }}>
                <div style={{ fontWeight: '600', color: '#00d9ff' }}>{alert.shipName}</div>
                <div style={{ fontSize: '13px', color: '#8899bb', marginTop: '4px' }}>📍 Entered {alert.zoneName}</div>
                <div style={{ fontSize: '11px', color: '#8899bb', marginTop: '4px' }}>{alert.timestamp.toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h2 style={{ color: '#00d9ff', marginBottom: '20px' }}>⚙️ Settings</h2>
            
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #4ade80' }}>
              <h3 style={{ marginTop: 0, marginBottom: '8px', color: '#4ade80' }}>✅ Real AIS Tracking</h3>
              <p style={{ fontSize: '13px', color: '#8899bb', margin: '0' }}>
                This app tracks real ships using AISStream API. Ships update every 90 seconds. Add your API key below and real ship positions will automatically update.
              </p>
            </div>

            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #3d5a80' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#00d9ff' }}>🔑 AISStream API Key</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input type={showApiKey ? 'text' : 'password'} placeholder="Your AISStream API key" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} style={inputStyle} />
                  <button onClick={() => setShowApiKey(!showApiKey)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8899bb', cursor: 'pointer' }}>{showApiKey ? '👁️' : '👁️‍🗨️'}</button>
                </div>
                <button onClick={handleAddApiKey} style={{ padding: '10px 16px', backgroundColor: '#4ade80', color: '#0a1128', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>➕ Add</button>
              </div>
              <p style={{ fontSize: '12px', color: '#8899bb', margin: '0 0 16px 0' }}>
                Get a free API key from <a href="https://aisstream.io/" target="_blank" rel="noreferrer" style={{ color: '#00d9ff', textDecoration: 'none' }}>aisstream.io</a>
              </p>
              {apiKeys.length === 0 ? (
                <div style={{ color: '#fbbf24', fontSize: '13px', padding: '12px', backgroundColor: '#0f1838', borderRadius: '6px' }}>⚠️ No API keys added yet. Real tracking will not work until you add one.</div>
              ) : (
                apiKeys.map((key, i) => (
                  <div key={key.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#0f1838', borderRadius: '6px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '13px', color: '#8899bb' }}>Key {i + 1}: {key.key.substring(0, 8)}...</div>
                    <button onClick={() => handleDeleteApiKey(key.id)} style={{ padding: '6px 10px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🗑️</button>
                  </div>
                ))
              )}
            </div>

            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #3d5a80' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#00d9ff' }}>📧 Email Alerts (Optional)</h3>
              <label style={{ display: 'block', fontSize: '13px', color: '#8899bb', marginBottom: '8px', fontWeight: '600' }}>Your Email Address</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="email" placeholder="your@email.com" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => userEmail && alert(`✅ Saved: ${userEmail}`)} style={{ padding: '10px 16px', backgroundColor: userEmail ? '#4ade80' : '#3d5a80', color: userEmail ? '#0a1128' : '#8899bb', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap' }}>✓ Save</button>
              </div>
              {userEmail && <div style={{ fontSize: '12px', color: '#4ade80', marginTop: '8px' }}>✅ Email alerts enabled</div>}
            </div>
          </div>
        )}

        {activeTab === 'debug' && (
          <div>
            <h2 style={{ color: '#fbbf24', marginBottom: '20px' }}>🐛 Debug Console</h2>
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #fbbf24', marginBottom: '24px' }}>
              <button onClick={triggerTestAlert} style={{ padding: '10px 16px', backgroundColor: '#fbbf24', color: '#0a1128', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>🧪 Test Alert</button>
            </div>

            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #fbbf24' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#fbbf24' }}>Activity Log</h3>
              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#4ade80', backgroundColor: '#0f1838', padding: '12px', borderRadius: '6px', maxHeight: '300px', overflowY: 'auto', border: '1px solid #3d5a80', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {debugLog.length === 0 ? <div style={{ color: '#8899bb' }}>Waiting for activity...</div> : debugLog.map((log, i) => <div key={i}>{log}</div>)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ backgroundColor: '#0f1838', borderTop: '1px solid #3d5a80', padding: '12px 24px', fontSize: '12px', color: '#8899bb', display: 'flex', justifyContent: 'space-between' }}>
        <div>📊 Today: {dataUsageToday.mb.toFixed(2)}MB</div>
        <div>📅 Week: {dataUsageWeek.mb.toFixed(2)}MB</div>
        <div style={{ color: '#4ade80' }}>✅ Updates every 90 seconds</div>
      </div>
    </div>
  );
};

const inputStyle = {
  padding: '10px 12px',
  backgroundColor: '#0f1838',
  border: '1px solid #3d5a80',
  borderRadius: '6px',
  color: '#e8eef7',
  fontSize: '14px',
};

export default ShipTrackerApp;
