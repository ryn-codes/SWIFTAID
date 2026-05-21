const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Wiping database...');
  await prisma.locationLog.deleteMany({});
  await prisma.trip.deleteMany({});
  await prisma.dispatch.deleteMany({});
  await prisma.emergencyRequest.deleteMany({});
  await prisma.emergencyProfile.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.ambulance.deleteMany({});
  await prisma.driver.deleteMany({});
  await prisma.hospitalCapacity.deleteMany({});
  await prisma.hospital.deleteMany({});
  await prisma.provider.deleteMany({});
  console.log('✅ Wiped.');

  // --- PROVIDERS ---
  const providerNames = [
    { name: 'CityMed Emergency', type: 'PRIVATE' },
    { name: 'CareNow Rescue', type: 'PRIVATE' },
    { name: 'Apollo Rapid Response', type: 'HOSPITAL' },
    { name: 'Max Healthcare Transit', type: 'HOSPITAL' },
    { name: 'Fortis Quick Aid', type: 'HOSPITAL' },
    { name: 'Delhi Govt Ambulance', type: 'GOVT' },
    { name: 'LifeLine EMS', type: 'PRIVATE' },
    { name: 'MedExpress India', type: 'PRIVATE' },
    { name: 'RedCross Transport', type: 'GOVT' },
    { name: 'SafeRide Medical', type: 'PRIVATE' },
  ];

  console.log('🏢 Creating Providers...');
  const providers = await Promise.all(
    providerNames.map(p => prisma.provider.create({ data: p }))
  );

  // --- DRIVER NAME POOL ---
  const firstNames = ['Rajesh','Suresh','Amit','Vikram','Arun','Priya','Neha','Pooja','Sunita','Meena','Rohit','Sanjay','Deepak','Manoj','Kiran','Ramesh','Mohan','Anita','Geeta','Seema'];
  const lastNames = ['Kumar','Sharma','Verma','Gupta','Singh','Patel','Yadav','Tiwari','Joshi','Dubey','Mishra','Nanda','Kapoor','Dutt','Das'];

  const getRandName = () => `${firstNames[Math.floor(Math.random()*firstNames.length)]} ${lastNames[Math.floor(Math.random()*lastNames.length)]}`;
  const getRandPhone = () => `+91${Math.floor(9000000000 + Math.random() * 999999999)}`;

  // Cities/Areas with realistic coordinates
  const areas = [
    { city: 'Delhi NCR', lat: 28.6139, lon: 77.2090 },
    { city: 'Gurgaon', lat: 28.4595, lon: 77.0266 },
    { city: 'Noida', lat: 28.5355, lon: 77.3910 },
    { city: 'Faridabad', lat: 28.4089, lon: 77.3178 },
    { city: 'Ghaziabad', lat: 28.6692, lon: 77.4538 },
  ];

  const ambTypes = ['BASIC', 'BASIC', 'BASIC', 'ALS', 'ALS', 'ICU', 'OXYGEN'];

  // --- 1000 AMBULANCES + DRIVERS ---
  console.log('🚑 Generating 1000 Ambulances & Drivers...');
  const BATCH_SIZE = 50;
  const TOTAL = 1000;

  for (let batch = 0; batch < TOTAL / BATCH_SIZE; batch++) {
    const batchPromises = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const area = areas[Math.floor(Math.random() * areas.length)];
      const lat = parseFloat((area.lat + (Math.random() - 0.5) * 0.5).toFixed(6));
      const lon = parseFloat((area.lon + (Math.random() - 0.5) * 0.5).toFixed(6));
      const provider = providers[Math.floor(Math.random() * providers.length)];
      const type = ambTypes[Math.floor(Math.random() * ambTypes.length)];

      batchPromises.push(
        (async () => {
          const driver = await prisma.driver.create({
            data: {
              name: getRandName(),
              phoneNumber: getRandPhone(),
              rating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
              isActive: true,
              badgeNumber: `PM-${Math.floor(1000 + Math.random() * 9000)}`
            }
          });

          await prisma.ambulance.create({
            data: {
              providerId: provider.id,
              type,
              isAvailable: Math.random() > 0.08, // 92% availability
              latitude: lat,
              longitude: lon,
              driverId: driver.id,
            }
          });
        })()
      );
    }
    await Promise.all(batchPromises);
    process.stdout.write(`  Progress: ${(batch + 1) * BATCH_SIZE} / ${TOTAL}\r`);
  }
  console.log('\n✅ 1000 Ambulances created!');

  // --- HOSPITALS (50 across India) ---
  console.log('🏥 Creating Hospital Network...');
  const hospitals = [
    { name: 'AIIMS New Delhi', lat: 28.5659, lon: 77.2111 },
    { name: 'Max Super Speciality, Saket', lat: 28.5273, lon: 77.2173 },
    { name: 'Fortis Escorts Heart', lat: 28.5606, lon: 77.2750 },
    { name: 'Apollo Indraprastha', lat: 28.5390, lon: 77.2842 },
    { name: 'Sir Ganga Ram Hospital', lat: 28.6385, lon: 77.1895 },
    { name: 'Safdarjung Hospital', lat: 28.5701, lon: 77.2054 },
    { name: 'RML Hospital Delhi', lat: 28.6328, lon: 77.2089 },
    { name: 'GTB Hospital', lat: 28.6784, lon: 77.3020 },
    { name: 'LNJP Hospital', lat: 28.6490, lon: 77.2373 },
    { name: 'Medanta Gurugram', lat: 28.4403, lon: 77.0434 },
    { name: 'Artemis Hospital', lat: 28.4614, lon: 77.0606 },
    { name: 'Columbia Asia Gurugram', lat: 28.5069, lon: 77.0912 },
    { name: 'Park Hospital Gurugram', lat: 28.4749, lon: 77.0283 },
    { name: 'Max Hospital Gurugram', lat: 28.4628, lon: 77.0249 },
    { name: 'Jaypee Hospital Noida', lat: 28.5419, lon: 77.3584 },
    { name: 'Metro Hospital Noida', lat: 28.5933, lon: 77.3296 },
    { name: 'Sharda Hospital', lat: 28.4671, lon: 77.4797 },
    { name: 'Felix Hospital Noida', lat: 28.5204, lon: 77.3911 },
    { name: 'Fortis Noida', lat: 28.5736, lon: 77.3459 },
    { name: 'Kailash Hospital Noida', lat: 28.5916, lon: 77.3370 },
    // Fill up to 50 with distributed variants
    { name: 'BLK Hospital Delhi', lat: 28.6497, lon: 77.1823 },
    { name: 'Pushpanjali Hospital', lat: 28.6619, lon: 77.2822 },
    { name: 'Moolchand Hospital', lat: 28.5700, lon: 77.2360 },
    { name: 'Venkateshwar Hospital', lat: 28.6236, lon: 77.0685 },
    { name: 'Aakash Healthcare', lat: 28.5852, lon: 77.0655 },
    { name: 'Cloudnine Gurugram', lat: 28.4727, lon: 77.0469 },
    { name: 'Paras Hospital', lat: 28.4609, lon: 77.0342 },
    { name: 'Rockland Hospital', lat: 28.5559, lon: 77.0978 },
    { name: 'Medeor Hospital', lat: 28.5086, lon: 77.0750 },
    { name: 'W Pratiksha Hospital', lat: 28.4595, lon: 77.0558 },
    { name: 'Sarvodaya Hospital Faridabad', lat: 28.4089, lon: 77.3091 },
    { name: 'Asian Hospital Faridabad', lat: 28.3786, lon: 77.3175 },
    { name: 'QRG Hospital Faridabad', lat: 28.4122, lon: 77.3245 },
    { name: 'Anand Hospital Faridabad', lat: 28.4256, lon: 77.3009 },
    { name: 'Columbia Asia Faridabad', lat: 28.3939, lon: 77.3286 },
    { name: 'Yashoda Hospital Ghaziabad', lat: 28.6744, lon: 77.4384 },
    { name: 'Columbia Asia Ghaziabad', lat: 28.6825, lon: 77.4302 },
    { name: 'Santosh Medical College', lat: 28.7016, lon: 77.4485 },
    { name: 'Max Hospital Vaishali', lat: 28.6437, lon: 77.3564 },
    { name: 'Crosslay Hospital', lat: 28.7037, lon: 77.3782 },
    { name: 'Kamineni Hospital', lat: 28.6247, lon: 77.3921 },
    { name: 'Satyam Hospital', lat: 28.6014, lon: 77.3675 },
    { name: 'Pristine Hospital', lat: 28.5782, lon: 77.3834 },
    { name: 'Shri Ram Hospital', lat: 28.6348, lon: 77.2456 },
    { name: 'Jeewan Mala Hospital', lat: 28.6457, lon: 77.2134 },
    { name: 'Hakeem Abdul Hameed', lat: 28.6218, lon: 77.2368 },
    { name: 'Hindu Rao Hospital', lat: 28.6722, lon: 77.2048 },
    { name: 'Deen Dayal Hospital', lat: 28.6601, lon: 77.1549 },
    { name: 'Maharaja Agrasen', lat: 28.6336, lon: 77.1672 },
    { name: 'Batra Hospital', lat: 28.5372, lon: 77.2083 },
  ];

  for (const h of hospitals) {
    const hospital = await prisma.hospital.create({
      data: { name: h.name, latitude: h.lat, longitude: h.lon }
    });
    // ~30% hospitals are full (realistic)
    const full = Math.random() > 0.7;
    await prisma.hospitalCapacity.create({
      data: {
        hospitalId: hospital.id,
        icuBeds: full ? 0 : Math.floor(Math.random() * 8) + 1,
        oxygenBeds: full ? 0 : Math.floor(Math.random() * 20) + 2,
        generalBeds: Math.floor(Math.random() * 100) + 10,
      }
    });
  }
  console.log(`✅ ${hospitals.length} Hospitals seeded with realistic capacity!`);
  console.log('\n🚀 Stress-test dataset ready!');
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
