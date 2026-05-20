import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import { Loader2, Ambulance } from 'lucide-react';

const ambIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/883/883344.png',
  iconSize: [28, 28], iconAnchor: [14, 14],
});

const userIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [36, 36], iconAnchor: [18, 36],
});

const EMERGENCIES = [
  { id: 'accident',    icon: '🩸', label: 'Accident / Trauma' },
  { id: 'cardiac',     icon: '💔', label: 'Cardiac Arrest' },
  { id: 'breathing',   icon: '🫁', label: 'Breathing Difficulty' },
  { id: 'unconscious', icon: '😵', label: 'Unconscious Person' },
  { id: 'stroke',      icon: '🧠', label: 'Stroke Symptoms' },
  { id: 'other',       icon: '🤕', label: 'Other / Not Sure' },
];

export default function MatchingPage({ userLat, userLon, problem, onSelectProblem, setProblem }) {
  const [nearby, setNearby] = useState([]);
  const [selected, setSelected] = useState(null);

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
          <MapContainer
            center={[userLat, userLon]}
            zoom={13}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <Marker position={[userLat, userLon]} icon={userIcon}>
              <Popup>You are here</Popup>
            </Marker>
            <Circle
              center={[userLat, userLon]}
              radius={2500}
              pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.07, weight: 1.5 }}
            />
            {nearby.map(a => (
              <Marker key={a.id} position={[a.latitude, a.longitude]} icon={ambIcon}>
                <Popup>{a.providerName}<br />{a.driverName}</Popup>
              </Marker>
            ))}
          </MapContainer>
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
