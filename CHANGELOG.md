# Changelog

All notable changes to the TripSplit codebase across Phase 1, Phase 2, and Phase 3 are documented in this file.

## [2.0.0] - Phase 2 & Phase 3: Complete Trip & Expense Management, Min-Cash-Flow Settlements & Manual UPI Payments - 2026-11-20

### Added
- **Phase 2: Trips & Group Management**:
  - `server/services/tripService.js`: Full CRUD lifecycle for group travel.
    - Trip creation with unique ID (`TRIP-XXXXXX`), creator designated as `OWNER`.
    - User trip listing with filters for `ACTIVE` and `ENDED` states, and search by title or destination.
    - End trip state transition: freezes new expenses, invitations, and financial edits atomically.
    - Leave trip validation: blocks leaving if net balance !== 0; permits leaving if balance is zero with automatic owner handover.
  - `server/services/invitationService.js`:
    - Peer-to-peer invitations using recipient email or unique User Code (`TS-XXXXXX`).
    - Duplicate invitation prevention and duplicate active membership prevention.
    - Status lifecycle: `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`.
    - Authorization check ensuring only intended recipients can accept/reject invitations.
  - `server/services/memberService.js`:
    - Joined member directory with real-time roles (`OWNER`, `MEMBER`) and statuses (`ACTIVE`, `LEFT`).
  - REST Endpoints mounted under `/api/trips` and `/api/invitations`.

- **Phase 2: Expense Management & Integer Paise Accounting**:
  - `server/utils/money.js`:
    - Strict integer paise conversion (`rupeesToPaise`) and currency formatting (`formatPaiseToRupees`).
    - Mandatory mathematical invariant: `SUM(splits.allocatedAmount) === expense.totalAmount`.
    - `calculateEqualSplit`: deterministic remainder distribution rule (adds 1 paisa to the first `remainder` participants in sorted order).
    - `calculateExactSplit`: exact user-defined rupee/paise amounts with sum validation.
    - `calculatePercentageSplit`: exact percentage splits summing to 100.00% with rounding discrepancy adjustment.
  - `server/services/expenseService.js`:
    - Atomic writes to `expenses` and `expense_splits` collections.
    - Multi-category support (Accommodation, Food, Transport, Fuel, Activities, Shopping, Tickets, Other).
    - Explicit participant selection (preventing accidental default opt-in).
    - Edit and delete permissions restricted to creator or trip owner.
    - Prevention of financial modifications once a trip is ended.
  - `server/services/balanceService.js`:
    - Computes `Total Paid`, `Total Share`, and `Net Balance = Total Paid - Total Share`.
    - Audits `SUM(all member net balances) === 0` across all transactions.

- **Phase 3: Settlement Engine**:
  - `server/utils/settlementEngine.js`:
    - Greedily matches largest debtors with largest creditors using the **Min-Cash-Flow algorithm**.
    - Minimizes total number of peer-to-peer cash transactions required to settle the trip.
    - Guarantees no self-transactions and no zero or negative transfer amounts.
    - Enforces balance reconciliation verification before generating settlement objects.
  - `server/services/settlementService.js`:
    - `calculateAndSaveSettlements`: generates and persists settlement transactions in `settlements` collection.
    - Preserves previously confirmed (`PAID`) settlements upon recalculation.

- **Phase 3: Manual UPI Payment System**:
  - `server/utils/upi.js`:
    - Standard URI builder: `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...`.
    - UPI transaction reference (UTR / RRN) syntax validator.
  - `public/js/qrcode.js`:
    - Pure JavaScript client-side QR Code Model 2 SVG generator. Zero external CDNs; CSP-safe.
  - `server/services/paymentService.js`:
    - "I Paid" submission flow: debtor submits 12-digit UTR, recorded with status `REPORTED`.
    - Duplicate UTR prevention within the trip.
    - Debtor self-confirmation prevention (debtors cannot confirm their own claims).
    - Receiver confirmation: atomic Firestore transaction updates payment to `CONFIRMED` and settlement to `PAID`.
    - Receiver rejection: updates payment to `REJECTED` with reason; settlement remains `PENDING` for resubmission.
    - Double confirmation prevention: rejects attempts to re-confirm already completed payments.
  - REST Endpoints mounted under `/api/settlements` and `/api/payments`.

- **Frontend User Interface & Pages**:
  - Upgraded `public/dashboard.html` & `public/js/dashboard.js`:
    - Active trips, ended trips, pending invitations, and active group expense metrics.
    - Create Trip modal with live validation.
    - Search toolbar and filter pills (`All`, `Active`, `Ended`).
    - Pending invitations alert box with 1-click Accept / Decline.
  - `public/trip.html` & `public/js/trip.js`:
    - 5-tab responsive trip command center: Overview, Expenses, Members, Balances, Settlements.
    - Interactive Add/Edit Expense modal with live split calculation and remainder notice.
    - UPI Payment Modal with Payee VPA, Amount, dynamic SVG QR Code, "Open in UPI App" deep link, and "I Paid" UTR submission.
    - Receiver confirmation UI for incoming payment claims.
  - `public/payments.html` & `public/js/payments.js`:
    - Full payment claims ledger with filters for incoming claims, sent payments, and confirmed settlements.
  - Legal & Informational Pages:
    - `public/privacy.html`: Comprehensive privacy policy detailing data handling, Firestore storage, and manual UPI reference privacy.
    - `public/terms.html`: Terms & Conditions clarifying peer-to-peer tracking utility, absence of banking/payment gateway liability.
    - `public/contact.html`: Contact & support form with validated inputs.
  - Security & Infrastructure:
    - `firestore.rules`: Strict Firestore Security Rules denying direct browser writes to server-managed collections.
    - `firestore.indexes.json`: Composite Firestore indexes for trips, expenses, members, invitations, settlements, and payments.
    - `public/robots.txt` & `public/sitemap.xml`: Updated directives including all new pages.
    - Non-intrusive AdSense container slots in dashboard and legal pages.

- **Automated Test Suite**:
  - 82 automated test cases across 25 suites covering:
    - Validation utilities, money precision, and split invariants.
    - Min-Cash-Flow engine and net balance reconciliation.
    - UPI URI generation and UTR validation.
    - Server endpoints, rate limiting, and route protection.
    - Trip creation, member access control, leave trip, and end trip.
    - Invitations lifecycle and duplicate prevention.
    - Expense creation, splitting (EQUAL, EXACT, PERCENTAGE), editing, deletion.
    - Payments reporting, duplicate UTR prevention, receiver confirmation/rejection, self-confirmation prevention.
    - Full 16-Step End-to-End Acceptance Test scenario (Karan, Rahul, Aman on Goa Trip).

## [1.0.0] - Phase 1: Complete Foundation & Authentication - 2026-10-16
- Initialized Node.js ES Modules application with Express server and Render-ready architecture.
- Added Firebase Authentication and Cloud Firestore `users` collection.
- Implemented user profile creation, unique User Code generation (`TS-XXXXXX`), and safe updates.
- Added responsive landing, login, register, profile, and dashboard pages.
