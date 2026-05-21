const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();
const haversineDistance = require('../utils/geo');

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
      // Find nearest to user pickup
      availableHospitals.sort((a, b) => {
        return haversineDistance(req.latitude, req.longitude, a.latitude, a.longitude) - 
               haversineDistance(req.latitude, req.longitude, b.latitude, b.longitude);
      });
      assignedHospital = availableHospitals[0];

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
    // 1. Get or Create User
    let user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      user = await prisma.user.create({ data: { phoneNumber } });
    }

    // 2. Create the Request
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const newRequest = await prisma.emergencyRequest.create({
      data: {
        userId: user.id,
        latitude,
        longitude,
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

    // 4. Calculate distances and sort to find Top 3
    const ambulancesWithDistance = availableAmbulances.map(amb => ({
      ...amb,
      distance: haversineDistance(latitude, longitude, amb.latitude, amb.longitude)
    })).sort((a, b) => a.distance - b.distance);

    const topCandidates = ambulancesWithDistance.slice(0, 3); // Parallel Ping up to 3

    // 5. Create PINGED Dispatches
    const dispatchPromises = topCandidates.map(amb => {
      const etaMins = Math.ceil(amb.distance * 3 + 2);
      return prisma.dispatch.create({
        data: {
          requestId: newRequest.id,
          ambulanceId: amb.id,
          status: 'PINGED',
          etaMinutes: etaMins,
          distanceKm: amb.distance
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

    if (request.status === 'ASSIGNED') {
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
        status: 'ASSIGNED',
        dispatchData: {
          bookingId: request.id,
          etaMins: acceptedDispatch.etaMinutes,
          otp: request.otp,
          isSilent: request.isSilent,
          ambulance: {
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
          },
          hospital: hospitalInfo
        }
      });
    }

    res.json({ status: request.status, isSilent: request.isSilent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAmbulances = async (req, res) => {
  try {
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

module.exports = { 
  requestAmbulance, 
  getAmbulances, 
  getRequestStatus, 
  updateEmergencyType, 
  completeEmergencyRequest,
  parseVoiceTriage,
  sendChatMessage,
  getChatMessages
};
