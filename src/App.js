import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MapPin, Bell, Settings, Ship, AlertCircle, Download, Trash2, Plus, Eye, EyeOff, Check } from 'lucide-react';

const ShipTrackerApp = () => {
  // Initialize state from localStorage or use empty defaults
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
  const [watchlists, setWatchlists] = useState(() => {
    const saved = localStorage.getItem('shipTrackerWatchlists');
    return saved ? JSON.parse(saved) : [];
  });
  const [notificationSettings, setNotificationSettings] = useState(() => {
    const saved = localStorage.getItem('shipTrackerNotificationSettings');
    return saved ? JSON.parse(saved) : {};
  });

  // Form states
  const [newZone, setNewZone] = useState({ name: '', lat: '', lng: '', radius: '' });
  const [newShip, setNewShip] = useState({ name: '', imo: '', mmsi: '', watchlist: '' });
  const [newApiKey, setNewApiKey] = useState('');
  const [newWatchlist, setNewWatchlist] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [userEmail, setUserEmail] = useState(() => {
    return localStorage.getItem('shipTrackerUserEmail') || '';
  });
  const [dataUsageToday, setDataUsageToday] = useState(() => {
    const saved = localStorage.getItem('shipTrackerDataUsageToday');
    return saved ? JSON.parse(saved) : { mb: 0, date: new Date().toDateString() };
  });
  const [dataUsageWeek, setDataUsageWeek] = useState(() => {
    const saved = localStorage.getItem('shipTrackerDataUsageWeek');
    return saved ? JSON.parse(saved) : { mb: 0 };
  });
  const [debugLog, setDebugLog] = useState([]);
  const [serverStatus, setServerStatus] = useState('checking');
  const [apiBaseUrl, setApiBaseUrl] = useState('http://localhost:3001');

  const trackingIntervalRef = useRef(null);
  const processedAlertsRef = useRef(new Set());

  // Debug logging function
  const addDebugLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(logEntry);
    setDebugLog(prev => [logEntry, ...prev].slice(0, 50));
  };

  // Check server status on load
  useEffect(() => {
    const checkServer = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/health`);
        if (response.ok) {
          setServerStatus('connected');
          addDebugLog('✅ Backend server connected');
        }
      } catch (error) {
        setServerStatus('disconnected');
        addDebugLog('❌ Backend server not available - API calls will fail');
      }
    };

    checkServer();
  }, [apiBaseUrl]);

  // Register service worker for background tracking
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => console.log('Service Worker registered:', reg))
        .catch(err => console.log('SW registration failed:', err));
    }
  }, []);

  // Persist zones to localStorage
  useEffect(() => {
    localStorage.setItem('shipTrackerZones', JSON.stringify(zones));
  }, [zones]);

  // Persist ships to localStorage
  useEffect(() => {
    localStorage.setItem('shipTrackerShips', JSON.stringify(ships));
  }, [ships]);

  // Persist API keys to localStorage
  useEffect(() => {
    localStorage.setItem('shipTrackerApiKeys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  // Persist alerts to localStorage
  useEffect(() => {
    localStorage.setItem('shipTrackerAlerts', JSON.stringify(alerts));
  }, [alerts]);

  // Persist watchlists to localStorage
  useEffect(() => {
    localStorage.setItem('shipTrackerWatchlists', JSON.stringify(watchlists));
  }, [watchlists]);

  // Persist notification settings to localStorage
  useEffect(() => {
    localStorage.setItem('shipTrackerNotificationSettings', JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  // Persist user email to localStorage
  useEffect(() => {
    localStorage.setItem('shipTrackerUserEmail', userEmail);
  }, [userEmail]);

  // Persist data usage to localStorage
  useEffect(() => {
    localStorage.setItem('shipTrackerDataUsageToday', JSON.stringify(dataUsageToday));
  }, [dataUsageToday]);

  useEffect(() => {
    localStorage.setItem('shipTrackerDataUsageWeek', JSON.stringify(dataUsageWeek));
  }, [dataUsageWeek]);

  // Reset daily data usage at midnight
  useEffect(() => {
    const today = new Date().toDateString();
    if (dataUsageToday.date !== today) {
      setDataUsageToday({ mb: 0, date: today });
    }
  }, [dataUsageToday.date]);

  // Add zone
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
      addDebugLog(`✅ Zone added: ${zoneData.name} at (${zoneData.lat}, ${zoneData.lng})`);
    }
  };

  // Delete zone
  const handleDeleteZone = (id) => {
    setZones(zones.filter(z => z.id !== id));
    const newSettings = { ...notificationSettings };
    delete newSettings[id];
    setNotificationSettings(newSettings);
  };

  // Add single ship
  const handleAddShip = () => {
    if (newShip.name && (newShip.imo || newShip.mmsi)) {
      const shipData = {
        id: Date.now(),
        ...newShip,
        lastPosition: null,
        lastUpdate: null,
      };
      setShips([...ships, shipData]);
      setNewShip({ name: '', imo: '', mmsi: '', watchlist: '' });
      addDebugLog(`✅ Ship added: ${shipData.name} (MMSI: ${shipData.mmsi}, IMO: ${shipData.imo})`);
    }
  };

  // Add ships from CSV
  const handleAddShipsFromCsv = () => {
    const lines = csvInput.trim().split('\n');
    const newShips = [];
    for (let i = 1; i < lines.length; i++) {
      const [name, imo, mmsi, watchlist] = lines[i].split(',').map(s => s.trim());
      if (name && (imo || mmsi)) {
        newShips.push({
          id: Date.now() + i,
          name,
          imo: imo || '',
          mmsi: mmsi || '',
          watchlist: watchlist || '',
          lastPosition: null,
          lastUpdate: null,
        });
      }
    }
    setShips([...ships, ...newShips]);
    setCsvInput('');
    setShowCsvModal(false);
  };

  // Delete ship
  const handleDeleteShip = (id) => {
    setShips(ships.filter(s => s.id !== id));
  };

  // Add API key
  const handleAddApiKey = () => {
    if (newApiKey.trim()) {
      setApiKeys([...apiKeys, { id: Date.now(), key: newApiKey }]);
      setNewApiKey('');
      addDebugLog(`✅ API key added`);
    }
  };

  // Delete API key
  const handleDeleteApiKey = (id) => {
    setApiKeys(apiKeys.filter(k => k.id !== id));
  };

  // Add watchlist
  const handleAddWatchlist = () => {
    if (newWatchlist.trim()) {
      setWatchlists([...watchlists, { id: Date.now(), name: newWatchlist }]);
      setNewWatchlist('');
    }
  };

  // Delete watchlist
  const handleDeleteWatchlist = (id) => {
    setWatchlists(watchlists.filter(w => w.id !== id));
    setShips(ships.map(s => s.watchlist === id ? { ...s, watchlist: '' } : s));
  };

  // Calculate distance between two coordinates
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Send email notification via EmailJS
  const sendEmailAlert = async (alert) => {
    if (!userEmail) {
      addDebugLog('⚠️ No email configured, skipping email notification');
      return;
    }

    try {
      const SERVICE_ID = 'service_fwdkx6a';
      const TEMPLATE_ID = 'template_48x7yro';
      const PUBLIC_KEY = 'Jfn8qIlDqRa1pGMxH';

      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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

      if (response.ok) {
        addDebugLog(`✅ Email sent to ${userEmail}`);
      } else {
        addDebugLog(`❌ Email sending failed: ${response.status}`);
      }
    } catch (error) {
      addDebugLog(`❌ Email error: ${error.message}`);
    }

    const dataUsed = 0.05;
    setDataUsageToday(prev => ({ ...prev, mb: prev.mb + dataUsed }));
    setDataUsageWeek(prev => ({ ...prev, mb: prev.mb + dataUsed }));
  };

  // Check if ship entered a zone
  const checkZoneEntry = useCallback((ship, oldPosition) => {
    if (!ship.lastPosition || zones.length === 0) {
      if (zones.length === 0) addDebugLog('⚠️ No zones defined');
      return;
    }

    addDebugLog(`🔍 Checking ship "${ship.name}" at (${ship.lastPosition.lat.toFixed(4)}, ${ship.lastPosition.lng.toFixed(4)})`);

    zones.forEach(zone => {
      const distance = calculateDistance(
        zone.lat, zone.lng,
        ship.lastPosition.lat, ship.lastPosition.lng
      );

      addDebugLog(`  Zone "${zone.name}": distance = ${distance.toFixed(0)}m, radius = ${zone.radius}m`);

      if (distance <= zone.radius) {
        addDebugLog(`  ✓ Ship is INSIDE zone "${zone.name}"`);
        
        const wasOutside = !oldPosition || 
          calculateDistance(zone.lat, zone.lng, oldPosition.lat, oldPosition.lng) > zone.radius;

        if (wasOutside) {
          addDebugLog(`  🚨 ALERT TRIGGERED! Ship entered zone "${zone.name}"`);
          
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

            setAlerts(prev => {
              addDebugLog(`  ✅ Added to alerts list (total: ${prev.length + 1})`);
              return [alertData, ...prev];
            });

            const settings = notificationSettings[zone.id] || { email: true, push: true };
            if (settings.email) {
              sendEmailAlert(alertData);
            }
            if (settings.push) {
              if ('Notification' in window) {
                if (Notification.permission === 'granted') {
                  new Notification(`⚓ Ship Alert`, {
                    body: `${ship.name} entered ${zone.name}`,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">⚓</text></svg>',
                    tag: `alert-${alertData.id}`,
                    requireInteraction: true,
                  });
                  addDebugLog(`  🔔 Push notification sent`);
                }
              }
              setDataUsageToday(prev => ({ ...prev, mb: prev.mb + 0.005 }));
              setDataUsageWeek(prev => ({ ...prev, mb: prev.mb + 0.005 }));
            }
          } else {
            addDebugLog(`  ⏭️ Duplicate alert skipped`);
          }
        } else {
          addDebugLog(`  ℹ️ Ship was already inside zone`);
        }
      }
    });
  }, [zones, notificationSettings, userEmail]);

  // Fetch real ship positions from AISStream.io API via backend proxy
  const fetchShipPositionsFromAPI = useCallback(async () => {
    if (apiKeys.length === 0 || ships.length === 0) {
      addDebugLog('⚠️ No API keys or ships to track');
      return;
    }

    if (serverStatus !== 'connected') {
      addDebugLog('❌ Backend server not connected - skipping API call');
      return;
    }

    addDebugLog(`📡 Fetching positions for ${ships.length} ships with ${apiKeys.length} API key(s)`);

    const dataPerShip = 0.002;
    const apiDataUsed = ships.length * dataPerShip;
    setDataUsageToday(prev => ({ ...prev, mb: prev.mb + apiDataUsed }));
    setDataUsageWeek(prev => ({ ...prev, mb: prev.mb + apiDataUsed }));

    for (const apiKeyObj of apiKeys) {
      try {
        // FIXED: Call backend proxy instead of direct API
        const response = await fetch(`${apiBaseUrl}/api/ais-stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiKey: apiKeyObj.key,
            boundingBox: [
              { lat: 90, lon: -180 },
              { lat: -90, lon: 180 }
            ]
          })
        });

        if (!response.ok) {
          addDebugLog(`❌ API error: ${response.status}`);
          continue;
        }

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

                addDebugLog(`✓ Found position for "${ship.name}": (${newPosition.lat}, ${newPosition.lng})`);
                
                // Call zone check synchronously
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
        } else {
          addDebugLog(`⚠️ No message data in API response`);
        }
      } catch (error) {
        addDebugLog(`❌ Fetch error: ${error.message}`);
      }
    }
  }, [apiKeys, ships, checkZoneEntry, serverStatus, apiBaseUrl]);

  // Update ship positions from API
  useEffect(() => {
    addDebugLog('🚀 Ship tracker initialized');
    
    // Initial fetch
    fetchShipPositionsFromAPI();

    // Set up interval for periodic updates (1.5 minutes)
    trackingIntervalRef.current = setInterval(() => {
      fetchShipPositionsFromAPI();
    }, 90000);

    return () => {
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
    };
  }, [fetchShipPositionsFromAPI]);

  // Test alert function
  const triggerTestAlert = () => {
    if (zones.length === 0 || ships.length === 0) {
      alert('Please add at least one zone and one ship first');
      return;
    }

    const testShip = ships[0];
    const testZone = zones[0];

    const testAlert = {
      id: Date.now(),
      shipName: testShip.name,
      imo: testShip.imo,
      mmsi: testShip.mmsi,
      zoneName: testZone.name,
      zoneCoords: `${testZone.lat}, ${testZone.lng}`,
      timestamp: new Date(),
      shipCoords: `${testZone.lat}, ${testZone.lng}`,
    };

    setAlerts(prev => [testAlert, ...prev]);
    addDebugLog(`🧪 Test alert created: ${testShip.name} in ${testZone.name}`);
  };

  // Request notification permission
  const requestNotificationPermission = () => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        alert('✅ Notifications already enabled!');
      } else if (Notification.permission === 'denied') {
        alert('❌ Notifications are blocked. Please enable them in your browser settings.');
      } else {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            alert('✅ Notifications enabled! You will receive alerts when ships enter zones.');
            new Notification('⚓ Ship Tracker Active', {
              body: 'You will now receive ship alerts',
              icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">⚓</text></svg>',
            });
          } else {
            alert('❌ Notification permission denied');
          }
        });
      }
    } else {
      alert('⚠️ Your browser does not support notifications');
    }
  };

  // Download alerts as CSV
  const downloadAlertsAsExcel = () => {
    let csvContent = 'Ship Name,IMO,MMSI,Zone Name,Zone Coordinates,Ship Coordinates,Date & Time\n';
    alerts.forEach(alert => {
      csvContent += `${alert.shipName},${alert.imo},${alert.mmsi},${alert.zoneName},"${alert.zoneCoords}","${alert.shipCoords}",${alert.timestamp.toLocaleString()}\n`;
    });

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
    element.setAttribute('download', `ship-alerts-${new Date().toISOString().slice(0, 10)}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Clear all alerts
  const clearAllAlerts = () => {
    if (window.confirm('Are you sure you want to clear all alerts?')) {
      setAlerts([]);
      addDebugLog('🗑️ All alerts cleared');
    }
  };

  // Get max ships capacity
  const maxShipsCapacity = apiKeys.length * 50;

  // Dashboard statistics
  const totalAlerts = alerts.length;
  const todayAlerts = alerts.filter(a => a.timestamp.toDateString() === new Date().toDateString()).length;
  const activeZones = zones.length;
  const trackedShips = ships.length;

  return (
    <div style={{ backgroundColor: '#0a1128', color: '#e8eef7', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif', minHeight: '100vh', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', paddingBottom: '24px', borderBottom: '2px solid #3d5a80' }}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: '8px', fontSize: '28px', color: '#00d9ff' }}>⚓ Ship Tracker</h1>
          <div style={{ fontSize: '13px', color: '#8899bb' }}>
            Real-time AIS monitoring with zone alerts
            {serverStatus === 'connected' && ' • ✅ Backend connected'}
            {serverStatus === 'disconnected' && ' • ❌ Backend disconnected'}
            {serverStatus === 'checking' && ' • ⏳ Checking backend...'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setActiveTab('dashboard')} style={{ padding: '10px 16px', backgroundColor: activeTab === 'dashboard' ? '#00d9ff' : '#1a2847', color: activeTab === 'dashboard' ? '#0a1128' : '#e8eef7', border: '1px solid #3d5a80', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>📊 Dashboard</button>
          <button onClick={() => setActiveTab('zones')} style={{ padding: '10px 16px', backgroundColor: activeTab === 'zones' ? '#00d9ff' : '#1a2847', color: activeTab === 'zones' ? '#0a1128' : '#e8eef7', border: '1px solid #3d5a80', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>🗺️ Zones</button>
          <button onClick={() => setActiveTab('ships')} style={{ padding: '10px 16px', backgroundColor: activeTab === 'ships' ? '#00d9ff' : '#1a2847', color: activeTab === 'ships' ? '#0a1128' : '#e8eef7', border: '1px solid #3d5a80', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>🚢 Ships</button>
          <button onClick={() => setActiveTab('alerts')} style={{ padding: '10px 16px', backgroundColor: activeTab === 'alerts' ? '#00d9ff' : '#1a2847', color: activeTab === 'alerts' ? '#0a1128' : '#e8eef7', border: '1px solid #3d5a80', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>🔔 Alerts ({totalAlerts})</button>
          <button onClick={() => setActiveTab('settings')} style={{ padding: '10px 16px', backgroundColor: activeTab === 'settings' ? '#00d9ff' : '#1a2847', color: activeTab === 'settings' ? '#0a1128' : '#e8eef7', border: '1px solid #3d5a80', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>⚙️ Settings</button>
          <button onClick={() => setActiveTab('debug')} style={{ padding: '10px 16px', backgroundColor: activeTab === 'debug' ? '#fbbf24' : '#1a2847', color: activeTab === 'debug' ? '#0a1128' : '#e8eef7', border: '1px solid #3d5a80', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>🐛 Debug</button>
        </div>
      </div>

      {/* Content Area */}
      <div style={{ marginBottom: '24px' }}>
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '20px', color: '#00d9ff' }}>Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              <StatCard label="Total Alerts" value={totalAlerts} color="#ef4444" />
              <StatCard label="Today's Alerts" value={todayAlerts} color="#fbbf24" />
              <StatCard label="Active Zones" value={activeZones} color="#4ade80" />
              <StatCard label="Tracked Ships" value={trackedShips} color="#3b82f6" />
            </div>

            {/* Recent Alerts */}
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #3d5a80' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#00d9ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🔔 Recent Alerts</span>
                {alerts.length > 0 && <button onClick={downloadAlertsAsExcel} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>📥 Export CSV</button>}
              </h3>

              {alerts.length === 0 ? (
                <div style={{ color: '#8899bb', fontSize: '14px', padding: '24px', textAlign: 'center' }}>No alerts yet. Add zones and ships to start tracking.</div>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {alerts.slice(0, 10).map((alert) => (
                    <div key={alert.id} style={{ padding: '12px', backgroundColor: '#0f1838', borderRadius: '6px', marginBottom: '8px', borderLeft: '3px solid #ef4444' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                          <div style={{ fontWeight: '600', color: '#00d9ff' }}>{alert.shipName}</div>
                          <div style={{ fontSize: '12px', color: '#8899bb', marginTop: '4px' }}>Entered <span style={{ color: '#4ade80' }}>{alert.zoneName}</span></div>
                          <div style={{ fontSize: '11px', color: '#8899bb', marginTop: '4px' }}>📍 {alert.shipCoords}</div>
                          <div style={{ fontSize: '11px', color: '#8899bb' }}>🕐 {alert.timestamp.toLocaleString()}</div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '11px', color: '#8899bb' }}>IMO: {alert.imo || 'N/A'}<br />MMSI: {alert.mmsi || 'N/A'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Zones Tab (condensed) */}
        {activeTab === 'zones' && (
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '20px', color: '#00d9ff' }}>Zones</h2>
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #3d5a80' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#00d9ff' }}>➕ Add New Zone</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '12px' }}>
                <input type="text" placeholder="Zone name" value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} style={inputStyle} />
                <input type="number" placeholder="Latitude" value={newZone.lat} onChange={(e) => setNewZone({ ...newZone, lat: e.target.value })} style={inputStyle} />
                <input type="number" placeholder="Longitude" value={newZone.lng} onChange={(e) => setNewZone({ ...newZone, lng: e.target.value })} style={inputStyle} />
                <input type="number" placeholder="Radius (meters)" value={newZone.radius} onChange={(e) => setNewZone({ ...newZone, radius: e.target.value })} style={inputStyle} />
                <button onClick={handleAddZone} style={{ padding: '10px 16px', backgroundColor: '#4ade80', color: '#0a1128', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap' }}>➕ Add Zone</button>
              </div>
            </div>
            {zones.length === 0 ? (
              <div style={{ backgroundColor: '#1a2847', padding: '40px', borderRadius: '12px', textAlign: 'center', border: '1px solid #3d5a80' }}>
                <div style={{ fontSize: '14px', color: '#8899bb' }}>No zones created yet. Add a zone to start monitoring.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {zones.map((zone) => (
                  <div key={zone.id} style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #3d5a80', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ marginTop: 0, marginBottom: '8px', color: '#00d9ff' }}>🗺️ {zone.name}</h3>
                      <div style={{ fontSize: '13px', color: '#8899bb' }}>📍 {zone.lat.toFixed(6)}, {zone.lng.toFixed(6)} • 📏 {zone.radius.toLocaleString()}m</div>
                    </div>
                    <button onClick={() => handleDeleteZone(zone.id)} style={{ padding: '8px 12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🗑️ Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ships Tab (condensed) */}
        {activeTab === 'ships' && (
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '20px', color: '#00d9ff' }}>Tracked Ships</h2>
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #3d5a80' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#00d9ff' }}>➕ Add Ship</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '12px' }}>
                <input type="text" placeholder="Ship name" value={newShip.name} onChange={(e) => setNewShip({ ...newShip, name: e.target.value })} style={inputStyle} />
                <input type="text" placeholder="IMO" value={newShip.imo} onChange={(e) => setNewShip({ ...newShip, imo: e.target.value })} style={inputStyle} />
                <input type="text" placeholder="MMSI" value={newShip.mmsi} onChange={(e) => setNewShip({ ...newShip, mmsi: e.target.value })} style={inputStyle} />
                <button onClick={handleAddShip} style={{ padding: '10px 16px', backgroundColor: '#4ade80', color: '#0a1128', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap' }}>➕ Add Ship</button>
              </div>
            </div>
            {ships.length === 0 ? (
              <div style={{ backgroundColor: '#1a2847', padding: '40px', borderRadius: '12px', textAlign: 'center', border: '1px solid #3d5a80' }}>
                <div style={{ fontSize: '14px', color: '#8899bb' }}>No ships added yet. Add ships to start tracking.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {ships.map((ship) => (
                  <div key={ship.id} style={{ backgroundColor: '#1a2847', padding: '16px', borderRadius: '12px', border: '1px solid #3d5a80', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '600', color: '#00d9ff' }}>🚢 {ship.name}</div>
                      <div style={{ fontSize: '12px', color: '#8899bb', marginTop: '4px' }}>IMO: {ship.imo || 'N/A'} • MMSI: {ship.mmsi || 'N/A'}</div>
                      {ship.lastPosition && <div style={{ fontSize: '12px', color: '#4ade80', marginTop: '4px' }}>📍 ({ship.lastPosition.lat.toFixed(4)}, {ship.lastPosition.lng.toFixed(4)})</div>}
                    </div>
                    <button onClick={() => handleDeleteShip(ship.id)} style={{ padding: '8px 12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>🗑️ Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '20px', color: '#00d9ff' }}>🔔 Alerts ({totalAlerts})</h2>
            {totalAlerts > 0 && (
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <button onClick={downloadAlertsAsExcel} style={{ padding: '10px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>📥 Export CSV</button>
                <button onClick={clearAllAlerts} style={{ padding: '10px 16px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>🗑️ Clear All</button>
              </div>
            )}
            {alerts.length === 0 ? (
              <div style={{ backgroundColor: '#1a2847', padding: '40px', borderRadius: '12px', textAlign: 'center', border: '1px solid #3d5a80' }}>
                <div style={{ fontSize: '14px', color: '#8899bb' }}>No alerts yet. Ships will appear here when they enter zones.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {alerts.map((alert) => (
                  <div key={alert.id} style={{ backgroundColor: '#1a2847', padding: '16px', borderRadius: '12px', border: '1px solid #3d5a80', borderLeft: '4px solid #ef4444' }}>
                    <div style={{ fontWeight: '600', color: '#00d9ff', marginBottom: '8px' }}>{alert.shipName}</div>
                    <div style={{ fontSize: '13px', color: '#8899bb', marginBottom: '4px' }}>📍 Entered <span style={{ color: '#4ade80', fontWeight: '600' }}>{alert.zoneName}</span></div>
                    <div style={{ fontSize: '12px', color: '#8899bb', marginBottom: '4px' }}>🧭 {alert.shipCoords}</div>
                    <div style={{ fontSize: '11px', color: '#8899bb' }}>🕐 {alert.timestamp.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '20px', color: '#00d9ff' }}>⚙️ Settings</h2>
            
            {/* Backend URL Configuration */}
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #3d5a80' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#00d9ff' }}>🖥️ Backend Configuration</h3>
              <label style={{ display: 'block', fontSize: '13px', color: '#8899bb', marginBottom: '8px', fontWeight: '600' }}>Backend API URL</label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="http://localhost:3001"
                style={{ ...inputStyle, width: '100%', marginBottom: '8px' }}
              />
              <div style={{ fontSize: '12px', color: serverStatus === 'connected' ? '#4ade80' : '#ef4444' }}>
                {serverStatus === 'connected' && '✅ Backend server connected'}
                {serverStatus === 'disconnected' && '❌ Backend server disconnected'}
                {serverStatus === 'checking' && '⏳ Checking...'}
              </div>
            </div>

            {/* API Keys Section */}
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #3d5a80' }}>
              <h3 style={{ marginTop: 0, marginBottom: '8px', color: '#00d9ff' }}>🔑 AISStream.io API Keys</h3>
              <div style={{ fontSize: '13px', color: '#8899bb', marginBottom: '16px' }}>
                Each API key can track up to 50 ships. Total capacity: <strong style={{ color: '#4ade80' }}>{maxShipsCapacity} ships</strong>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input type={showApiKey ? 'text' : 'password'} placeholder="Paste your API key here" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)} style={inputStyle} />
                  <button onClick={() => setShowApiKey(!showApiKey)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8899bb', cursor: 'pointer', fontSize: '16px' }}>{showApiKey ? '👁️' : '👁️‍🗨️'}</button>
                </div>
                <button onClick={handleAddApiKey} style={{ padding: '10px 16px', backgroundColor: '#4ade80', color: '#0a1128', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap' }}>➕ Add Key</button>
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {apiKeys.length === 0 ? (
                  <div style={{ color: '#8899bb', fontSize: '13px', padding: '12px', backgroundColor: '#0f1838', borderRadius: '6px' }}>No API keys added yet</div>
                ) : (
                  apiKeys.map((apiKey, index) => (
                    <div key={apiKey.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#0f1838', borderRadius: '6px', border: '1px solid #3d5a80' }}>
                      <div style={{ fontSize: '13px', color: '#8899bb' }}>Key {index + 1}: {apiKey.key.substring(0, 8)}...</div>
                      <button onClick={() => handleDeleteApiKey(apiKey.id)} style={{ padding: '6px 10px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>🗑️ Delete</button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Email Settings */}
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #3d5a80' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#00d9ff' }}>📧 Notifications</h3>
              <label style={{ display: 'block', fontSize: '13px', color: '#8899bb', marginBottom: '8px', fontWeight: '600' }}>Email Address for Alerts</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="email" placeholder="your@email.com" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => userEmail && alert(`✅ Email saved: ${userEmail}`)} style={{ padding: '10px 16px', backgroundColor: userEmail ? '#4ade80' : '#3d5a80', color: userEmail ? '#0a1128' : '#8899bb', border: 'none', borderRadius: '8px', cursor: userEmail ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap' }}>✓ Save</button>
              </div>
              {userEmail && <div style={{ fontSize: '12px', color: '#4ade80', marginTop: '6px' }}>✅ Email notifications enabled</div>}
            </div>
          </div>
        )}

        {/* Debug Tab */}
        {activeTab === 'debug' && (
          <div>
            <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '20px', color: '#fbbf24' }}>🐛 Debug Console</h2>
            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #fbbf24', marginBottom: '24px' }}>
              <button onClick={triggerTestAlert} style={{ padding: '10px 16px', backgroundColor: '#fbbf24', color: '#0a1128', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>🧪 Trigger Test Alert</button>
            </div>

            <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: '1px solid #fbbf24' }}>
              <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#fbbf24' }}>📋 Activity Log</h3>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: '#4ade80', backgroundColor: '#0f1838', padding: '12px', borderRadius: '6px', maxHeight: '400px', overflowY: 'auto', border: '1px solid #3d5a80' }}>
                {debugLog.length === 0 ? (
                  <div style={{ color: '#8899bb' }}>No activity yet...</div>
                ) : (
                  debugLog.map((log, idx) => (
                    <div key={idx} style={{ marginBottom: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log}</div>
                  ))
                )}
              </div>
            </div>

            <div style={{ marginTop: '16px', backgroundColor: '#1a2847', padding: '16px', borderRadius: '12px', border: '1px solid #3d5a80' }}>
              <h4 style={{ marginTop: 0, marginBottom: '8px', color: '#fbbf24' }}>Current State</h4>
              <div style={{ fontSize: '12px', color: '#8899bb', fontFamily: 'monospace', backgroundColor: '#0f1838', padding: '12px', borderRadius: '6px' }}>
                <div>✓ Backend: {serverStatus}</div>
                <div>✓ Zones: {zones.length}</div>
                <div>✓ Ships: {ships.length}</div>
                <div>✓ API Keys: {apiKeys.length}</div>
                <div>✓ Alerts: {alerts.length}</div>
                <div>✓ Email: {userEmail || 'Not set'}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Data Usage Footer */}
      <div style={{ backgroundColor: '#0f1838', borderTop: '1px solid #3d5a80', padding: '12px 24px', fontSize: '12px', color: '#8899bb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>📊 <strong>Data Usage Today:</strong> {dataUsageToday.mb.toFixed(2)} MB</div>
        <div>📅 <strong>Data Usage This Week:</strong> {dataUsageWeek.mb.toFixed(2)} MB</div>
        <div style={{ color: '#4ade80' }}>✅ Backend tracking active</div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color }) => (
  <div style={{ backgroundColor: '#1a2847', padding: '20px', borderRadius: '12px', border: `1px solid #3d5a80`, textAlign: 'center' }}>
    <div style={{ fontSize: '12px', color: '#8899bb', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>{label}</div>
    <div style={{ fontSize: '32px', fontWeight: '700', color: color }}>{value}</div>
  </div>
);

const inputStyle = {
  padding: '10px 12px',
  backgroundColor: '#0f1838',
  border: '1px solid #3d5a80',
  borderRadius: '6px',
  color: '#e8eef7',
  fontSize: '14px',
  fontFamily: 'inherit',
};

export default ShipTrackerApp;
