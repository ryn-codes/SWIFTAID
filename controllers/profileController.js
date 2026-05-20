const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

const getProfile = async (req, res) => {
  const { phone } = req.params;
  try {
    const user = await prisma.user.findUnique({
      where: { phoneNumber: phone },
      include: { profile: true }
    });
    if (!user) return res.json({ profile: null });
    res.json({ profile: user.profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const upsertProfile = async (req, res) => {
  const { phoneNumber, bloodGroup, allergies, conditions, contacts, age, gender, medications, insuranceProvider } = req.body;
  try {
    // Get or create user
    let user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      user = await prisma.user.create({ data: { phoneNumber } });
    }

    const parsedAge = age ? parseInt(age, 10) : null;

    const profile = await prisma.emergencyProfile.upsert({
      where: { userId: user.id },
      update: { bloodGroup, allergies, conditions, contacts, age: parsedAge, gender, medications, insuranceProvider },
      create: { userId: user.id, bloodGroup, allergies, conditions, contacts, age: parsedAge, gender, medications, insuranceProvider }
    });

    res.json({ success: true, profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getHistory = async (req, res) => {
  const { phone } = req.params;
  try {
    const user = await prisma.user.findUnique({
      where: { phoneNumber: phone },
      include: {
        requests: {
          orderBy: { createdAt: 'desc' },
          take: 10,
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
        }
      }
    });

    if (!user) return res.json({ history: [] });

    const historyPromises = user.requests.map(async (r) => {
      const accepted = r.dispatches[0];
      let hospitalName = '—';
      if (r.trip && r.trip.dropLat && r.trip.dropLng) {
        const hospital = await prisma.hospital.findFirst({
          where: { latitude: r.trip.dropLat, longitude: r.trip.dropLng }
        });
        if (hospital) hospitalName = hospital.name;
      }
      return {
        id: r.id,
        createdAt: r.createdAt,
        status: r.status,
        emergencyType: r.emergencyType,
        driverName: accepted?.ambulance?.driver?.name || 'Unassigned',
        driverPhone: accepted?.ambulance?.driver?.phoneNumber || '',
        providerName: accepted?.ambulance?.provider?.name || '—',
        etaMins: accepted?.etaMinutes || null,
        hospitalName,
        ambulanceType: accepted?.ambulance?.type || 'ALS',
        driverRating: accepted?.ambulance?.driver?.rating || '4.8'
      };
    });

    const history = await Promise.all(historyPromises);
    res.json({ history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getProfile, upsertProfile, getHistory };
