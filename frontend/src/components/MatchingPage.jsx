import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const EMERGENCIES = [
  { id: 'accident',    icon: '🩸', label: 'Accident / Trauma' },
  { id: 'cardiac',     icon: '💔', label: 'Cardiac Arrest' },
  { id: 'breathing',   icon: '🫁', label: 'Breathing Difficulty' },
  { id: 'unconscious', icon: '😵', label: 'Unconscious Person' },
  { id: 'stroke',      icon: '🧠', label: 'Stroke Symptoms' },
  { id: 'other',       icon: '🤕', label: 'Other / Not Sure' },
];

export default function MatchingPage({ userLat, userLon, problem, onSelectProblem, setProblem, theme }) {
  const [nearby, setNearby] = useState([]);
  const [selected, setSelected] = useState(null);
  
  const mapContainerRef = useRef(null);

  useEffect(() => {
    fetch('http://localhost:3000/api/ambulances')
      .then(r => r.ok ? r.json() : [])
      .then(data => setNearby(data.filter(a => a.isAvailable).slice(0, 6)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (problem) {
      const match = EMERGENCIES.find(e => e.label === problem);
      if (match) setSelected(match);
    }
  }, [problem]);

  useEffect(() => {
    if (!mapContainerRef.current || !userLat || !userLon) return;

    // Create Leaflet map
    const map = L.map(mapContainerRef.current, {
      center: [userLat, userLon],
      zoom: 13,
      zoomControl: false,
      attributionControl: false
    });

    const tileUrl = theme === 'light'
      ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

    L.tileLayer(tileUrl, { maxZoom: 20 }).addTo(map);

    // Custom user icon (emoji 📍)
    const userIcon = L.divIcon({
      html: `<div style="font-size: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); display: flex; align-items: center; justify-content: center;">📍</div>`,
      className: 'leaflet-user-marker',
      iconSize: [30, 30],
      iconAnchor: [15, 30]
    });

    const uMarker = L.marker([userLat, userLon], { icon: userIcon }).addTo(map);
    uMarker.bindPopup("You are here");

    // Search circle zone around the user
    const searchCircle = L.circle([userLat, userLon], {
      color: '#ef4444',
      weight: 1.5,
      opacity: 0.8,
      fillColor: '#ef4444',
      fillOpacity: 0.07,
      radius: 2500
    }).addTo(map);

    // Bounds bounds array
    const bounds = L.latLngBounds([userLat, userLon]);

    // Ambulance markers
    const ambulanceIcon = L.divIcon({
      html: `<div style="font-size: 24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); display: flex; align-items: center; justify-content: center;">🚑</div>`,
      className: 'leaflet-amb-marker',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const ambulanceMarkers = [];
    nearby.forEach(a => {
      const pos = [a.latitude, a.longitude];
      bounds.extend(pos);

      const marker = L.marker(pos, { icon: ambulanceIcon }).addTo(map);
      marker.bindPopup(`<strong>${a.providerName}</strong><br/>Driver: ${a.driverName}`);
      ambulanceMarkers.push(marker);
    });

    // Fit bounds to show user + nearby units
    if (nearby.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    // Force Leaflet recalculation after render to prevent empty tiles
    const resizeTimeout = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      clearTimeout(resizeTimeout);
      map.remove();
    };
  }, [userLat, userLon, nearby, theme]);

  const handleSelect = (e) => {
    setSelected(e);
    if (onSelectProblem) {
      onSelectProblem(e.label);
    } else if (setProblem) {
      setProblem(e.label);
    }
  };

  return (
    <div className="map-screen animate-in">
      <div className="map-top">
        {userLat && userLon ? (
          <div ref={mapContainerRef} style={{ height: '100%', width: '100%', borderRadius: 'inherit' }} />
        ) : (
          <div className="locating-screen">
            <div className="radar-pulse">📍</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Acquiring location…</p>
          </div>
        )}
      </div>

      <div className="matching-sheet">
        <div className="sheet-handle" />

        <div className="matching-status-row">
          <Loader2 size={22} color="var(--accent)" className="spinner-icon" />
          <div>
            <h3>Finding fastest unit…</h3>
            <p>{nearby.length} ambulance{nearby.length !== 1 ? 's' : ''} found nearby</p>
          </div>
        </div>

        {/* Triage */}
        {!selected ? (
          <>
            <p className="triage-prompt">What's the emergency? <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(optional, helps driver prepare)</span></p>
            <div className="triage-grid">
              {EMERGENCIES.map(e => (
                <button key={e.id} className="triage-chip" onClick={() => handleSelect(e)}>
                  <span className="triage-icon">{e.icon}</span>
                  {e.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="triage-confirm animate-in">
            <span>{selected.icon}</span>
            <span>"{selected.label}" reported — driver will be prepared</span>
          </div>
        )}

        {/* Nearby list */}
        {nearby.length > 0 && (
          <>
            <p className="nearby-title">Units nearby</p>
            {nearby.map(a => (
              <div key={a.id} className="nearby-item">
                <div className="nearby-icon-wrap">🚑</div>
                <div className="nearby-info">
                  <p className="nearby-provider">{a.providerName}</p>
                  <p className="nearby-driver">Driver: {a.driverName}</p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
