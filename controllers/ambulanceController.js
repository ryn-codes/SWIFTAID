const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();
const haversineDistance = require('../utils/geo');

// Helper for reverse geocoding via Nominatim
const reverseGeocode = async (lat, lon) => {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (response.ok) {
      const data = await response.json();
      return data.display_name || null;
    }
  } catch (err) {
    console.error("Nominatim reverse geocoding failed:", err);
  }
  return null;
};

// Helper for fetching OSRM routing matrix data for ambulances
const getAmbulancesOSRMData = async (userLat, userLon, ambulances) => {
  try {
    const coordinates = `${userLon},${userLat};` + ambulances.map(a => `${a.longitude},${a.latitude}`).join(';');
    const sources = ambulances.map((_, idx) => idx + 1).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coordinates}?sources=${sources}&destinations=0&annotations=duration,distance`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.durations && data.distances) {
        return ambulances.map((amb, idx) => {
          const duration = data.durations[idx][0]; // in seconds
          const distance = data.distances[idx][0];   // in meters
          return {
            ...amb,
            durationMins: duration ? Math.ceil(duration / 60) : null,
            distanceKm: distance ? parseFloat((distance / 1000).toFixed(2)) : null
          };
        });
      }
    }
  } catch (err) {
    console.error("OSRM table calculation failed:", err);
  }
  return null;
};

// Helper for sorting hospitals by driving time using OSRM Table API
const sortHospitalsOSRM = async (userLat, userLon, hospitals) => {
  try {
    const coordinates = `${userLon},${userLat};` + hospitals.map(h => `${h.longitude},${h.latitude}`).join(';');
    const destinations = hospitals.map((_, idx) => idx + 1).join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coordinates}?sources=0&destinations=${destinations}&annotations=duration`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.durations) {
        const durations = data.durations[0]; // From source 0 to destinations
        return hospitals.map((h, idx) => ({
          hospital: h,
          duration: durations[idx]
        })).sort((a, b) => (a.duration ?? Infinity) - (b.duration ?? Infinity))
           .map(item => item.hospital);
      }
    }
  } catch (err) {
    console.error("OSRM hospital table failed:", err);
  }
  // Fallback to Haversine sorting
  return [...hospitals].sort((a, b) => {
    return haversineDistance(userLat, userLon, a.latitude, a.longitude) - 
           haversineDistance(userLat, userLon, b.latitude, b.longitude);
  });
};

// Helper to dynamically teleport available resources (ambulances & hospitals) 
// to the user's city if they are far away (>50km) from database seeds.
const teleportResourcesIfNeeded = async (lat, lon) => {
  if (!lat || !lon) return;
  const userLat = parseFloat(lat);
  const userLon = parseFloat(lon);
  if (isNaN(userLat) || isNaN(userLon)) return;

  try {
    const ambulances = await prisma.ambulance.findMany();
    if (ambulances.length === 0) return;

    let minDistance = Infinity;
    ambulances.forEach(amb => {
      const dist = haversineDistance(userLat, userLon, amb.latitude, amb.longitude);
      if (dist < minDistance) minDistance = dist;
    });

    if (minDistance > 50) {
      console.log(`[TELEPORT] User location (${userLat}, ${userLon}) is far from seed data. Teleporting available units nearby...`);
      
      const availableAmbs = ambulances.filter(a => a.isAvailable);
      // Teleport up to 10 available ambulances
      const ambsToTeleport = availableAmbs.slice(0, 10);
      const teleportAmbs = ambsToTeleport.map((amb, idx) => {
        const angle = (idx / ambsToTeleport.length) * 2 * Math.PI;
        const distance = 1.5 + Math.random() * 4.5; // 1.5 to 6 km radius
        const latOffset = (distance / 111) * Math.sin(angle);
        const lonOffset = (distance / (111 * Math.cos(userLat * Math.PI / 180))) * Math.cos(angle);
        
        return prisma.ambulance.update({
          where: { id: amb.id },
          data: {
            latitude: userLat + latOffset,
            longitude: userLon + lonOffset,
            lastUpdatedAt: new Date()
          }
        });
      });
      await Promise.all(teleportAmbs);

      // Teleport hospitals
      const hospitals = await prisma.hospital.findMany();
      if (hospitals.length > 0) {
        const teleportHosp = hospitals.map((hosp, idx) => {
          const angle = (idx / hospitals.length) * 2 * Math.PI + (Math.PI / 4);
          const distance = 3 + Math.random() * 5; // 3 to 8 km radius
          const latOffset = (distance / 111) * Math.sin(angle);
          const lonOffset = (distance / (111 * Math.cos(userLat * Math.PI / 180))) * Math.cos(angle);

          return prisma.hospital.update({
            where: { id: hosp.id },
            data: {
              latitude: userLat + latOffset,
              longitude: userLon + lonOffset
            }
          });
        });
        await Promise.all(teleportHosp);
      }
      console.log(`[TELEPORT] Successfully completed resources teleportation to user city.`);
    }
  } catch (err) {
    console.error("Resource teleportation failed:", err);
  }
};

// Simulated driver response logic for V2
const simulateDriverResponse = async (requestId, dispatchIds) => {
  // Simulate delay 3 to 7 seconds
  const delay = Math.floor(Math.random() * 4000) + 3000;
  await new Promise(resolve => setTimeout(resolve, delay));

  try {
    // Check if request is still PENDING
    const req = await prisma.emergencyRequest.findUnique({ where: { id: requestId } });
    if (!req || req.status !== 'PENDING') return;

    // Pick a random driver to "accept"
    const acceptedDispatchId = dispatchIds[Math.floor(Math.random() * dispatchIds.length)];

    // Update the accepted dispatch
    const acceptedDispatch = await prisma.dispatch.update({
      where: { id: acceptedDispatchId },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
      include: { ambulance: true }
    });

    // Mark others as expired
    await prisma.dispatch.updateMany({
      where: {
        id: { in: dispatchIds, not: acceptedDispatchId }
      },
      data: { status: 'EXPIRED' }
    });

    // Find nearest hospital with ICU beds
    const hospitals = await prisma.hospital.findMany({ include: { capacities: true } });
    const availableHospitals = hospitals.filter(h => h.capacities[0] && h.capacities[0].icuBeds > 0);
    
    let assignedHospital = null;
    if (availableHospitals.length > 0) {
      // Find nearest to user pickup using OSRM driving time (with Haversine fallback)
      const sortedHospitals = await sortHospitalsOSRM(req.latitude, req.longitude, availableHospitals);
      assignedHospital = sortedHospitals[0];

      // Reserve the bed
      await prisma.hospitalCapacity.update({
        where: { id: assignedHospital.capacities[0].id },
        data: { icuBeds: assignedHospital.capacities[0].icuBeds - 1 }
      });
    }

    // Create Trip
    const trip = await prisma.trip.create({
      data: {
        requestId: requestId,
        ambulanceId: acceptedDispatch.ambulanceId,
        driverId: acceptedDispatch.ambulance.driverId,
        pickupLat: req.latitude,
        pickupLng: req.longitude,
        dropLat: assignedHospital ? assignedHospital.latitude : null,
        dropLng: assignedHospital ? assignedHospital.longitude : null,
        status: 'EN_ROUTE',
      }
    });

    // Update Request
    await prisma.emergencyRequest.update({
      where: { id: requestId },
      data: { status: 'ASSIGNED', assignedTripId: trip.id }
    });

    // Update Ambulance Availability
    await prisma.ambulance.update({
      where: { id: acceptedDispatch.ambulanceId },
      data: { isAvailable: false }
    });

    console.log(`[V2 ENGINE] Driver accepted dispatch for Request ${requestId}`);
  } catch (error) {
    console.error("Simulation error:", error);
  }
};

const requestAmbulance = async (req, res) => {
  const { phoneNumber, latitude, longitude, emergencyType, isSilent, voiceTranscript } = req.body;

  if (!phoneNumber || !latitude || !longitude) {
    return res.status(400).json({ error: 'Phone number, latitude, and longitude required' });
  }

  try {
    // Teleport resources close to the user's SOS location if they are far away
    await teleportResourcesIfNeeded(latitude, longitude);

    // 1. Get or Create User
    let user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      user = await prisma.user.create({ data: { phoneNumber } });
    }

    // Geocode user coordinates to address via Nominatim (async)
    const pickupAddress = await reverseGeocode(latitude, longitude);

    // 2. Create the Request
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const newRequest = await prisma.emergencyRequest.create({
      data: {
        userId: user.id,
        latitude,
        longitude,
        pickupAddress,
        emergencyType: emergencyType || 'UNKNOWN',
        status: 'PENDING',
        otp: otpCode,
        isSilent: isSilent === true || isSilent === 'true',
        voiceTranscript: voiceTranscript || null,
      },
    });

    // 3. Find available ambulances
    const availableAmbulances = await prisma.ambulance.findMany({
      where: { isAvailable: true, driverId: { not: null } },
      include: { driver: true, provider: true }
    });

    if (availableAmbulances.length === 0) {
      return res.status(404).json({ error: 'No ambulances available currently. Please try again in a few moments.' });
    }

    // 4. Calculate distances and sort to find Top 3 using OSRM Table API
    let ambulancesWithRouteData = await getAmbulancesOSRMData(latitude, longitude, availableAmbulances);

    if (!ambulancesWithRouteData) {
      // Fallback to Haversine calculation
      ambulancesWithRouteData = availableAmbulances.map(amb => {
        const dist = haversineDistance(latitude, longitude, amb.latitude, amb.longitude);
        return {
          ...amb,
          distanceKm: parseFloat(dist.toFixed(2)),
          durationMins: Math.ceil(dist * 3 + 2)
        };
      });
    } else {
      // Fill missing/failed OSRM routes with Haversine fallback
      ambulancesWithRouteData = ambulancesWithRouteData.map(amb => {
        if (amb.distanceKm === null || amb.durationMins === null) {
          const dist = haversineDistance(latitude, longitude, amb.latitude, amb.longitude);
          return {
            ...amb,
            distanceKm: parseFloat(dist.toFixed(2)),
            durationMins: Math.ceil(dist * 3 + 2)
          };
        }
        return amb;
      });
    }

    const sortedAmbulances = ambulancesWithRouteData.sort((a, b) => a.durationMins - b.durationMins);
    const topCandidates = sortedAmbulances.slice(0, 3); // Parallel Ping up to 3

    // 5. Create PINGED Dispatches
    const dispatchPromises = topCandidates.map(amb => {
      return prisma.dispatch.create({
        data: {
          requestId: newRequest.id,
          ambulanceId: amb.id,
          status: 'PINGED',
          etaMinutes: amb.durationMins,
          distanceKm: amb.distanceKm
        }
      });
    });

    const createdDispatches = await Promise.all(dispatchPromises);
    const dispatchIds = createdDispatches.map(d => d.id);

    // 6. Trigger background driver acceptance simulation
    simulateDriverResponse(newRequest.id, dispatchIds);

    // 7. Return immediately so frontend can start polling
    res.json({
      message: 'Searching for fastest available driver',
      requestId: newRequest.id,
      pingCount: dispatchIds.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getRequestStatus = async (req, res) => {
  const { id } = req.params;
  try {
    const request = await prisma.emergencyRequest.findUnique({
      where: { id },
      include: {
        trip: true,
        dispatches: {
          where: { status: 'ACCEPTED' },
          include: {
            ambulance: {
              include: { driver: true, provider: true }
            }
          }
        }
      }
    });

    if (!request) return res.status(404).json({ error: 'Not found' });

    if (request.status === 'ASSIGNED' || request.status === 'IN_PROGRESS') {
      const acceptedDispatch = request.dispatches[0];
      const trip = request.trip;
      
      let hospitalInfo = null;
      if (trip && trip.dropLat && trip.dropLng) {
        const hospital = await prisma.hospital.findFirst({
          where: { latitude: trip.dropLat, longitude: trip.dropLng }
        });
        if (hospital) {
          hospitalInfo = {
            name: hospital.name,
            latitude: hospital.latitude,
            longitude: hospital.longitude
          };
        }
      }

      return res.json({
        status: request.status,
        tripStatus: trip ? trip.status : 'EN_ROUTE',
        dispatchData: {
          bookingId: request.id,
          etaMins: acceptedDispatch ? acceptedDispatch.etaMinutes : null,
          otp: request.otp,
          isSilent: request.isSilent,
          pickupAddress: request.pickupAddress,
          ambulance: acceptedDispatch ? {
            id: acceptedDispatch.ambulance.id,
            driverName: acceptedDispatch.ambulance.driver.name,
            driverBadge: acceptedDispatch.ambulance.driver.badgeNumber,
            providerName: acceptedDispatch.ambulance.provider.name,
            phone: acceptedDispatch.ambulance.driver.phoneNumber,
            latitude: acceptedDispatch.ambulance.latitude,
            longitude: acceptedDispatch.ambulance.longitude,
            driverRating: acceptedDispatch.ambulance.driver.rating,
            ambulanceType: acceptedDispatch.ambulance.type,
            providerType: acceptedDispatch.ambulance.provider.type
          } : null,
          hospital: hospitalInfo
        }
      });
    }

    res.json({ status: request.status, isSilent: request.isSilent, pickupAddress: request.pickupAddress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAmbulances = async (req, res) => {
  const { lat, lon } = req.query;
  try {
    if (lat && lon) {
      await teleportResourcesIfNeeded(lat, lon);
    }
    // For the UI nearby map, map provider/driver to match old flat structure expectations
    const ambulances = await prisma.ambulance.findMany({
      include: { provider: true, driver: true }
    });
    
    const mapped = ambulances.map(a => ({
      id: a.id,
      latitude: a.latitude,
      longitude: a.longitude,
      isAvailable: a.isAvailable,
      providerName: a.provider.name,
      driverName: a.driver?.name || 'Unknown'
    }));
    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateEmergencyType = async (req, res) => {
  const { id } = req.params;
  const { emergencyType } = req.body;

  if (!emergencyType) {
    return res.status(400).json({ error: 'emergencyType is required' });
  }

  try {
    const updatedRequest = await prisma.emergencyRequest.update({
      where: { id },
      data: { emergencyType }
    });
    res.json({ success: true, request: updatedRequest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const completeEmergencyRequest = async (req, res) => {
  const { id } = req.params;
  try {
    const updatedRequest = await prisma.emergencyRequest.update({
      where: { id },
      data: { status: 'COMPLETED' }
    });
    res.json({ success: true, request: updatedRequest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const parseVoiceTriage = async (req, res) => {
  const { text, audio, mimeType, langHint } = req.body;
  
  if (audio) {
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not defined in environment variables");
      return res.status(500).json({ error: 'Gemini API key not configured on server' });
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
      
      const prompt = `You are SwiftAid's emergency dispatcher. Analyze the attached audio recording of a person describing a medical emergency. 
${langHint ? `Note: The speaker's language context is: ${langHint}.` : ''}
First, transcribe the spoken words exactly into clear English (or romanized text if it's Hinglish/Hindi mixed dialect). If no words are spoken, transcribe as ''.
Second, categorize the emergency into one of these types:
- 'Cardiac Arrest' (chest pain, heart pressure, collapsing, etc.)
- 'Breathing Difficulty' (choking, suffocation, asthma, gasping)
- 'Accident / Trauma' (bleeding, wounds, fall, fracture, collision)
- 'Unconscious Person' (fainting, unresponsive, behosh, passed out)
- 'Stroke Symptoms' (slurred speech, mouth drooping, body numbness/weakness)
- 'Other / Not Sure' (any other symptoms or unidentifiable audio)

You MUST respond strictly with a JSON object in the following schema (no markdown formatting, no surrounding backticks, no text other than the JSON):
{
  "transcript": "exact transcription",
  "emergencyType": "one of the emergency types listed above"
}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType || 'audio/webm',
                  data: audio
                }
              }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error response:", errorText);
        throw new Error(`Gemini API returned status ${response.status}`);
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) {
        throw new Error("Empty response from Gemini API");
      }

      const parsed = JSON.parse(textResponse);
      return res.json({
        transcript: parsed.transcript || '',
        emergencyType: parsed.emergencyType || 'Other / Not Sure'
      });

    } catch (err) {
      console.error("Gemini audio transcription failed:", err);
      return res.status(500).json({ error: 'Failed to transcribe audio via Gemini API' });
    }
  }

  if (!text) return res.status(400).json({ error: 'Text transcript or audio payload required' });
  
  const transcript = text.toLowerCase();
  let emergencyType = 'Other / Not Sure';
  
  // Cardiac Arrest Keywords
  const cardiacKeywords = [
    'chest', 'heart', 'cardiac', 'cpr', 'attack', 'pressure', 'heavy', 'tightness',
    'chhaati', 'dil', 'dard', 'pain', 'colapse', 'pulse'
  ];
  
  // Breathing Difficulty Keywords
  const breathingKeywords = [
    'breath', 'chok', 'suffocat', 'asthma', 'wheez', 'gasp', 'throat', 'airway',
    'saans', 'dama', 'cough', 'choke'
  ];
  
  // Accident / Trauma Keywords
  const traumaKeywords = [
    'bleed', 'blood', 'accident', 'fall', 'fracture', 'cut', 'wound', 'injury',
    'collision', 'hurt', 'crash', 'hit', 'khoon', 'chot', 'dard', 'haath', 'pair'
  ];
  
  // Unconscious Person Keywords
  const unconsciousKeywords = [
    'faint', 'unconscious', 'pass out', 'passed out', 'response', 'behosh', 'gira',
    'collaps', 'sleep', 'wake', 'dizzy', 'headache'
  ];
  
  // Stroke Symptoms Keywords
  const strokeKeywords = [
    'stroke', 'paraly', 'slur', 'speech', 'mouth', 'numb', 'weakness', 'slurred',
    'face', 'arm', 'leg', 'balance', 'vision'
  ];

  const matchesAny = (words) => words.some(w => transcript.includes(w));

  if (matchesAny(cardiacKeywords)) {
    emergencyType = 'Cardiac Arrest';
  } else if (matchesAny(breathingKeywords)) {
    emergencyType = 'Breathing Difficulty';
  } else if (matchesAny(traumaKeywords)) {
    emergencyType = 'Accident / Trauma';
  } else if (matchesAny(unconsciousKeywords)) {
    emergencyType = 'Unconscious Person';
  } else if (matchesAny(strokeKeywords)) {
    emergencyType = 'Stroke Symptoms';
  }
  
  res.json({ transcript: text, emergencyType });
};

const sendChatMessage = async (req, res) => {
  const { id } = req.params;
  const { sender, message } = req.body;
  if (!sender || !message) return res.status(400).json({ error: 'Sender and message required' });
  
  try {
    const chat = await prisma.chatMessage.create({
      data: {
        requestId: id,
        sender,
        message
      }
    });
    
    // Simulate driver response if user sent a message
    if (sender === 'user') {
      setTimeout(async () => {
        try {
          let responseMessage = "Understood. Paramedics are en route.";
          const msgLower = message.toLowerCase();
          if (msgLower.includes('silent') || msgLower.includes('siren') || msgLower.includes('horn') || msgLower.includes('sound')) {
            responseMessage = "Copy that. Sirens and horns turned off. Approaching silently.";
          } else if (msgLower.includes('door') || msgLower.includes('gate') || msgLower.includes('open') || msgLower.includes('key')) {
            responseMessage = "Acknowledged, we will enter directly. Keep safe.";
          } else if (msgLower.includes('bathroom') || msgLower.includes('bedroom') || msgLower.includes('floor') || msgLower.includes('bed')) {
            responseMessage = "Copy that. Bringing the stretcher directly to you.";
          } else if (msgLower.includes('fast') || msgLower.includes('hurry') || msgLower.includes('quick')) {
            responseMessage = "Driving as fast as possible. Hang in there.";
          }
          
          await prisma.chatMessage.create({
            data: {
              requestId: id,
              sender: 'driver',
              message: responseMessage
            }
          });
        } catch (err) {
          console.error("Mocked chat response error:", err);
        }
      }, 2500);
    }
    
    res.json({ success: true, chat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getChatMessages = async (req, res) => {
  const { id } = req.params;
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { requestId: id },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const verifyOTP = async (req, res) => {
  const { id } = req.params;
  const { otp } = req.body;

  if (!otp) {
    return res.status(400).json({ error: 'OTP is required' });
  }

  try {
    const request = await prisma.emergencyRequest.findUnique({
      where: { id },
      include: { trip: true }
    });

    if (!request) {
      return res.status(404).json({ error: 'Emergency request not found' });
    }

    if (request.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP code. Please check and try again.' });
    }

    // Update request status to IN_PROGRESS
    const updatedRequest = await prisma.emergencyRequest.update({
      where: { id },
      data: { status: 'IN_PROGRESS' }
    });

    // Update corresponding trip status to PATIENT_PICKED
    if (request.trip) {
      await prisma.trip.update({
        where: { id: request.trip.id },
        data: { status: 'PATIENT_PICKED' }
      });
    }

    res.json({ success: true, message: 'OTP verified. Patient picked up and en route to hospital.', request: updatedRequest });
  } catch (err) {
    console.error("OTP verification error:", err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { 
  requestAmbulance, 
  getAmbulances, 
  getRequestStatus, 
  updateEmergencyType, 
  completeEmergencyRequest,
  parseVoiceTriage,
  sendChatMessage,
  getChatMessages,
  verifyOTP
};
