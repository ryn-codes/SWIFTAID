import { useState, useEffect, useRef } from 'react';
import { Phone, Mic, MicOff, VolumeX, AlertCircle, Loader2, Play, Square } from 'lucide-react';

const API_BASE_URL = 'http://localhost:3000/api';

export default function HomePage({ phone, setPhone, onNext, stats }) {
  const [isSilent, setIsSilent] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [detectedCategory, setDetectedCategory] = useState('');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [selectedLang, setSelectedLang] = useState(() => {
    const navLang = navigator.language;
    if (navLang && navLang.toLowerCase().startsWith('en')) {
      return 'en-IN'; // Indian English is the default context
    }
    return navLang || 'en-IN';
  });

  const LANGUAGES = [
    { code: 'en-IN', label: 'English (India)' },
    { code: 'en-US', label: 'English (US)' },
    { code: 'en-GB', label: 'English (UK)' },
    { code: 'en-AU', label: 'English (Australia)' },
    { code: 'en-CA', label: 'English (Canada)' },
    { code: 'hi-IN', label: 'Hindi (हिंदी)' },
    { code: 'bn-IN', label: 'Bengali (বাংলা)' },
    { code: 'ta-IN', label: 'Tamil (தமிழ்)' },
    { code: 'te-IN', label: 'Telugu (తెలుగు)' },
    { code: 'es-ES', label: 'Spanish (Español)' },
    { code: 'fr-FR', label: 'French (Français)' },
    { code: 'ar-SA', label: 'Arabic (العربية)' },
  ];

  const mediaRecorderRef = useRef(null);
  const countdownRef = useRef(null);
  const transcriptRef = useRef('');
  const isCancelledRef = useRef(false);
  const silenceTimeoutRef = useRef(null);
  const initialSilenceTimeoutRef = useRef(null);

  const audioContextRef = useRef(null);
  const analyserNodeRef = useRef(null);
  const audioStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const chunksRef = useRef([]);
  const volumeBarRef = useRef(null);
  const visualizerBarsRef = useRef(null);

  const cleanupVisualizer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const cleanupAudio = () => {
    cleanupVisualizer();
    if (initialSilenceTimeoutRef.current) clearTimeout(initialSilenceTimeoutRef.current);
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Stop recorder error:", err);
      }
    }
    mediaRecorderRef.current = null;

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
    }
    analyserNodeRef.current = null;
  };

  useEffect(() => {
    return () => {
      cleanupAudio();
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (isListening) {
      startListening();
    }
  }, [selectedLang]);

  const startVolumeCheckLoop = () => {
    if (!analyserNodeRef.current) return;

    const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount);
    let silenceStart = null;
    const SILENCE_THRESHOLD = 8; // Low frequency amplitude threshold
    const SILENCE_DURATION_MS = 3200; // Auto-stop after 3.2s of silence

    const checkVolume = () => {
      if (!analyserNodeRef.current) return;
      analyserNodeRef.current.getByteFrequencyData(dataArray);

      // Average frequency volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Realtime Volume scale for UI pulse
      const volPct = Math.min(1, average / 128);
      if (volumeBarRef.current) {
        volumeBarRef.current.style.transform = `scale(${1 + volPct * 0.45})`;
      }

      // Equalizer bars animation
      if (visualizerBarsRef.current) {
        const bars = visualizerBarsRef.current.children;
        for (let i = 0; i < bars.length; i++) {
          const freqValue = dataArray[i % dataArray.length] || 0;
          const heightPct = Math.max(10, (freqValue / 255) * 100);
          bars[i].style.height = `${heightPct}%`;
        }
      }

      // Silence Detection
      if (average < SILENCE_THRESHOLD) {
        if (silenceStart === null) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > SILENCE_DURATION_MS) {
          console.log(`Silence detected for ${SILENCE_DURATION_MS}ms. Stopping recording...`);
          stopListening();
          return;
        }
      } else {
        silenceStart = null; // reset silence timer when voice is detected
      }

      animationFrameRef.current = requestAnimationFrame(checkVolume);
    };

    animationFrameRef.current = requestAnimationFrame(checkVolume);
  };

  const startListening = async () => {
    if (!phone || phone.trim().length < 7) {
      alert("Please enter your phone number first.");
      return;
    }
    // Clean up any existing instances
    cleanupAudio();

    setIsListening(true);
    setVoiceTranscript('');
    setDetectedCategory('');
    setVoiceError(null);
    setCountdown(null);
    setShowVoiceModal(true);
    isCancelledRef.current = false;
    chunksRef.current = [];

    try {
      // 1. Request microphone stream with voice-optimized constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      audioStreamRef.current = stream;

      // 2. Setup Web Audio API Analyser for Visualizer & Silence Detection
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; // Small fftSize is perfect for live volume/frequencies
      analyserNodeRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      // Start volume check & visualizer loop
      startVolumeCheckLoop();

      // 3. Setup MediaRecorder
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/ogg';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Let browser choose default
          }
        }
      }

      const recorderOptions = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all track inputs so the red recording dot disappears
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
        }

        cleanupVisualizer();

        if (isCancelledRef.current) {
          setIsListening(false);
          return;
        }

        // Process recorded audio
        const finalMime = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: finalMime });
        
        if (audioBlob.size < 1000) { // Check if audio is too short/empty
          console.warn("Recorded audio blob is too small.");
          setVoiceError('no-speech');
          setIsListening(false);
          return;
        }

        // Convert audio Blob to Base64
        setIsProcessingVoice(true);
        setIsListening(false);
        
        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            handleParseVoiceAudio(base64Data, finalMime);
          };
        } catch (err) {
          console.error("Base64 conversion failed:", err);
          setVoiceError('conversion-failed');
          setIsProcessingVoice(false);
        }
      };

      // 4. Start recording!
      mediaRecorder.start();

      // Set a hard timeout of 15 seconds to prevent extremely large audio submissions
      initialSilenceTimeoutRef.current = setTimeout(() => {
        console.log("Maximum audio recording limit (15s) reached. Auto-stopping...");
        stopListening();
      }, 15000);

    } catch (err) {
      console.error("Mic access or recorder setup failed:", err);
      setVoiceError(err.name === 'NotAllowedError' ? 'not-allowed' : 'unknown');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    cleanupVisualizer();
    if (initialSilenceTimeoutRef.current) clearTimeout(initialSilenceTimeoutRef.current);
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Stop recorder error in stopListening:", err);
      }
    }
  };

  const handleParseVoiceAudio = async (base64Audio, mimeType) => {
    setIsProcessingVoice(true);
    setVoiceError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/triage/voice-parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: base64Audio,
          mimeType,
          langHint: selectedLang
        })
      });

      if (response.ok) {
        const data = await response.json();
        setVoiceTranscript(data.transcript);
        transcriptRef.current = data.transcript;
        
        if (!data.transcript || data.transcript.trim() === '') {
          setVoiceError('no-speech');
          return;
        }

        setDetectedCategory(data.emergencyType);
        
        let count = 4;
        setCountdown(count);
        countdownRef.current = setInterval(() => {
          count -= 1;
          if (count <= 0) {
            clearInterval(countdownRef.current);
            setShowVoiceModal(false);
            onNext(isSilent, data.transcript, data.emergencyType);
          } else {
            setCountdown(count);
          }
        }, 1000);
      } else {
        const errorData = await response.json();
        console.error("Voice parse error from server:", errorData);
        setVoiceError('server-failed');
      }
    } catch (err) {
      console.error("Voice parse API exception:", err);
      setVoiceError('network-error');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleParseVoiceTriage = async (text) => {
    setIsProcessingVoice(true);
    try {
      const r = await fetch(`${API_BASE_URL}/triage/voice-parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        const data = await r.json();
        setDetectedCategory(data.emergencyType);
        
        let count = 4;
        setCountdown(count);
        countdownRef.current = setInterval(() => {
          count -= 1;
          if (count <= 0) {
            clearInterval(countdownRef.current);
            setShowVoiceModal(false);
            onNext(isSilent, text, data.emergencyType);
          } else {
            setCountdown(count);
          }
        }, 1000);
      } else {
        alert("Failed to categorize voice triage. Proceeding with standard dispatch.");
        handleCancelVoice();
        onNext(isSilent, text, 'Other / Not Sure');
      }
    } catch (err) {
      console.error("Voice parse triage error:", err);
      alert("Error parsing voice. Proceeding with standard dispatch.");
      handleCancelVoice();
      onNext(isSilent, text, 'Other / Not Sure');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleCancelVoice = () => {
    isCancelledRef.current = true;
    cleanupAudio();
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(null);
    setIsListening(false);
    setVoiceTranscript('');
    setDetectedCategory('');
    setVoiceError(null);
    setShowVoiceModal(false);
  };

  const handleForceDispatch = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowVoiceModal(false);
    onNext(isSilent, voiceTranscript, detectedCategory || 'Other / Not Sure');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (phone.trim().length >= 7) onNext(isSilent);
  };

  return (
    <div className="animate-up">
      {/* Hero */}
      <div className="home-hero">
        <p className="hero-greeting">SwiftAid Emergency Network</p>
        <h1 className="hero-title">Help is one<br/>tap away.</h1>
        <p className="hero-sub">Nearest ambulance dispatched in seconds. No login. No friction.</p>
      </div>

      {/* Phone input row */}
      <div className="phone-row" style={{ marginBottom: 12 }}>
        <div className="input-icon-wrap" style={{ flex: 1 }}>
          <Phone className="icon-left" size={16} />
          <input
            type="tel"
            className="input-field"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </div>
      </div>

      {/* Silent mode Switcher */}
      <div style={{ padding: '0 20px', marginBottom: 24 }}>
        <div className="silent-mode-toggle" onClick={() => setIsSilent(!isSilent)} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'border 0.2s, background 0.2s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <VolumeX size={18} color={isSilent ? 'var(--accent)' : 'var(--text-muted)'} />
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '0.88rem', fontWeight: 600 }}>Silent SOS Mode</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Mutes sirens & disguises tracking screen</p>
            </div>
          </div>
          <div className={`switch-toggle ${isSilent ? 'active' : ''}`} style={{
            width: 44,
            height: 24,
            background: isSilent ? 'var(--accent)' : 'var(--text-faint)',
            borderRadius: 99,
            position: 'relative',
            transition: 'background 0.2s'
          }}>
            <div className="switch-knob" style={{
              width: 18,
              height: 18,
              background: '#ffffff',
              borderRadius: '50%',
              position: 'absolute',
              top: 3,
              left: isSilent ? 23 : 3,
              transition: 'left 0.2s'
            }} />
          </div>
        </div>

        {isSilent && (
          <div className="silent-warning" style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginTop: 8,
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.05)',
            border: '1px dashed rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            color: 'var(--accent)',
            fontSize: '0.75rem',
            animation: 'fadeIn 0.25s ease'
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ lineHeight: 1.3, textAlign: 'left' }}>
              <strong>Undercover Protection:</strong> This option triggers dispatch silently, and hides Map details with a fake news dashboard to protect you from local threats.
            </p>
          </div>
        )}
      </div>

      {/* SOS Button & Voice Button Row */}
      <div className="sos-button-wrap" style={{ gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, width: '100%', justifyContent: 'center', padding: '0 20px' }}>
          <button
            className="sos-btn"
            onClick={handleSubmit}
            disabled={phone.trim().length < 7}
            style={{ flex: 1, padding: '24px 10px', height: 'auto', borderRadius: 'var(--radius)' }}
          >
            <span style={{ fontSize: '1.8rem' }}>🚨</span>
            <span className="sos-label">SOS Dispatch</span>
            <span className="sos-sub" style={{ fontSize: '0.7rem' }}>Tap to Dispatch</span>
          </button>
          
          <button
            className="sos-btn voice-sos-btn"
            onClick={startListening}
            disabled={phone.trim().length < 7}
            style={{
              flex: 1,
              padding: '24px 10px',
              height: 'auto',
              borderRadius: 'var(--radius)',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              boxShadow: '0 8px 24px rgba(59, 130, 246, 0.25)'
            }}
          >
            <span style={{ fontSize: '1.8rem' }}>🎙️</span>
            <span className="sos-label">Voice SOS</span>
            <span className="sos-sub" style={{ fontSize: '0.7rem' }}>Describe Emergency</span>
          </button>
        </div>
        <span className="sos-hint">Enter your phone first, then select SOS method</span>
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginTop: 24 }}>
        <div className="stat-card">
          <span className="stat-number">{stats.ambulances}</span>
          <span className="stat-label">Units Ready</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{stats.hospitals}</span>
          <span className="stat-label">Hospitals</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">&lt;30s</span>
          <span className="stat-label">Avg Dispatch</span>
        </div>
      </div>

      {/* Quick info */}
      <div style={{ padding: '0 20px 20px' }}>
        <p className="section-title" style={{ marginBottom: 10 }}>How it works</p>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            ['🎙️', 'Voice-Activated Triage AI maps symptoms to guidelines'],
            ['🤫', 'Silent Dispatch hides visual traces for secure calling'],
            ['🚑', 'Parallel dispatch pings top 3 nearby paramedics'],
            ['🏥', 'Secures ICU bed reservations before you arrive'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '1.2rem' }}>{icon}</span>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'left' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Voice Triage Modal Overlay */}
      {showVoiceModal && (
        <div className="modal-overlay active" style={{ zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(2, 6, 23, 0.75)' }}>
          <div className="modal-sheet animate-slide-up" style={{ padding: '24px 20px', width: '100%', maxWidth: 430, borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)' }} onClick={e => e.stopPropagation()}>
            {/* Language/Accent Selector pills */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
              {LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLang(lang.code)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    border: '1px solid ' + (selectedLang === lang.code ? 'var(--blue)' : 'var(--border)'),
                    background: selectedLang === lang.code ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-elevated)',
                    color: selectedLang === lang.code ? 'var(--blue)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div ref={volumeBarRef} className="voice-triage-pulse-wrap" style={{
                position: 'relative',
                width: 72,
                height: 72,
                margin: '0 auto 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: isListening 
                  ? 'rgba(239, 68, 68, 0.15)' 
                  : voiceError 
                    ? 'rgba(239, 68, 68, 0.15)' 
                    : 'rgba(59, 130, 246, 0.15)',
                transition: 'transform 0.08s ease'
              }}>
                {isListening && (
                  <div className="voice-pulse-ring" style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    border: '2px solid var(--accent)',
                    animation: 'pulse-ring 1.5s infinite'
                  }} />
                )}
                {isListening ? (
                  <Mic size={32} color="var(--accent)" />
                ) : isProcessingVoice ? (
                  <Loader2 size={32} color="var(--blue)" className="spinner-icon" />
                ) : voiceError ? (
                  <MicOff size={32} color="var(--accent)" />
                ) : (
                  <Play size={32} color="var(--green)" />
                )}
              </div>
              
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: voiceError ? 'var(--accent)' : 'var(--text)' }}>
                {isListening 
                  ? 'Listening for Emergency…' 
                  : isProcessingVoice 
                    ? 'Analyzing symptoms…' 
                    : voiceError 
                      ? 'Speech Input Failed' 
                      : 'AI Triage Confirmed'}
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {isListening 
                  ? 'Describe the situation (e.g. chest pain, breathing difficulty)' 
                  : isProcessingVoice 
                    ? 'Keywords being mapped to guidelines' 
                    : voiceError 
                      ? (voiceError === 'not-allowed' 
                          ? 'Microphone access denied. Please allow microphone permissions.' 
                          : voiceError === 'no-speech' 
                            ? 'No speech detected. Please speak closer or try again.' 
                            : 'Could not connect to voice service. Check internet connection.') 
                      : 'Preparing dispatch details'}
              </p>

              {isListening && (
                <div ref={visualizerBarsRef} className="equalizer-wrap">
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                  <div className="equalizer-bar"></div>
                </div>
              )}
            </div>

            {/* Transcript Preview / Editable Input */}
            <div style={{ marginBottom: 20 }}>
              <textarea
                className="input-field"
                value={voiceTranscript}
                onChange={(e) => {
                  setVoiceTranscript(e.target.value);
                  transcriptRef.current = e.target.value;
                }}
                placeholder="Type or speak details (e.g. chest pain, accident, breathing trouble)..."
                disabled={isProcessingVoice}
                style={{
                  width: '100%',
                  minHeight: 80,
                  maxHeight: 120,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px',
                  color: 'var(--text)',
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  lineHeight: 1.4,
                  textAlign: 'center',
                  resize: 'none',
                  outline: 'none',
                  transition: 'border 0.2s',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Triage Outcome */}
            {detectedCategory && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                background: 'var(--green-glow)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px',
                marginBottom: 24,
                animation: 'fadeIn 0.25s ease'
              }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green)' }}>Detected Emergency Type</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>🚨 {detectedCategory}</span>
                {countdown !== null && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Auto dispatching in <strong style={{ color: 'var(--accent)', fontSize: '1rem' }}>{countdown}s</strong>...
                  </p>
                )}
              </div>
            )}

            {/* Modal Controls */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleCancelVoice}>
                Cancel
              </button>
              
              {isListening && (
                <button className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={stopListening}>
                  <Square size={16} /> Stop Recording
                </button>
              )}

              {(detectedCategory || (!isListening && voiceTranscript.trim().length > 0)) && (
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 1 }} 
                  onClick={() => {
                    if (detectedCategory) {
                      handleForceDispatch();
                    } else {
                      handleParseVoiceTriage(voiceTranscript.trim());
                    }
                  }}
                  disabled={isProcessingVoice}
                >
                  {isProcessingVoice 
                    ? 'Processing…' 
                    : detectedCategory 
                      ? 'Dispatch Now' 
                      : 'Parse Symptoms'}
                </button>
              )}

              {voiceError && !detectedCategory && !isListening && (
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={startListening}>
                  Retry Mic
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
