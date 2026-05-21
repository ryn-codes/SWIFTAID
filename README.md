# SwiftAid 🚑 

> **Premium Emergency Dispatch & ICU Bed Admission Platform**

SwiftAid is a modern, real-time emergency responder dispatch application designed to bridge the gap between users in critical distress, paramedic drivers, and emergency hospital care. By combining instantaneous IP/GPS location mapping, live vehicle tracking, dynamic triage nudges, and secure ICU bed reservations, SwiftAid ensures help arrives prepared and hospital admissions are secured before the ambulance pulls up.

---

## 🌟 Key Features

*   ⚡ **Instant SOS Geolocation**: Dual-mode location acquisition utilizing fast IP-based lookup with high-accuracy browser GPS fallback.
*   🚑 **Intelligent Matchmaking**: Scans active paramedic fleets in real-time, matching the closest unit and securing the transport.
*   🎙️ **Gemini-Powered Voice SOS**: Real-time voice description transcription and triage parsing. Holding the recording button triggers the Gemini API (`gemini-flash-latest`) to capture the user's spoken voice description, transcribe it, extract the emergency type, and evaluate severity. Features an interactive Canvas-based audio wave visualizer and auto-stop on silence.
*   🩺 **Real-Time Triage Sync**: Synchronizes the user’s selected emergency type (e.g., Cardiac Arrest, Trauma, Stroke, Breathing Difficulty) directly to the active responder's vehicle terminal.
*   🤫 **Undercover "Silent SOS" Disguise**: A stealth tracking mode that hides the emergency UI behind a mock news reading site ("DailyDigest News"). Dispatch ETA is hidden as order shipment tracking stats, and paramedic instructions/chat are disguised as an inconspicuous customer support chat box.
*   🩹 **First-Aid Interactive Guidelines**: Provides tailored, step-by-step emergency instructions based on the selected emergency while waiting for the unit (supporting text-to-speech audio reader accessibility).
*   🗂️ **Active Two-Way Profile Sync**: Real-time database synchronisation of Medical ID demographics, contacts, and clinical details using Postgres+Prisma based on the user's phone number. Typing a phone number on either the home screen or profile page instantly looks up past records.
*   📋 **Incident Log Drawer**: Complete history log tracking past requests. Clicking an entry opens a receipt detailing booking ref, driver credentials, and admitted hospital.
*   ⭐️ **Post-Care Feedback**: Dedicated review flow allowing users to rate and review the dispatch and bed reservation quality after arrival.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React.js (Vite)
- **Styling**: Vanilla CSS (Harmonious Dark Theme, glassmorphism, pulse micro-animations)
- **Mapping**: Leaflet (OpenStreetMap Tiles with custom CSS dark-theme filters)
- **Voice/Audio**: Web Audio API (MediaRecorder, AnalyserNode, Canvas Equalizer)
- **Icons**: Lucide React

### Backend & Database
- **Runtime**: Node.js / Express
- **AI Engine**: Google Gemini API SDK (`gemini-flash-latest`)
- **ORM**: Prisma ORM
- **Database**: PostgreSQL
- **Environment**: Dotenv

---

## 📐 Architecture Diagram

```mermaid
graph TD
    UserClient[React Frontend] <-->|HTTP API / SSE / Web Audio| ExpressServer[Express Backend]
    ExpressServer <-->|Prisma Client| PGDB[(PostgreSQL Database)]
    UserClient <-->|Render Maps| OSMTiles[OpenStreetMap Engine]
    ExpressServer <-->|Transcribe & Parse SOS| GeminiAPI[Google Gemini Flash API]
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- PostgreSQL running locally or remotely
- Google Gemini API Key

### 1. Database & Environment Configuration
Create a `.env` file in the root folder of the project:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/swiftaid?schema=public"
PORT=3000
GEMINI_API_KEY="your_google_gemini_api_key"
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
cmd.exe /c npm run dev
```
*The React app will boot up on `http://localhost:5173`.*

---

## 📂 Directory Structure

```text
swiftaid/
├── backend/                  # Legacy/Config backend services
├── controllers/              # Express route controller handlers
│   ├── ambulanceController.js # Dispatch, matching, and Gemini Voice SOS triage
│   └── profileController.js   # Medical ID & incident history management
├── routes/                   # Router endpoints
│   └── ambulance.js          # REST mappings for client and audio APIs
├── prisma/                   # Database migrations, seed data, and schema
│   ├── schema.prisma         # Postgres schemas for Users, Profiles, Requests
│   └── seed.js               # Mock database generators
├── frontend/                 # Vite + React Client
│   ├── src/
│   │   ├── components/       # Pages & Components:
│   │   │   ├── HomePage.jsx               # Dashboard, stats, Voice SOS triggers
│   │   │   ├── MatchingPage.jsx           # Ambulance search & triage details
│   │   │   ├── TrackingPage.jsx           # Live map route, Silent SOS disguise, guidelines
│   │   │   ├── ProfilePage.jsx            # Medical ID entry and database synchronization
│   │   │   ├── HistoryPage.jsx            # Incident records & past logs drawer
│   │   │   ├── CongratulationsPage.jsx    # Successful dispatch booking confirmation
│   │   │   ├── PostCareFeedbackPage.jsx   # Post-arrival rating & feedback workflow
│   │   │   └── Map.css                    # Styling for Leaflet controls and dark-mode filters
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
