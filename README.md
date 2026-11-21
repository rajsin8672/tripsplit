# TripSplit — Share Expenses. Settle Simply.

TripSplit is a modern travel expense-sharing web application built for groups of friends, road trips, and vacations. It tracks group trip expenses with integer-paise accuracy, minimizes debts through fair Min-Cash-Flow graph calculation algorithms, and facilitates peer-to-peer settlements directly via external UPI payments.

**Project Status: Phase 1 + Phase 2 + Phase 3 Complete & Production-Ready.**

---

## Key Features

1. **Authentication & User Profiles (Phase 1)**:
   - Firebase Authentication with persistent local sessions across page reloads.
   - Cloud Firestore `users` collection with unique collision-free User Codes (format `TS-XXXXXX`).
   - Profile management with linked UPI ID (VPA) and strict immutability checks on core identity.

2. **Trips & Group Management (Phase 2)**:
   - Create trips with destination, dates, currency (`INR`), and description. Creator assigned as `OWNER`.
   - Comprehensive Trip Dashboard with 5 integrated tabs: Overview, Expenses, Members, Balances, Settlements.
   - Peer invitations using Email or unique User Code (`TS-XXXXXX`) with duplicate prevention.
   - Full membership lifecycle (`ACTIVE`, `LEFT`, `OWNER`, `MEMBER`).
   - Safe trip ending and balance-checked trip departure.

3. **Expense Management & Mathematical Precision (Phase 2)**:
   - Strict integer paise accounting: ₹5000 = 500000 paise. No floating-point roundoff errors in database.
   - Three split models:
     - **Equal Split**: Deterministic integer remainder distribution (1 extra paisa distributed to sorted participant IDs).
     - **Exact Split**: User-defined rupee shares validated against total bill.
     - **Percentage Split**: Percentage allocations summing to 100.00% with rounding residue absorption.
   - Mandatory mathematical invariant: `SUM(splits.allocatedAmount) === expense.totalAmount`.
   - Expense categorization, receipt notes, explicit participant checkboxes, editing, and deletion.

4. **Balances & Min-Cash-Flow Settlement Engine (Phase 2 & 3)**:
   - Individual ledger calculation: `Net Balance = Total Paid - Total Share`.
   - Mathematical guarantee: `SUM(all member net balances) === 0`.
   - **Min-Cash-Flow algorithm**: Greedily matches largest debtors with largest creditors to minimize total peer-to-peer payment transfers.
   - Zero self-transactions, zero negative amounts, and total debtor payments strictly equal total creditor receipts.

5. **Manual UPI Payment System (Phase 3)**:
   - Virtual Payment Address (VPA) storage and syntax validation.
   - Dynamic standard UPI URI generation: `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...`.
   - Client-side pure JavaScript QR Code Model 2 SVG generator (zero external CDNs, strict CSP-compliant).
   - "Open in UPI App" deep link, Copy UPI ID, and Copy Amount buttons.
   - **"I Paid" flow**: Debtor submits 12-digit bank UTR reference, recorded with status `REPORTED`.
   - **Receiver confirmation**: Recipient verifies bank account and confirms payment via atomic Firestore transaction, marking settlement `PAID`.
   - Double-confirmation, self-confirmation, and duplicate UTR protections.
   - Comprehensive Payment Claims ledger (`public/payments.html`).

---

## Technology Stack

- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System with brand custom properties), Vanilla JavaScript (ES Modules).
- **Backend**: Node.js (v18+ LTS), Express.js (REST APIs, static serving, security headers, rate limiting).
- **Authentication**: Firebase Authentication (Email/Password, persistent local session).
- **Database**: Google Cloud Firestore (8 collections: `users`, `trips`, `trip_members`, `invitations`, `expenses`, `expense_splits`, `settlements`, `payments`).
- **Server-Side Firebase**: Firebase Admin SDK (token verification, atomic transactions, batch writes).
- **Deployment**: Render (One Web Service process serving static frontend and REST API).
- **Testing**: Node.js native test runner (`node --test`, `supertest`) with 82 automated test cases.

---

## Project Structure

```
TripSplit/
├── public/
│   ├── index.html            # Landing page (Hero, Features, How It Works)
│   ├── about.html            # Mission, architecture principles
│   ├── faq.html              # Frequently asked questions & help
│   ├── login.html            # Email/password login & password reset
│   ├── register.html         # User registration with validation & terms
│   ├── dashboard.html        # Authenticated trips explorer & invitation inbox
│   ├── trip.html             # Trip command center (Overview, Expenses, Members, Balances, Settlements)
│   ├── payments.html         # UPI payment claims & transaction history
│   ├── profile.html          # Profile management (display name, linked UPI ID)
│   ├── privacy.html          # Comprehensive Privacy Policy
│   ├── terms.html            # Terms and Conditions
│   ├── contact.html          # Contact & support submission form
│   ├── 404.html              # Custom 404 error page
│   ├── favicon.svg           # Scalable SVG brand favicon
│   ├── robots.txt            # Search engine crawler directives
│   ├── sitemap.xml           # XML sitemap covering all public routes
│   ├── css/
│   │   ├── variables.css     # Design tokens and brand palette
│   │   ├── base.css          # Reset, accessible typography, focus rings
│   │   ├── components.css    # Buttons, cards, tabs, stats, modal, tables, alerts
│   │   ├── layout.css        # Navbar, hero, grids, footer
│   │   ├── auth.css          # Login, register, and profile layouts
│   │   └── responsive.css    # Responsive breakpoints and mobile drawer
│   └── js/
│       ├── firebase-config.js# Modular Firebase SDK client configuration
│       ├── api.js            # Fetch client with auto Bearer token injection (GET, POST, PATCH, DELETE)
│       ├── auth.js           # Firebase Auth methods (register, login, logout, reset)
│       ├── auth-guard.js     # Route protection and auth state redirection
│       ├── navigation.js     # Responsive navbar state and dynamic buttons
│       ├── login.js          # Login form controller
│       ├── register.js       # Registration form controller
│       ├── dashboard.js      # Dashboard controller (trips list, metrics, create trip modal)
│       ├── trip.js           # Trip controller (tabs, expenses CRUD, members, balances, settlements, UPI)
│       ├── payments.js       # Payments ledger controller (claims, confirm, reject)
│       ├── profile.js        # Profile viewer & editor controller
│       ├── qrcode.js         # Client-side QR Code Model 2 SVG generator (zero CDNs)
│       ├── ui.js             # UI alerts, loading states, DOM safety, escapeHtml
│       └── validation.js     # Client-side input validation
├── server/
│   ├── server.js             # Canonical Express server entry point
│   ├── config/
│   │   ├── firebaseAdmin.js  # Firebase Admin SDK initialization & test mock fallback
│   │   └── mockFirestore.js  # In-memory Firestore & Auth mock engine for automated offline testing
│   ├── middleware/
│   │   ├── authenticate.js   # Bearer ID token verification middleware
│   │   └── errorHandler.js   # Centralized JSON error handler & API 404
│   ├── routes/
│   │   ├── healthRoutes.js   # GET /api/health
│   │   ├── authRoutes.js     # POST /api/auth/sync
│   │   ├── userRoutes.js     # GET /api/users/me, PATCH /api/users/me
│   │   ├── tripRoutes.js     # /api/trips routes (CRUD, end, leave, members, invitations, expenses, balances, settlements)
│   │   ├── invitationRoutes.js # /api/invitations (list, accept, reject, cancel)
│   │   ├── settlementRoutes.js # /api/settlements (payments submission)
│   │   └── paymentRoutes.js  # /api/payments (list, confirm, reject)
│   ├── controllers/          # Controllers coordinating services and HTTP responses
│   ├── services/
│   │   ├── userService.js    # Firestore user profile service
│   │   ├── tripService.js    # Trip lifecycle, membership, end trip, leave trip
│   │   ├── invitationService.js # Peer invitations & duplicate prevention
│   │   ├── memberService.js  # Joined member profiles
│   │   ├── expenseService.js # Integer paise expense ledger & split models
│   │   ├── balanceService.js # Balance calculations & SUM=0 invariant audit
│   │   ├── settlementService.js # Min-Cash-Flow calculation & persistence
│   │   └── paymentService.js # Manual UPI reporting, confirmation, rejection
│   └── utils/
│       ├── validation.js     # Server-side validation rules & userCode generator
│       ├── money.js          # Integer paise conversion, remainder rule, split calculations
│       ├── settlementEngine.js # Min-Cash-Flow graph debt minimization algorithm
│       └── upi.js            # Standard upi://pay URI generator & UTR validator
├── tests/
│   ├── health.test.js        # Server health & route protection tests
│   ├── validation.test.js    # Input validation unit tests
│   ├── profile.test.js       # Profile route protection tests
│   ├── money.test.js         # Integer paise precision & split calculations tests
│   ├── settlement.test.js    # Balance calculation & Min-Cash-Flow tests
│   ├── upi.test.js           # UPI URI formatting & UTR validation tests
│   ├── trips.test.js         # Trip CRUD, access control, end & leave trip tests
│   ├── invitations.test.js   # Invitation lifecycle & duplicate prevention tests
│   ├── expenses.test.js      # Expense creation, splits, and ended trip freeze tests
│   ├── payments.test.js      # Payment submission, confirm, reject, duplicate tests
│   └── e2e-acceptance.test.js# 16-Step End-to-End Acceptance Scenario (Karan, Rahul, Aman on Goa Trip)
├── firestore.rules           # Firestore Security Rules (denies direct client writes)
├── firestore.indexes.json    # Composite Firestore indexes
├── .env.example              # Environment variable template
├── package.json              # NPM dependencies and scripts
├── PROJECT_CONTEXT.txt       # Authoritative persistent project memory
├── CHANGELOG.md              # Historical change record
└── README.md                 # Project documentation
```

---

## API Endpoints Summary

### Public
- `GET /api/health`: Health status, uptime, and Firebase connection state.
- `GET /api/config/firebase`: Safe client web configuration for browser.

### Authentication & Profiles (Protected)
- `POST /api/auth/sync`: Syncs authenticated user profile with Firestore.
- `GET /api/users/me`: Retrieves current authenticated user profile.
- `PATCH /api/users/me`: Updates display name or UPI ID.

### Trips & Members (Protected)
- `POST /api/trips`: Creates a new trip.
- `GET /api/trips`: Lists trips created or joined by user (filters: `status`, `q`).
- `GET /api/trips/:tripId`: Retrieves detailed trip information.
- `PATCH /api/trips/:tripId`: Updates trip settings (OWNER only).
- `POST /api/trips/:tripId/end`: Ends trip and freezes new financial changes.
- `POST /api/trips/:tripId/leave`: Leaves trip (verifies net balance === 0).
- `GET /api/trips/:tripId/members`: Lists trip members with joined profiles.

### Invitations (Protected)
- `POST /api/trips/:tripId/invitations`: Invites friend by email or User Code.
- `GET /api/invitations`: Lists pending invitations for user.
- `GET /api/trips/:tripId/invitations`: Lists sent invitations for trip.
- `POST /api/invitations/:invitationId/accept`: Accepts trip invitation.
- `POST /api/invitations/:invitationId/reject`: Rejects trip invitation.
- `POST /api/invitations/:invitationId/cancel`: Cancels pending invitation.

### Expenses & Balances (Protected)
- `POST /api/trips/:tripId/expenses`: Records expense with EQUAL, EXACT, or PERCENTAGE splits.
- `GET /api/trips/:tripId/expenses`: Lists all expenses with split allocations.
- `GET /api/trips/:tripId/expenses/:expenseId`: Gets single expense.
- `PATCH /api/trips/:tripId/expenses/:expenseId`: Updates expense and splits.
- `DELETE /api/trips/:tripId/expenses/:expenseId`: Deletes expense and splits.
- `GET /api/trips/:tripId/balances`: Calculates member balances and verifies sum equals zero.

### Settlements & Payments (Protected)
- `POST /api/trips/:tripId/settlements/calculate`: Generates Min-Cash-Flow settlements.
- `GET /api/trips/:tripId/settlements`: Lists optimized settlements.
- `POST /api/settlements/:settlementId/payments`: Submits "I Paid" claim with UTR.
- `GET /api/payments`: Lists user's sent, received, or pending payment claims.
- `POST /api/payments/:paymentId/confirm`: Receiver confirms payment (marks settlement PAID).
- `POST /api/payments/:paymentId/reject`: Receiver rejects payment claim.

---

## Local Development & Testing

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Automated Test Suite**:
   ```bash
   npm test
   ```
   Executes 82 tests across 25 suites using Node.js native test runner and isolated in-memory test engine.

3. **Start Local Server**:
   ```bash
   npm start
   ```
   Accessible at `http://localhost:3000` (or `PORT=3002 npm start`).

---

## Render Deployment

TripSplit is configured for deployment as **One Render Web Service**:
- **Environment**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Environment Variables**:
  - `PORT`: 10000 (Render default)
  - `NODE_ENV`: production
  - `FIREBASE_PROJECT_ID`: Your Firebase Project ID
  - `FIREBASE_CLIENT_EMAIL`: Service Account Email
  - `FIREBASE_PRIVATE_KEY`: Service Account Private Key with `\n` linebreaks
  - `FIREBASE_API_KEY`: Firebase Web API Key
  - `FIREBASE_AUTH_DOMAIN`: `<project-id>.firebaseapp.com`
  - `FIREBASE_STORAGE_BUCKET`: `<project-id>.appspot.com`
  - `FIREBASE_MESSAGING_SENDER_ID`: Sender ID
  - `FIREBASE_APP_ID`: Web App ID

---

## License

ISC © TripSplit Team. Peer-to-peer travel expense tracking utility. Not a bank or payment processor.
