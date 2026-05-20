# ⚡ SwiftAid – MVP v0.1 Documentation

*Frictionless ambulance booking in the moments that matter.*

## 🧭 Overview
SwiftAid is a mobile-first emergency dispatch web application designed to eliminate the friction of booking an ambulance during critical moments. The core objective of this MVP is to allow a user to successfully request an ambulance and receive dispatch confirmation in under **30 seconds** without requiring a login or navigating complex menus.

---

## 🛠️ Technology Stack
- **Frontend**: React 19, Vite, Leaflet & React-Leaflet (for Maps), Lucide React (for iconography).
- **Backend**: Node.js, Express.js.
- **Database**: PostgreSQL with Prisma ORM.
- **Styling**: Vanilla CSS, leveraging CSS variables, glassmorphism, and responsive mobile-first layouts.

---

## 📱 Frontend Architecture & Flow

The frontend is broken down into distinct page components managed by a central state in `App.jsx`. 

### 1. The Intake Phase (`HomePage.jsx`)
- **Objective**: Get the absolute bare minimum information to identify the user.
- **UI**: A dark-mode, high-contrast screen requesting only a 10-digit phone number.
- **Action**: Submitting the form triggers the geolocation pipeline.

### 2. The Location Pipeline (`App.jsx`)
- **Frictionless Tracking**: The app first attempts to resolve the user's location using a free IP Geolocation API (`ipapi.co`). This requires zero permissions and works instantly.
- **Fallback**: If IP location fails, it triggers the HTML5 `navigator.geolocation` prompt.
- **Fail-Safe**: If all else fails, it defaults to a central coordinate (Delhi NCR) to ensure the demo/MVP never breaks.

### 3. The Matching Phase (`MatchingPage.jsx`)
- **Visual Reassurance**: Once coordinates are acquired, the user is presented with a live OpenStreetMap centered on their location.
- **Radar & Nearby Fleets**: A pulsing radar circle is drawn, and the `GET /api/ambulances` endpoint is hit to populate the map with markers of available ambulances nearby.
- **Quick Triage**: While the app artificially delays for 6 seconds (to simulate finding the best route), an overlay asks the user: *"What is the emergency?"* (e.g., Accident, Heart Issue, Breathing). Selecting an option provides instant UI feedback.
- **Action**: Behind the scenes, `POST /api/request-ambulance` is called to lock in the nearest ambulance.

### 4. The Dispatch Phase (`TrackingPage.jsx`)
- **Confirmation**: Upon successful backend matching, this page takes over.
- **Live Animation**: The map zooms to fit both the user and the assigned ambulance. A 60FPS Javascript interval smoothly animates the ambulance marker moving across the map toward the user's pin.
- **Dynamic ETA**: As the ambulance marker moves closer, the ETA dynamically ticks down to `0`.
- **Driver Details**: A prominent bottom sheet displays the Booking ID, Provider Name, Driver Name, the reported emergency type, and a quick-action "Call" button.

---

## ⚙️ Backend Architecture & Logic

### Data Models (`schema.prisma`)
1. **`Ambulance`**: Stores driver/provider info, latitude, longitude, and an `isAvailable` boolean flag.
2. **`Request`**: Stores the user's phone, location, the linked Ambulance ID, and the status (`PENDING`, `ASSIGNED`, `COMPLETED`).

### API Endpoints
1. `GET /api/ambulances`
   - Returns a list of all ambulances in the database. Used by the frontend to populate the nearby map during the Matching phase.
   
2. `POST /api/request-ambulance`
   - **Payload**: `{ phoneNumber, latitude, longitude }`
   - **Logic**:
     1. Creates a `PENDING` request in the database.
     2. Fetches all ambulances where `isAvailable == true`.
     3. Uses the **Haversine Formula** to calculate the distance between the user's coordinates and every available ambulance.
     4. Selects the ambulance with the shortest distance.
     5. Calculates a realistic mock ETA based on the distance (`distanceKm * 3 + 2 mins`).
     6. Updates the chosen ambulance to `isAvailable: false`.
     7. Updates the request to `ASSIGNED` and returns the payload to the frontend.

### Seeding (`seed.js`)
A robust `npm run seed` script exists to wipe the database and generate **40 synthetic ambulances** spread across a ~20km radius of the test zone, guaranteeing a seamless demo experience.

---

## 🚀 How to Run Locally

To test or develop the MVP, you must run both the frontend and backend servers.

1. **Start the Backend Server**
   Open a terminal in the root directory (`swiftaid/`):
   ```bash
   node index.js
   ```
   *(Runs on http://localhost:3000)*

2. **Start the Frontend Application**
   Open a second terminal, navigate to the frontend folder:
   ```bash
   cd frontend
   npm run dev
   ```
   *(Runs on http://localhost:5173)*

3. **Reset Database (Optional)**
   If you ever run out of available ambulances during testing, just run:
   ```bash
   npm run seed
   ```
