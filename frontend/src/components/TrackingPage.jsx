import { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  PhoneCall, CheckCircle2, X, Star, ShieldAlert, Heart, Truck, Landmark, 
  Shield, ClipboardList, CheckSquare, Square, MessageSquare, Settings, 
  Compass, Send, Volume2, VolumeX, AlertCircle, RefreshCw 
} from 'lucide-react';

const FIRST_AID_GUIDELINES = {
  'Accident / Trauma': [
    { title: 'Apply Direct Pressure', text: 'Use a clean cloth or bandage directly on the wound to control bleeding.' },
    { title: 'Keep Spine Stable', text: 'Avoid moving the patient’s head, neck, or back to prevent nerve damage.' },
    { title: 'Check Airway', text: 'Make sure the patient is breathing and there are no obstructions in the mouth.' }
  ],
  'Cardiac Arrest': [
    { title: 'Perform Hands-Only CPR', text: 'Push hard & fast in the center of the chest (100-120 compressions per minute).' },
    { title: 'Locate AED', text: 'If an Automated External Defibrillator is nearby, turn it on and follow voice instructions.' },
    { title: 'Keep Warm & Alert', text: 'Cover with a blanket. Keep talking to the patient to monitor responsiveness.' }
  ],
  'Breathing Difficulty': [
    { title: 'Sit the Patient Upright', text: 'Helping them sit vertically relieves lung pressure and makes breathing easier.' },
    { title: 'Loosen Tight Clothes', text: 'Undo collars, belts, or any garments restricting the chest/neck area.' },
    { title: 'Administer Inhaler', text: 'Help them locate and use their emergency inhaler or personal oxygen if available.' }
  ],
  'Unconscious Person': [
    { title: 'Use the Recovery Position', text: 'If breathing, roll them onto their side to keep their tongue from blocking airway.' },
    { title: 'Do Not Feed or Give Water', text: 'Giving fluids to an unconscious person can cause choking or asphyxiation.' },
    { title: 'Monitor Breath Constantly', text: 'Stay next to them and check for regular chest rise/fall until help arrives.' }
  ],
  'Stroke Symptoms': [
    { title: 'Think F.A.S.T.', text: 'Check for Face drooping, Arm weakness, and Speech difficulty. Note the time of onset.' },
    { title: 'Elevate Head Slightly', text: 'Keep them lying down with head and shoulders slightly raised on a pillow.' },
    { title: 'Stay Calm and Quiet', text: 'Keep the room quiet and avoid unnecessary movements to manage brain pressure.' }
  ],
  'Other / Not Sure': [
    { title: 'Stay by the Entrance', text: 'If possible, stand outside or clear the main gate/door to guide the paramedics.' },
    { title: 'Gather Medications', text: 'Collect all current prescriptions, medical history, or insurance files for the crew.' },
    { title: 'Secure Household Pets', text: 'Move dogs/cats to a separate room to avoid any delays when responders enter.' }
  ]
};

const interpolatePath = (path, fraction) => {
  if (!path || path.length === 0) return null;
  if (path.length === 1) return [...path[0], 0];
  if (fraction <= 0) return [...path[0], 0];
  if (fraction >= 1) return [...path[path.length - 1], path.length - 2];

  const segmentLengths = [];
  let totalLength = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const len = Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));
    segmentLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) return [...path[0], 0];

  const targetLength = fraction * totalLength;
  let cumulativeLength = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const len = segmentLengths[i];
    if (cumulativeLength + len >= targetLength) {
      const segFraction = (targetLength - cumulativeLength) / len;
      const p1 = path[i];
      const p2 = path[i + 1];
      const lat = p1[0] + segFraction * (p2[0] - p1[0]);
      const lon = p1[1] + segFraction * (p2[1] - p1[1]);
      return [lat, lon, i];
    }
    cumulativeLength += len;
  }

  return [...path[path.length - 1], path.length - 2];
};

export default function TrackingPage({ userLat, userLon, dispatchData, problem, onReset, onComplete, theme, isSilent: initialIsSilent, requestId }) {
  const isSilent = initialIsSilent || dispatchData?.isSilent;
  const ambStartLat = dispatchData.ambulance.latitude;
  const ambStartLon = dispatchData.ambulance.longitude;
  const [ambLat, setAmbLat] = useState(ambStartLat);
  const [ambLon, setAmbLon] = useState(ambStartLon);
  const [eta, setEta] = useState(dispatchData.etaMins || 8);
  const [arrived, setArrived] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [completedTriggered, setCompletedTriggered] = useState(false);

  // Split-phase states
  const [tripPhase, setTripPhase] = useState('pickup'); // 'pickup' | 'hospital'
  const [otpInput, setOtpInput] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');
  
  // Custom states for V2 features
  const [disguiseOverridden, setDisguiseOverridden] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [activeSpeechStep, setActiveSpeechStep] = useState(null);
  const [showDisguiseMenu, setShowDisguiseMenu] = useState(false);
  const [selectedNewsArticle, setSelectedNewsArticle] = useState(null);

  // Chat states
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const chatEndRef = useRef(null);
  const chatIvRef = useRef(null);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const ambMarkerRef = useRef(null);
  const polylineRef = useRef(null);

  const getFallbackCoords = () => {
    const path = [
      [ambStartLat, ambStartLon],
      [userLat, userLon]
    ];
    if (dispatchData.hospital) {
      path.push([dispatchData.hospital.latitude, dispatchData.hospital.longitude]);
    }
    return path;
  };

  const [routeCoords, setRouteCoords] = useState(getFallbackCoords);
  const [currentRouteIndex, setCurrentRouteIndex] = useState(0);

  // Fetch real-world route from OSRM depending on the trip leg
  useEffect(() => {
    const fetchRoute = async () => {
      try {
        let url = '';
        if (tripPhase === 'pickup') {
          url = `https://router.project-osrm.org/route/v1/driving/${ambStartLon},${ambStartLat};${userLon},${userLat}`;
        } else if (dispatchData.hospital) {
          url = `https://router.project-osrm.org/route/v1/driving/${userLon},${userLat};${dispatchData.hospital.longitude},${dispatchData.hospital.latitude}`;
        } else {
          setRouteCoords([[userLat, userLon], [userLat, userLon]]);
          setEta(1);
          return;
        }
        url += `?geometries=geojson&overview=full`;
        
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.routes && data.routes[0]) {
            const route = data.routes[0];
            const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
            setRouteCoords(coords);
            if (route.duration) {
              setEta(Math.max(1, Math.round(route.duration / 60)));
            }
          } else {
            setRouteCoords(
              tripPhase === 'pickup'
                ? [[ambStartLat, ambStartLon], [userLat, userLon]]
                : (dispatchData.hospital 
                    ? [[userLat, userLon], [dispatchData.hospital.latitude, dispatchData.hospital.longitude]]
                    : [[userLat, userLon], [userLat, userLon]])
            );
          }
        } else {
          setRouteCoords(
            tripPhase === 'pickup'
              ? [[ambStartLat, ambStartLon], [userLat, userLon]]
              : (dispatchData.hospital 
                  ? [[userLat, userLon], [dispatchData.hospital.latitude, dispatchData.hospital.longitude]]
                  : [[userLat, userLon], [userLat, userLon]])
          );
        }
      } catch (err) {
        console.error("OSRM Route fetch failed:", err);
        setRouteCoords(
          tripPhase === 'pickup'
            ? [[ambStartLat, ambStartLon], [userLat, userLon]]
            : (dispatchData.hospital 
                ? [[userLat, userLon], [dispatchData.hospital.latitude, dispatchData.hospital.longitude]]
                : [[userLat, userLon], [userLat, userLon]])
        );
      }
    };
    fetchRoute();
  }, [tripPhase, ambStartLat, ambStartLon, userLat, userLon, dispatchData.hospital]);

  // Initial and periodic polling for request status changes
  useEffect(() => {
    if (!requestId) return;

    const checkStatus = async () => {
      try {
        const response = await fetch(`http://localhost:3000/api/request-status/${requestId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'IN_PROGRESS' && tripPhase !== 'hospital') {
            setTripPhase('hospital');
          }
        }
      } catch (err) {
        console.error("Status polling failed:", err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [requestId, tripPhase]);

  // Verify OTP handler
  const handleVerifyOtp = async (inputCode) => {
    if (!inputCode) return;
    setVerifyingOtp(true);
    setOtpError('');
    try {
      const response = await fetch(`http://localhost:3000/api/request/${requestId}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: inputCode })
      });
      const data = await response.json();
      if (response.ok) {
        setTripPhase('hospital');
      } else {
        setOtpError(data.error || 'Verification failed');
      }
    } catch (err) {
      console.error("OTP verification error:", err);
      setOtpError('Network error. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [userLat, userLon],
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });
    mapRef.current = map;

    const tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

    L.tileLayer(tileUrl, { 
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const userIcon = L.divIcon({
      html: `<div style="font-size: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); display: flex; align-items: center; justify-content: center;">📍</div>`,
      className: 'leaflet-user-marker',
      iconSize: [30, 30],
      iconAnchor: [15, 30]
    });
    L.marker([userLat, userLon], { icon: userIcon }).addTo(map).bindPopup("Your Location");

    const ambulanceIcon = L.divIcon({
      html: `<div style="font-size: 24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); display: flex; align-items: center; justify-content: center;">🚑</div>`,
      className: 'leaflet-amb-marker',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    const ambMarker = L.marker([ambLat, ambLon], { icon: ambulanceIcon }).addTo(map).bindPopup("Ambulance en route");
    ambMarkerRef.current = ambMarker;

    if (dispatchData.hospital) {
      const hospIcon = L.divIcon({
        html: `<div style="font-size: 24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); display: flex; align-items: center; justify-content: center;">🏥</div>`,
        className: 'leaflet-hosp-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      L.marker([dispatchData.hospital.latitude, dispatchData.hospital.longitude], { icon: hospIcon })
        .addTo(map)
        .bindPopup(`<strong>${dispatchData.hospital.name}</strong><br/>ICU Bed Reserved ✓`);
    }

    const polyline = L.polyline(routeCoords, {
      color: '#ef4444',
      weight: 3,
      opacity: 0.7,
      dashArray: '8, 8'
    }).addTo(map);
    polylineRef.current = polyline;

    // Fit bounds initially
    const bounds = L.latLngBounds([[userLat, userLon], [ambLat, ambLon]]);
    if (dispatchData.hospital) {
      bounds.extend([dispatchData.hospital.latitude, dispatchData.hospital.longitude]);
    }
    map.fitBounds(bounds, { padding: [40, 40] });

    const resizeTimeout = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      clearTimeout(resizeTimeout);
      map.remove();
      mapRef.current = null;
      ambMarkerRef.current = null;
      polylineRef.current = null;
    };
  }, [userLat, userLon, dispatchData]);

  // Adjust map bounds dynamically when trip phase transitions
  useEffect(() => {
    if (!mapRef.current) return;
    if (tripPhase === 'hospital' && dispatchData.hospital) {
      const bounds = L.latLngBounds([[userLat, userLon], [dispatchData.hospital.latitude, dispatchData.hospital.longitude]]);
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    } else {
      const bounds = L.latLngBounds([[userLat, userLon], [ambStartLat, ambStartLon]]);
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [tripPhase]);

  // Handle resets and coordinate mapping when transitioning legs
  useEffect(() => {
    setArrived(false);
    setCompletedTriggered(false);
    setCurrentRouteIndex(0);
    if (tripPhase === 'hospital') {
      setAmbLat(userLat);
      setAmbLon(userLon);
      setEta(10);
      setRouteCoords(dispatchData.hospital 
        ? [[userLat, userLon], [dispatchData.hospital.latitude, dispatchData.hospital.longitude]]
        : [[userLat, userLon], [userLat, userLon]]
      );
    } else {
      setAmbLat(ambStartLat);
      setAmbLon(ambStartLon);
      setEta(dispatchData.etaMins || 8);
      setRouteCoords(dispatchData.hospital 
        ? [[ambStartLat, ambStartLon], [userLat, userLon], [dispatchData.hospital.latitude, dispatchData.hospital.longitude]]
        : [[ambStartLat, ambStartLon], [userLat, userLon]]
      );
    }
  }, [tripPhase]);

  // Theme changes are handled via CSS filter wrapper class leaflet-dark-mode

  // Update ambulance marker & polyline path reactively on coordinates updates
  useEffect(() => {
    if (mapRef.current && ambMarkerRef.current && polylineRef.current) {
      const newLatLng = L.latLng(ambLat, ambLon);
      ambMarkerRef.current.setLatLng(newLatLng);

      const remainingPath = routeCoords.slice(currentRouteIndex);
      if (remainingPath.length > 0) {
        polylineRef.current.setLatLngs([newLatLng, ...remainingPath.slice(1)]);
      }
    }
  }, [ambLat, ambLon, routeCoords, currentRouteIndex]);

  const CHECKLIST = [
    { id: 'gate',  label: 'Unlock the front gate/door for paramedics' },
    { id: 'pets',  label: 'Secure household pets in a separate room' },
    { id: 'light', label: 'Turn on outdoor lights (if it is nighttime)' },
    { id: 'meds',  label: 'Gather current prescriptions and insurance card' },
  ];
  const [checkedItems, setCheckedItems] = useState({});
  const toggleCheck = (id) => setCheckedItems(p => ({ ...p, [id]: !p[id] }));
  const doneCount = Object.values(checkedItems).filter(Boolean).length;

  // Poll Chat Messages
  useEffect(() => {
    if (!requestId) return;

    const fetchChat = async () => {
      try {
        const r = await fetch(`http://localhost:3000/api/request/${requestId}/chat`);
        if (r.ok) {
          const data = await r.json();
          if (data.length > chatMessages.length) {
            const delta = data.length - chatMessages.length;
            if (!isChatOpen) {
              setUnreadCount(prev => prev + delta);
            }
          }
          setChatMessages(data);
        }
      } catch (err) {
        console.error("Chat polling error:", err);
      }
    };

    fetchChat();
    chatIvRef.current = setInterval(fetchChat, 2000);
    return () => clearInterval(chatIvRef.current);
  }, [requestId, chatMessages.length, isChatOpen]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  // Movement animation along OSRM road coordinates
  useEffect(() => {
    if (routeCoords.length === 0) return;

    // Determine target location (User in pickup phase, Hospital in hospital phase)
    let targetLat = userLat;
    let targetLon = userLon;
    if (tripPhase === 'hospital' && dispatchData.hospital) {
      targetLat = dispatchData.hospital.latitude;
      targetLon = dispatchData.hospital.longitude;
    }

    // Find coordinate closest to target location in routeCoords
    let targetIndex = routeCoords.length - 1;
    let minDistance = Infinity;
    for (let i = 0; i < routeCoords.length; i++) {
      const dist = Math.pow(routeCoords[i][0] - targetLat, 2) + Math.pow(routeCoords[i][1] - targetLon, 2);
      if (dist < minDistance) {
        minDistance = dist;
        targetIndex = i;
      }
    }

    const subPath = routeCoords.slice(0, targetIndex + 1);

    const TOTAL_DURATION_MS = 30000; // 30 seconds
    const INTERVAL_MS = 50; // 20 fps
    const TOTAL_STEPS = TOTAL_DURATION_MS / INTERVAL_MS; // 600 steps
    let currentStep = 0;
    const initialEta = eta;
    const decrementStep = Math.max(1, Math.floor(TOTAL_STEPS / initialEta));

    const iv = setInterval(() => {
      if (currentStep >= TOTAL_STEPS) {
        clearInterval(iv);
        setArrived(true);
        setCurrentRouteIndex(targetIndex);
        setAmbLat(routeCoords[targetIndex][0]);
        setAmbLon(routeCoords[targetIndex][1]);

        if (tripPhase === 'hospital') {
          console.log("[ANIMATION] Ambulance reached hospital. Triggering post-care transition in 3.5s...");
          setTimeout(() => {
            console.log("[ANIMATION] Timeout fired. Calling onComplete...");
            if (onComplete) onComplete();
          }, 3500);
        }
        return;
      }

      const fraction = currentStep / TOTAL_STEPS;
      const interpolated = interpolatePath(subPath, fraction);

      if (interpolated) {
        setAmbLat(interpolated[0]);
        setAmbLon(interpolated[1]);
        setCurrentRouteIndex(interpolated[2]);
      }

      if (currentStep % decrementStep === 0) {
        setEta(p => Math.max(1, p - 1));
      }

      currentStep++;
    }, INTERVAL_MS);

    return () => clearInterval(iv);
  }, [routeCoords, userLat, userLon, tripPhase, dispatchData.hospital, onComplete]);

  // Audio Synthesis Guidelines Reader
  const guidelines = FIRST_AID_GUIDELINES[problem] || FIRST_AID_GUIDELINES['Other / Not Sure'];

  const speakStep = (idx) => {
    if (idx >= guidelines.length) {
      setIsPlayingAudio(false);
      setActiveSpeechStep(null);
      return;
    }

    window.speechSynthesis.cancel();
    setActiveSpeechStep(idx);

    const step = guidelines[idx];
    const textToSpeak = `${step.title}. ${step.text}`;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    utterance.onend = () => {
      speakStep(idx + 1);
    };

    utterance.onerror = (e) => {
      console.error("Speech error:", e);
      setIsPlayingAudio(false);
      setActiveSpeechStep(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  const startReadingGuidelines = () => {
    setIsPlayingAudio(true);
    speakStep(0);
  };

  const stopReadingGuidelines = () => {
    window.speechSynthesis.cancel();
    setIsPlayingAudio(false);
    setActiveSpeechStep(null);
  };

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !requestId) return;

    const text = chatInput;
    setChatInput('');

    // Optimistic message update
    const tempMsg = {
      id: 'temp-' + Date.now(),
      sender: 'user',
      message: text,
      createdAt: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, tempMsg]);

    try {
      const r = await fetch(`http://localhost:3000/api/request/${requestId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: 'user', message: text })
      });
      if (!r.ok) {
        setChatMessages(prev => prev.filter(m => m.id !== tempMsg.id));
        alert("Failed to send message. Please try again.");
      }
    } catch (err) {
      console.error("Send chat failed:", err);
      setChatMessages(prev => prev.filter(m => m.id !== tempMsg.id));
    }
  };



  const otp = dispatchData.otp || '----';
  const badge = dispatchData.ambulance.driverBadge || 'PM-0000';

  // Mock News Articles for Disguised Mode
  const MOCK_NEWS_ARTICLES = [
    {
      id: 'emergency-guide',
      title: problem === 'Cardiac Arrest' ? 'Understanding Cardiac Care & CPR Techniques' :
             problem === 'Accident / Trauma' ? 'Managing Physical Trauma and Bleeding Emergencies' :
             problem === 'Breathing Difficulty' ? 'Dealing with Respiratory Distress: A Practical Walkthrough' :
             problem === 'Unconscious Person' ? 'How to Assist an Unconscious Individual Correctly' :
             problem === 'Stroke Symptoms' ? 'Stroke Symptoms & F.A.S.T. Assessment Guidelines' :
             'Essential First-Aid Steps for Common Home Emergencies',
      category: 'Health & Wellness',
      readTime: '3 min read',
      content: guidelines,
      isRealGuide: true
    },
    {
      id: 'water-hydration',
      title: 'Optimal Hydration: How Much Water Do You Actually Need Daily?',
      category: 'Life Hacks',
      readTime: '2 min read',
      isRealGuide: false,
      text: 'Water is the building block of life. While the common rule of thumb is 8 glasses, actual requirements vary based on body weight, temperature, and activity levels. Nutritionists recommend calculating your hydration intake by drinking half your weight in ounces.'
    },
    {
      id: 'plants-guide',
      title: 'Top 5 Indoor Plants to Improve Home Oxygen and Air Quality',
      category: 'Gardening',
      readTime: '4 min read',
      isRealGuide: false,
      text: 'Breathe cleaner air by bringing nature indoors. Snake Plants (Sansevieria), Peace Lilies, and Spider Plants are highly effective at absorbing airborne toxins like formaldehyde, benzene, and carbon monoxide, while releasing pure oxygen during nighttime.'
    }
  ];

  // RENDER DISGUISED UI
  if (isSilent && !disguiseOverridden) {
    return (
      <div className="disguised-screen animate-in" style={{
        background: 'var(--bg)',
        minHeight: '100%',
        color: 'var(--text)',
        fontFamily: 'system-ui, sans-serif'
      }}>
        {/* Fake Header */}
        <header className="disguised-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.2rem' }}>📰</span>
            <span style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.02em' }}>DailyDigest News</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} /> Live Feed
            </span>
            <button 
              onClick={() => setShowDisguiseMenu(!showDisguiseMenu)} 
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        {/* Inconspicuous settings override dropdown */}
        {showDisguiseMenu && (
          <div className="disguise-dropdown animate-in" style={{
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border)',
            padding: '12px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Emergency actions available</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                onClick={() => { setDisguiseOverridden(true); setShowDisguiseMenu(false); }}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  padding: '6px 12px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Compass size={12} /> Show Map Radar
              </button>
              <button 
                onClick={onReset}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-muted)',
                  padding: '6px 12px',
                  fontSize: '0.7rem',
                  cursor: 'pointer'
                }}
              >
                Cancel Dispatch
              </button>
            </div>
          </div>
        )}

        {/* Fake Shipment Tracker Card (subtly represents ambulance ETA / Badge / OTP) */}
        <div style={{ padding: 16 }}>
          <div className="card" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', fontWeight: 700 }}>Active Delivery Shipment</span>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: 2 }}>Order #{dispatchData.bookingId.slice(0, 8).toUpperCase()}</h3>
              </div>
              <span style={{
                fontSize: '0.7rem',
                background: arrived ? 'var(--green-glow)' : 'var(--accent-glow)',
                color: arrived ? 'var(--green)' : 'var(--accent)',
                padding: '3px 8px',
                borderRadius: 99,
                fontWeight: 700
              }}>
                {tripPhase === 'pickup' 
                  ? (arrived ? 'Arrived / Courier at Door' : 'Out for Delivery')
                  : (arrived ? 'Delivered / Completed' : 'In Transit to Hub')}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '14px 0', background: 'var(--bg-elevated)', borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: '1.5rem' }}>📦</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Courier: SwiftDelivery Logistics</p>
                <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  {tripPhase === 'pickup'
                    ? (arrived ? 'Courier at Door' : `ETA: ${eta} mins`)
                    : (arrived ? 'Delivered' : `Hub ETA: ${eta} mins`)}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)' }}>Secure Pin</span>
                <p style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', color: 'var(--green)' }}>{otp}</p>
              </div>
            </div>

            {/* Inconspicuous Courier Pin Verification Widget */}
            {tripPhase === 'pickup' && (
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8 }}>Verify Courier Pin:</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Courier Pin"
                    value={otpInput}
                    onChange={e => setOtpInput(e.target.value.replace(/\D/g, ''))}
                    style={{
                      flex: 1,
                      background: 'var(--bg-elevated)',
                      border: otpError ? '1px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      color: 'var(--text)',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      textAlign: 'center',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={() => handleVerifyOtp(otpInput)}
                    disabled={verifyingOtp || otpInput.length < 4}
                    style={{
                      background: 'var(--blue)',
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: otpInput.length < 4 ? 0.6 : 1
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => handleVerifyOtp(otp)}
                    disabled={verifyingOtp}
                    style={{
                      background: 'var(--green)',
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      padding: '6px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Quick Verify"
                  >
                    ⚡
                  </button>
                </div>
                {otpError && (
                  <p style={{ color: 'var(--accent)', fontSize: '0.7rem', marginTop: 4 }}>{otpError}</p>
                )}
              </div>
            )}

            {/* Inconspicuous delivery timeline */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 12 }}>
              <span>Courier Badge: <strong style={{ fontFamily: 'monospace' }}>{badge}</strong></span>
              <span>ICU Bed Reserved: <strong style={{ color: 'var(--green)' }}>Yes</strong></span>
            </div>
          </div>
        </div>

        {/* Fake News Feed Section */}
        <div style={{ padding: '0 16px 80px' }}>
          <p className="section-title">Today's Reading List</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {MOCK_NEWS_ARTICLES.map(article => (
              <div 
                key={article.id} 
                className="card news-card-interactive" 
                onClick={() => setSelectedNewsArticle(article)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 16,
                  cursor: 'pointer',
                  transition: 'transform 0.2s, border-color 0.2s',
                  textAlign: 'left'
                }}
              >
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: article.isRealGuide ? 'var(--accent)' : 'var(--blue)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>{article.category}</span>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '6px 0 8px', lineHeight: 1.35 }}>{article.title}</h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {article.isRealGuide 
                    ? `Critical wellness actions. Tap to read the full step-by-step guideline overview.` 
                    : article.text.slice(0, 100) + '...'}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: '0.7rem', color: 'var(--text-faint)' }}>
                  <span>{article.readTime}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Read Article →</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Article Reader Modal (Disguised Guidelines Screen) */}
        {selectedNewsArticle && (
          <div className="modal-overlay active" style={{ zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setSelectedNewsArticle(null)}>
            <div className="modal-sheet animate-slide-up" style={{ padding: 20, width: '100%', maxWidth: 430, maxHeight: '85dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700 }}>{selectedNewsArticle.category}</span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 4 }}>{selectedNewsArticle.title}</h3>
                </div>
                <button className="close-btn" onClick={() => setSelectedNewsArticle(null)} aria-label="Close">
                  <X size={20} />
                </button>
              </div>

              {selectedNewsArticle.isRealGuide ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, background: 'var(--bg-elevated)', padding: 10, borderRadius: 8 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Audio Player Available</span>
                    <button
                      onClick={isPlayingAudio ? stopReadingGuidelines : startReadingGuidelines}
                      style={{
                        background: isPlayingAudio ? 'var(--accent)' : 'var(--blue)',
                        border: 'none',
                        borderRadius: 20,
                        color: '#fff',
                        padding: '6px 14px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      {isPlayingAudio ? '⏹ Stop Listening' : '🎧 Listen to Article'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {selectedNewsArticle.content.map((g, idx) => (
                      <div 
                        key={idx} 
                        style={{
                          border: activeSpeechStep === idx ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: activeSpeechStep === idx ? 'rgba(239, 68, 68, 0.05)' : 'var(--bg-card)',
                          borderRadius: 'var(--radius-sm)',
                          padding: 12,
                          transition: 'all 0.3s'
                        }}
                      >
                        <div style={{ display: 'flex', gap: 10 }}>
                          <span style={{
                            width: 20, height: 20,
                            background: activeSpeechStep === idx ? 'var(--accent)' : 'var(--bg-elevated)',
                            borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', fontWeight: 800,
                            color: activeSpeechStep === idx ? '#fff' : 'var(--text-muted)',
                            flexShrink: 0
                          }}>{idx + 1}</span>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: '0.85rem', color: activeSpeechStep === idx ? 'var(--accent)' : 'var(--text)', textAlign: 'left' }}>{g.title}</p>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.35, textAlign: 'left' }}>{g.text}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'left' }}>
                  {selectedNewsArticle.text}
                </p>
              )}
              <button className="btn btn-full btn-secondary" style={{ marginTop: 24 }} onClick={() => setSelectedNewsArticle(null)}>Close Article</button>
            </div>
          </div>
        )}

        {/* Floating Disguised Support Chat Trigger */}
        <button 
          className="floating-chat-btn" 
          onClick={() => { setIsChatOpen(true); setUnreadCount(0); }}
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 8px 24px var(--accent-glow)',
            border: 'none',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 90
          }}
        >
          <MessageSquare size={24} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: -2, right: -2,
              background: 'var(--green)',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: 800,
              minWidth: 18, height: 18,
              borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid var(--bg)'
            }}>{unreadCount}</span>
          )}
        </button>

        {/* Disguised Chat Drawer Overlay */}
        {isChatOpen && (
          <div className="modal-overlay active" style={{ zIndex: 1100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setIsChatOpen(false)}>
            <div className="modal-sheet animate-slide-up" style={{ padding: 0, width: '100%', maxWidth: 430, height: '70dvh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              
              {/* Disguised Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>Support & courier instructions</h3>
                  <p style={{ fontSize: '0.72rem', color: 'var(--green)', marginTop: 2 }}>✓ Delivery Secure Connection</p>
                </div>
                <button className="close-btn" onClick={() => setIsChatOpen(false)} aria-label="Close">
                  <X size={20} />
                </button>
              </div>

              {/* Chat Message Box */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {chatMessages.length === 0 ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-faint)', padding: '0 20px' }}>
                    <AlertCircle size={24} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                    <p style={{ fontSize: '0.8rem', lineHeight: 1.3 }}>Need to drop off custom instructions? Leave a message here. (e.g. "Use back gate", "Sirens off").</p>
                  </div>
                ) : (
                  chatMessages.map(msg => (
                    <div 
                      key={msg.id} 
                      style={{
                        alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{
                        background: msg.sender === 'user' ? 'var(--blue)' : 'var(--bg-elevated)',
                        color: msg.sender === 'user' ? '#fff' : 'var(--text)',
                        padding: '10px 14px',
                        borderRadius: 14,
                        borderTopRightRadius: msg.sender === 'user' ? 2 : 14,
                        borderTopLeftRadius: msg.sender === 'user' ? 14 : 2,
                        fontSize: '0.85rem',
                        lineHeight: 1.35,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                      }}>
                        {msg.message}
                      </div>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)', marginTop: 4, display: 'block', textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
                        {msg.sender === 'user' ? 'You' : 'Courier Agent'} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Form */}
              <form onSubmit={sendChatMessage} style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <input
                  type="text"
                  placeholder="Type a logistics message..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: '99px',
                    padding: '10px 16px',
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
                <button 
                  type="submit" 
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: 'var(--blue)',
                    border: 'none',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  aria-label="Send"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // RENDER NORMAL UI
  return (
    <div className={`map-screen animate-in ${theme === 'dark' ? 'leaflet-dark-mode' : ''}`}>
      <div className="map-top">
        <div ref={mapContainerRef} style={{ height: '100%', width: '100%', borderRadius: 'inherit' }} />
      </div>

      <div className="tracking-sheet scrollable" style={{ paddingBottom: 90 }}>
        <div className="sheet-handle" />
        <div className="tracking-top-row">
          <CheckCircle2 size={28} color="var(--green)" />
          <div>
            <h2>
              {tripPhase === 'pickup'
                ? (arrived ? 'Ambulance Arrived!' : 'Driver is on the way')
                : (arrived ? 'Arrived at Hospital!' : 'Heading to Hospital')}
            </h2>
            <p>Booking #{dispatchData.bookingId.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="eta-pill">
            <span className="eta-num">{arrived ? '✓' : eta}</span>
            <span className="eta-unit">{arrived ? 'Here' : 'min ETA'}</span>
          </div>
        </div>

        <div className="info-rows">
          {/* OTP Verification Row */}
          {tripPhase === 'pickup' && (
            <div className="info-row" style={{ background: 'rgba(239,68,68,0.07)', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div>
                <span className="info-key" style={{ color: 'var(--accent)' }}>🔐 Verify Driver OTP</span>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-faint)', marginTop: 2 }}>Show this code to your paramedic for identity confirmation</p>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 900, letterSpacing: 6, color: 'var(--accent)' }}>{otp}</span>
            </div>
          )}
          {dispatchData.pickupAddress && (
            <div className="info-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <span className="info-key">📍 Pickup Location</span>
              <span className="info-val" style={{ fontSize: '0.8rem', textAlign: 'left', lineHeight: 1.4, color: 'var(--text-muted)' }}>
                {dispatchData.pickupAddress}
              </span>
            </div>
          )}
          <div className="info-row">
            <span className="info-key">🪪 Paramedic Badge</span>
            <span className="info-val" style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--blue)' }}>{badge}</span>
          </div>
          {problem && (
            <div className="info-row">
              <span className="info-key">Emergency</span>
              <span className="info-val" style={{ color: '#f87171' }}>{problem}</span>
            </div>
          )}
          {dispatchData.hospital && (
            <div className="info-row">
              <span className="info-key">Destination</span>
              <div style={{ textAlign: 'right' }}>
                <div className="info-val" style={{ color: '#34d399', fontSize: '0.82rem' }}>{dispatchData.hospital.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--green)', marginTop: 1 }}>✓ 1 ICU Bed Secured</div>
              </div>
            </div>
          )}
          <div className="info-row">
            <span className="info-key">Provider</span>
            <span className="info-val">{dispatchData.ambulance.providerName}</span>
          </div>
        </div>

        {/* First Aid Guidelines Section with TTS Reader */}
        <div className="first-aid-box">
          <div className="first-aid-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={16} color="var(--accent)" />
              <h4 style={{ margin: 0 }}>Emergency Actions while waiting:</h4>
            </div>
            <button
              onClick={isPlayingAudio ? stopReadingGuidelines : startReadingGuidelines}
              className={`tts-btn ${isPlayingAudio ? 'active' : ''}`}
              style={{
                background: isPlayingAudio ? 'var(--accent)' : 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '99px',
                padding: '5px 12px',
                color: isPlayingAudio ? '#ffffff' : 'var(--text)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {isPlayingAudio ? '⏹ Stop Audio' : '🔊 Read Aloud'}
            </button>
          </div>
          <div className="first-aid-list">
            {guidelines.map((g, idx) => (
              <div 
                key={idx} 
                className="first-aid-item" 
                style={{
                  border: activeSpeechStep === idx ? '1px solid var(--accent)' : '1px solid transparent',
                  background: activeSpeechStep === idx ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                  borderRadius: 8,
                  padding: '8px 6px',
                  transition: 'all 0.3s',
                  display: 'flex',
                  gap: 12,
                  textAlign: 'left'
                }}
              >
                <span className="first-aid-num" style={{
                  background: activeSpeechStep === idx ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: activeSpeechStep === idx ? '#fff' : 'var(--text-muted)'
                }}>{idx + 1}</span>
                <div>
                  <p className="first-aid-title" style={{ color: activeSpeechStep === idx ? 'var(--accent)' : 'var(--text)' }}>{g.title}</p>
                  <p className="first-aid-text">{g.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ready-to-Go Checklist */}
        <div className="readygo-checklist">
          <div className="readygo-header">
            <ClipboardList size={15} color="var(--green)" />
            <span>Ready-to-Go Checklist</span>
            <span className="readygo-count">{doneCount}/{CHECKLIST.length} done</span>
          </div>
          <div className="readygo-items">
            {CHECKLIST.map(item => (
              <button key={item.id} className={`readygo-item${checkedItems[item.id] ? ' checked' : ''}`} onClick={() => toggleCheck(item.id)}>
                {checkedItems[item.id]
                  ? <CheckSquare size={16} color="var(--green)" />
                  : <Square size={16} color="var(--text-faint)" />}
                <span className="readygo-label">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Driver Card */}
        <div className="driver-card interactive" onClick={() => setShowDetails(true)}>
          <div className="driver-ava">👨‍⚕️</div>
          <div style={{ flex: 1 }}>
            <div className="driver-name-row">
              <p className="driver-name">{dispatchData.ambulance.driverName}</p>
              <div className="rating-pill">
                <Star size={11} fill="var(--yellow)" color="var(--yellow)" />
                <span>{dispatchData.ambulance.driverRating || '4.8'}</span>
              </div>
            </div>
            <p className="driver-company">{dispatchData.ambulance.providerName} • <span style={{ color: 'var(--text-faint)' }}>Tap for full profile</span></p>
          </div>
          <a href={`tel:${dispatchData.ambulance.phone}`} className="call-circle" onClick={e => e.stopPropagation()}>
            <PhoneCall size={18} color="white" />
          </a>
        </div>

        {/* Interactive OTP Verification or Patient On Board widget */}
        {tripPhase === 'pickup' ? (
          <div className="otp-verification-card card animate-in" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '20px',
            marginTop: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '1.2rem' }}>🔐</span>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Confirm Identity & Start Trip</h3>
            </div>
            
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '16px' }}>
              Show the 4-digit code to the paramedic or enter it below to confirm your pickup and start the journey to {dispatchData.hospital ? dispatchData.hospital.name : 'the hospital'}.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: 'auto' }}>Your OTP Code:</span>
              <span style={{ fontFamily: 'monospace', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '6px', color: 'var(--accent)' }}>{otp}</span>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                maxLength={4}
                placeholder="Enter 4-digit OTP"
                value={otpInput}
                onChange={e => setOtpInput(e.target.value.replace(/\D/g, ''))}
                style={{
                  flex: 1,
                  background: 'var(--bg-elevated)',
                  border: otpError ? '1px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 14px',
                  color: 'var(--text)',
                  fontSize: '0.95rem',
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  letterSpacing: '2px',
                  outline: 'none'
                }}
              />
              <button
                onClick={() => handleVerifyOtp(otpInput)}
                disabled={verifyingOtp || otpInput.length < 4}
                className="btn btn-primary"
                style={{
                  padding: '10px 20px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  opacity: otpInput.length < 4 ? 0.6 : 1,
                  cursor: otpInput.length < 4 ? 'not-allowed' : 'pointer'
                }}
              >
                {verifyingOtp ? 'Verifying...' : 'Verify'}
              </button>
            </div>

            {otpError && (
              <p style={{ color: 'var(--accent)', fontSize: '0.75rem', marginTop: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={14} /> {otpError}
              </p>
            )}

            <div style={{ position: 'relative', margin: '20px 0 16px', textAlign: 'center' }}>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'var(--border)', zIndex: 1 }} />
              <span style={{ position: 'relative', background: 'var(--bg-card)', padding: '0 12px', fontSize: '0.7rem', color: 'var(--text-faint)', zIndex: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Demo Simulator</span>
            </div>

            <button
              onClick={() => handleVerifyOtp(otp)}
              disabled={verifyingOtp}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, var(--green) 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'transform 0.2s',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              🚀 Verify OTP & Start Trip (Driver Simulation)
            </button>
          </div>
        ) : (
          <div className="patient-transport-card card animate-in" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '20px',
            marginTop: '16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            borderLeft: '4px solid var(--green)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '1.2rem' }}>🚑</span>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--green)' }}>Patient On Board</h3>
            </div>
            
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              OTP successfully verified. The ambulance has departed with the patient and is heading to <strong>{dispatchData.hospital ? dispatchData.hospital.name : 'the hospital'}</strong>.
            </p>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px', background: 'rgba(16,185,129,0.08)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(16,185,129,0.15)' }}>
              <div style={{ fontSize: '1.5rem' }}>🏥</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Destination Care Facility</p>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, margin: '2px 0 0' }}>{dispatchData.hospital ? dispatchData.hospital.name : 'Emergency Center'}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  fontSize: '0.7rem',
                  background: 'var(--green-glow)',
                  color: 'var(--green)',
                  padding: '3px 8px',
                  borderRadius: 99,
                  fontWeight: 700,
                  display: 'inline-block'
                }}>
                  ICU Bed Secured ✓
                </span>
              </div>
            </div>
          </div>
        )}

        {arrived ? (
          <div className="arrived-banner" style={{
            background: tripPhase === 'hospital' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.08)',
            border: tripPhase === 'hospital' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(59, 130, 246, 0.2)',
            marginTop: '16px'
          }}>
            <CheckCircle2 size={20} color={tripPhase === 'hospital' ? "var(--green)" : "var(--blue)"} />
            <span>
              {tripPhase === 'hospital'
                ? 'Ambulance has arrived at the hospital! Preparing post-care summary…'
                : 'Ambulance has arrived! Please verify the OTP above to start the transit.'}
            </span>
          </div>
        ) : (
          <button className="btn btn-full btn-danger" style={{ marginTop: 16 }} onClick={onReset}>Cancel Emergency Request</button>
        )}
      </div>

      {/* Floating Action Button for Secure Live Chat (Normal View) */}
      <button 
        className="floating-chat-btn" 
        onClick={() => { setIsChatOpen(true); setUnreadCount(0); }}
        style={{
          position: 'absolute',
          bottom: arrived ? 100 : 20,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 8px 24px var(--accent-glow)',
          border: 'none',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 90
        }}
      >
        <MessageSquare size={24} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -2, right: -2,
            background: 'var(--green)',
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 800,
            minWidth: 18, height: 18,
            borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
            border: '2px solid var(--bg)'
          }}>{unreadCount}</span>
        )}
      </button>

      {/* Live Chat Drawer (Normal View) */}
      {isChatOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setIsChatOpen(false)}>
          <div className="modal-sheet animate-slide-up" style={{ padding: 0, width: '100%', maxWidth: 430, height: '70dvh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>Chat with {dispatchData.ambulance.driverName}</h3>
                <p style={{ fontSize: '0.72rem', color: 'var(--green)', marginTop: 2 }}>✓ Secure Emergency Line</p>
              </div>
              <button className="close-btn" onClick={() => setIsChatOpen(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {chatMessages.length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-faint)', padding: '0 20px' }}>
                  <MessageSquare size={24} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                  <p style={{ fontSize: '0.8rem', lineHeight: 1.3 }}>No messages yet. Send a note to the paramedic (e.g. "Use back gate", "Sirens off").</p>
                </div>
              ) : (
                chatMessages.map(msg => (
                  <div 
                    key={msg.id} 
                    style={{
                      alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{
                      background: msg.sender === 'user' ? 'var(--blue)' : 'var(--bg-elevated)',
                      color: msg.sender === 'user' ? '#fff' : 'var(--text)',
                      padding: '10px 14px',
                      borderRadius: 14,
                      borderTopRightRadius: msg.sender === 'user' ? 2 : 14,
                      borderTopLeftRadius: msg.sender === 'user' ? 14 : 2,
                      fontSize: '0.85rem',
                      lineHeight: 1.35,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                    }}>
                      {msg.message}
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)', marginTop: 4, display: 'block', textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
                      {msg.sender === 'user' ? 'You' : dispatchData.ambulance.driverName} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={sendChatMessage} style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <input
                type="text"
                placeholder="Type a message to the driver..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                style={{
                  flex: 1,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '99px',
                  padding: '10px 16px',
                  color: 'var(--text)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
              <button 
                type="submit" 
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: 'var(--blue)',
                  border: 'none',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                aria-label="Send"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Driver/Provider Details Modal Bottom Sheet */}
      {showDetails && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowDetails(false)}>
          <div className="modal-sheet animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Medical Dispatcher Profile</h3>
              <button className="close-btn" onClick={() => setShowDetails(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-scroll-content">
              {/* Profile Card Section */}
              <div className="profile-hero-card">
                <span className="profile-large-avatar">👨‍⚕️</span>
                <h2>{dispatchData.ambulance.driverName}</h2>
                <p className="certification-badge">Certified Paramedic / BLS Responder</p>
                <div className="profile-stats-grid">
                  <div className="profile-stat-box">
                    <span className="stat-highlight-val">⭐ {dispatchData.ambulance.driverRating || '4.8'}</span>
                    <span className="stat-desc-lbl">Driver Rating</span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="stat-highlight-val">6+ Yrs</span>
                    <span className="stat-desc-lbl">Experience</span>
                  </div>
                  <div className="profile-stat-box">
                    <span className="stat-highlight-val">100%</span>
                    <span className="stat-desc-lbl">Incident Sync</span>
                  </div>
                </div>
              </div>

              {/* Vehicle & Care Provider Details */}
              <div className="details-group">
                <h4 className="group-title"><Truck size={16} /> Ambulance Details</h4>
                <div className="details-list">
                  <div className="details-row">
                    <span className="details-lbl">Unit Class:</span>
                    <span className="details-val">{dispatchData.ambulance.ambulanceType || 'ALS'} (Advanced Life Support)</span>
                  </div>
                  <div className="details-row">
                    <span className="details-lbl">License Plate:</span>
                    <span className="details-val font-mono">DL 3C AB 4920</span>
                  </div>
                  <div className="details-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                    <span className="details-lbl">Onboard Equipment:</span>
                    <div className="equipment-tag-wrap">
                      {['Oxygen Cylinder', 'Defibrillator (AED)', 'Ventilator', 'Vital Monitor', 'Trauma Kit'].map(eq => (
                        <span key={eq} className="equipment-tag">{eq}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="details-group">
                <h4 className="group-title"><Landmark size={16} /> Provider Information</h4>
                <div className="details-list">
                  <div className="details-row">
                    <span className="details-lbl">Care Provider:</span>
                    <span className="details-val">{dispatchData.ambulance.providerName}</span>
                  </div>
                  <div className="details-row">
                    <span className="details-lbl">Provider Type:</span>
                    <span className="details-val">{dispatchData.ambulance.providerType || 'PRIVATE'}</span>
                  </div>
                  <div className="details-row">
                    <span className="details-lbl">Dispatch Hotline:</span>
                    <a href="tel:+9118004567890" className="details-val details-link">+91 1800 456 7890</a>
                  </div>
                </div>
              </div>

              <div className="details-group" style={{ marginBottom: 20 }}>
                <h4 className="group-title"><Heart size={16} /> Secured Booking Status</h4>
                <div className="details-list">
                  <div className="details-row">
                    <span className="details-lbl">Booking Ref:</span>
                    <span className="details-val font-mono">{dispatchData.bookingId.toUpperCase()}</span>
                  </div>
                  {dispatchData.hospital && (
                    <div className="details-row">
                      <span className="details-lbl">Reserved Bed:</span>
                      <span className="details-val" style={{ color: 'var(--green)', fontWeight: 600 }}>1 ICU Bed at {dispatchData.hospital.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button className="btn btn-full btn-primary" onClick={() => setShowDetails(false)}>Close Dispatch Details</button>
          </div>
        </div>
      )}
    </div>
  );
}
