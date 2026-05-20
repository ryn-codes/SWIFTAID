# SwiftAid 🚑 

> **Premium Emergency Dispatch & ICU Bed Admission Platform**

SwiftAid is a modern, real-time emergency responder dispatch application designed to bridge the gap between users in critical distress, paramedic drivers, and emergency hospital care. By combining instantaneous IP/GPS location mapping, live vehicle tracking, dynamic triage nudges, and secure ICU bed reservations, SwiftAid ensures help arrives prepared and hospital admissions are secured before the ambulance pulls up.

---

## 🌟 Key Features

*   ⚡ **Instant SOS Geolocation**: Dual-mode location acquisition utilizing fast IP-based lookup with high-accuracy browser GPS fallback.
*   🚑 **Intelligent Matchmaking**: Scans active paramedic fleets in real-time, matching the closest unit and securing the transport.
*   🩺 **Real-Time Triage Sync**: Synchronizes the user’s selected emergency type (e.g., Cardiac Arrest, Trauma, Stroke) directly to the active responder's vehicle terminal.
*   🎉 **Confirmation Sheet**: Visual booking receipt showing responder profile, driver rating, vehicle details, and the secured hospital destination.
*   🗺️ **Live En-Route Tracking**: Visualizes the matched ambulance moving dynamically towards the user's location via an interactive Leaflet map interface.
*   🩹 **First-Aid Interactive Guidelines**: Provides tailored, step-by-step emergency instructions based on the selected emergency while waiting for the unit.
*   🗂️ **Glassmorphic Medical ID**: A premium, encrypted user profile storing critical health records (blood type, pre-existing conditions, medications, emergency contacts, insurance).
*   📋 **Incident Log Drawer**: Complete history log tracking past requests. Clicking an entry opens a receipt detailing booking ref, driver credentials, and admitted hospital.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React.js (Vite)
- **Styling**: Vanilla CSS (Harmonious Dark Theme, glassmorphism, pulse micro-animations)
- **Mapping**: Leaflet / React Leaflet (OpenStreetMap Tiles)
- **Icons**: Lucide React

### Backend & Database
- **Runtime**: Node.js / Express
- **ORM**: Prisma ORM
- **Database**: PostgreSQL
- **Environment**: Dotenv

---

## 📐 Architecture Diagram

```mermaid
graph TD
    UserClient[React Frontend] <-->|HTTP API / SSE| ExpressServer[Express Backend]
    ExpressServer <-->|Prisma Client| PGDB[(PostgreSQL Database)]
    UserClient <-->|Render Maps| OpenStreetMap[Leaflet Maps Engine]
    ExpressServer <-->|Lookup Geo distance| GeolocationHelper[Geo Distance Engine]
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- PostgreSQL running locally or remotely

### 1. Database Configuration
Create a `.env` file in the root folder of the project with your PostgreSQL connection URL:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/swiftaid?schema=public"
PORT=3000
```

Run the Prisma migrations to set up database schemas:
```bash
npx prisma migrate dev --name init
```

Seed the database with mock ambulances, hospitals, and drivers:
```bash
node prisma/seed.js
```

### 2. Run the Backend Server
Navigate to the root directory and install dependencies:
```bash
npm install
node index.js
```
*The server will boot up on `http://localhost:3000`.*

### 3. Run the Frontend Server
Navigate to the frontend folder, install dependencies, and start the Vite dev server:
```bash
cd frontend
npm install
npm run dev
```
*The React app will boot up on `http://localhost:5173`.*

---

## 📂 Directory Structure

```text
swiftaid/
├── backend/                  # Legacy/Config backend services
├── controllers/              # Express route controller handlers
│   ├── ambulanceController.js # Dispatch, matching, and triage patching
│   └── profileController.js   # Medical ID & incident history management
├── routes/                   # Router endpoints
│   └── ambulance.js          # REST mappings for client APIs
├── prisma/                   # Database migrations, seed data, and schema
│   ├── schema.prisma         # Postgres schemas for Users, Profiles, Requests
│   └── seed.js               # Mock database generators
├── frontend/                 # Vite + React Client
│   ├── src/
│   │   ├── components/       # Pages (Home, Matching, Congratulations, Tracking)
│   │   ├── App.jsx           # App state router
│   │   ├── index.css         # Styling system & custom UI variables
│   │   └── main.jsx          # DOM Entrypoint
│   └── package.json
├── index.js                  # Express Entrypoint
└── package.json              # Backend dependencies
```

---

## 🛡️ License & Attributions
This project is built as a SwiftAid Emergency Services MVP. Created and maintained for fast paramedic transport matching and admission optimization.
