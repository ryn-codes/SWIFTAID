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
  const { phoneNumber, latitude, longitude, emergencyType } = req.body;

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
    const newRequest = await prisma.emergencyRequest.create({
      data: {
        userId: user.id,
        latitude,
        longitude,
        emergencyType: emergencyType || 'UNKNOWN',
        status: 'PENDING',
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
          ambulance: {
            id: acceptedDispatch.ambulance.id,
            driverName: acceptedDispatch.ambulance.driver.name,
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

    res.json({ status: request.status });
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

module.exports = { requestAmbulance, getAmbulances, getRequestStatus, updateEmergencyType };
