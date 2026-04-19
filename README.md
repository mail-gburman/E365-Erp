# KPS ERP Enterprise v4

A larger full-stack starter for **KPS PRODUCTIONS AND SERVICES LLP / KPS Studios**.

## Included in this version
- Login + roles (`admin`, `operations`, `store`)
- PostgreSQL-ready backend with SQLite fallback
- Deployment starter via Docker Compose
- KPS branded frontend using your logo
- Analytics dashboard with chart-style cards
- Warehouses, vendors, inventory, crew, procurement masters
- Inventory item typing:
  - device
  - accessory
  - kit
  - bundle
  - third_party_equipment
  - consumable
- Multiple devices and multiple manpower per shoot/event
- Accessories can be linked to a parent item
- Automatic shoot blocking logic:
  - input shoot start
  - input setup days
  - input travel hours
  - input shoot hours
  - input return hours
  - system auto-calculates blocking window
- Robust booking checks:
  - start cannot be after end
  - duplicate equipment/crew blocked
  - service items cannot be booked
  - cancelled / returned bookings ignored for overlap rules
  - accessory / item status checks
  - at least one crew or equipment required
- Service jobs with downloadable branded PDF
- Outbound / movement papers with downloadable branded PDF
- Return QC checklist
- Vendor master + third-party procurement tracking

## Demo login
- admin / admin123
- operations / ops123
- store / store123

## Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
uvicorn app.main:app --reload --port 8000
```

## Frontend
```bash
cd frontend
npm install
npm run dev
```

## Docker deployment starter
From project root:
```bash
docker compose up --build
```

## Important note
This is a strong starter and business-logic scaffold, not a finished production ERP. It includes functional flows and a database-backed full project structure, but you should still extend:
- audit logging
- approvals
- file uploads
- signatures
- notifications
- GST/statutory document workflows
- hardened authentication and password policies


## v4.1 fixes and deployment changes
- Replaced bcrypt hashing with `pbkdf2_sha256` for stable Linux installs
- Removed Docker-first assumption; added plain Linux/AWS deployment files
- Added extra business rules:
  - cannot create a booking for a closed project
  - destination is required
  - accessory-only booking is rejected unless at least one device/kit/bundle/third-party equipment is also selected
  - same asset cannot be selected twice across equipment/accessories
  - same crew member cannot be selected twice
  - inactive/cancelled inventory or manpower cannot be assigned
  - service job cannot be opened for equipment already in an active booking
  - return QC is required before a booking can be marked returned
- Added Linux deployment helpers:
  - `deploy/linux/kps-backend.service`
  - `deploy/nginx/kps.conf`
  - `deploy/linux/deploy_backend.sh`
  - `deploy/linux/deploy_frontend.sh`

## Linux server deployment
Backend:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Production on Linux/AWS EC2 is intended to run with:
- FastAPI/Uvicorn behind Nginx
- PostgreSQL on the same server or RDS
- systemd to keep the backend running on boot

## AWS recommendation
For a straightforward non-Docker deployment:
- EC2 for app server
- PostgreSQL on RDS
- Security groups to restrict SSH/HTTP/HTTPS and DB access
- IAM role for instance permissions


## v4.2 additions
- Auto-generated unique statutory/operational codes:
  - vendor code
  - client code
  - product code
  - asset code
  - employee code
  - procurement code
  - PO number
  - paper number
  - service job number
- Client master now supports multiple contacts with:
  - contact name
  - designation
  - email
  - country code
  - phone number
  - primary contact flag
- PDF endpoints are publicly viewable so you can open already-generated samples and newly-created PDFs directly from the browser after login.


## v5.1 fixes
- QC entries are now visible in a dedicated Operations table.
- Gate passes are visible in a dedicated Operations table.
- Service jobs now have a details endpoint and refresh immediately after create/complete/cancel.
- Added an Equipment Master section.
- Booking forms now use dropdowns/selector lists for project, client, warehouse, equipment, accessories, manpower, booking relation and service relation.
- Added auto gate-out and gate-in generation for bookings.


## v6 additions
- Admin user creation, update, disable/enable and delete screen
- Role-based user administration scaffold
- Permissions JSON per user for module-level access policy
- Partial return workflow for item-level returns
- Chain-of-custody log
- Auto gate-out and gate-in chain entries
- Equipment Master
- Immediate reload after create/update/complete/cancel on all major screens
- All major booking/resource relations are master-driven selectors/dropdowns instead of manual free-text entry


## v7 production-hardening pass
- Route-level permission enforcement using `permissions_json` and role defaults across modules
- Alembic scaffold added for real schema migrations
- Audit log made append-only in application flow; create/update/delete operations now append immutable audit rows
- File uploads for statutory documents with download endpoint
- Stronger workflow validation:
  - exactly one primary client contact
  - final return requires QC and item-level partial-return records for all booked items
- Workflow approvals strengthened with auto gate passes and chain-of-custody logging
- Health endpoint added
- Backup/restore helper endpoints and Linux shell scripts added
- Hardened Nginx TLS config and stricter systemd sandboxing for Linux/AWS deployment
- Seeded `Booking #1` is sample seed data created on first startup to show the flows working immediately.


## v7.1 hotfix
- Fixed syntax error in backup/restore helper endpoint string quoting in `system_router.py`.


## v7.2 additions
- Added richer view tables for bookings, services, and gate passes
- Gate passes are now downloadable as professional branded PDFs
- Gate pass PDF includes:
  - project
  - destination
  - linked equipment
  - linked manpower
  - signature fields for store, dispatch, receiving representative, and manpower lead


## v7.3 additions
- New Audit page with date presets: 1 day, 2 days, 7 days, 1 month, 90 days, custom range, all time
- Category dropdowns for all activity, additions, papers, bookings, equipment, manpower, services, users, documents
- Export audit view to PDF
- Export audit-related data to ZIP
- Admin-only left-bottom sidebar button to erase all data and reseed demo data
- Audit logs now include timestamps and additional booking/QC/partial-return activity


## v7.3.1 UI clarity hotfix
- Added explicit labels and clearer placeholders for all numeric shoot-booking inputs.
- Added a blocking-logic guide card explaining setup days, travel hours, shoot hours, and return hours.


## v7.3.2 UI/help + audit hotfix
- Removed accidental literal `\n` from Shoot Booking form
- Added inline info hints (`i`) with hover help and examples across Shoot Booking inputs
- Expanded right-side guidance so each booking field is explained
- Audit page now shows fallback existing seeded/system data when audit log rows are still empty


## v7.3.3 audit export hotfix
- Fixed mismatch between Audit screen and exported PDF/ZIP.
- Export now uses the same resolved dataset shown on screen, including fallback seeded/system records when audit logs are sparse.


## v7.3.4 audit parity patch
- Tightened Audit PDF/ZIP export to use the exact same resolved rowset and row count as the current screen view.


## v8 client feedback pass
- Added mandatory and optional accessory rules on Equipment Master
- Inventory items can now be linked to an Equipment Master
- Booking now supports search-and-add selectors for equipment, accessories, and manpower instead of large checkbox walls
- Added accessory rule summary and backend validation for mandatory accessories
- Added Job Card & Challan PDF generation on confirmed booking
- Added generic bulk upload in Additions for inventory, clients, crew, vendors, and warehouses
- Inventory bulk upload preserves UNIQUE NUMBER nomenclature from the uploaded KPS workbook where available


## v8.1 dummy-data + auth handling patch
- Added a much larger seeded dataset for warehouses, equipment masters, inventory, accessories, and manpower
- Added seeded mandatory/optional accessory relationships
- Improved frontend handling for expired/invalid tokens so the bulk-upload auth error is clearer
- Additions page now includes a tip explaining login refresh after backend restarts


## v8.2 nomenclature + bulk-upload popup pass
- Interprets UNIQUE NUMBER patterns as company prefix + family/brand/class + running unit/variant
- Added bulk-upload result popup with:
  - row accepted
  - row rejected
  - reason for rejection
  - duplicate code warning
  - missing mandatory column warning
- Added upload progress bar in Additions


## v8.3 import-resilience + master-browser pass
- Bulk upload now uses flexible header detection instead of assuming one rigid Excel layout
- Import failures now return structured popup results instead of plain browser-level `Failed to fetch`
- Added master browser pane for inventory, crew, clients, vendors, warehouses, and equipment master with status fields where applicable
- If mandatory values like UNIQUE NUMBER are missing, the popup now explicitly asks for that row to be corrected


## v8.4 critical import + master registry fix
- Fixed duplicated bulk-upload popup by rewriting Additions page modal rendering
- Fixed row-wise import so one bad row no longer rolls back the whole workbook
- Fixed product_code uniqueness collisions during inventory bulk upload
- Added resilient nested-transaction import with row-level accepted/rejected reporting
- Added full Master Registry with left-side entry list and right-side detail/status pane for inventory, crew, clients, vendors, warehouses, and equipment master


## v8.5 upload-state fix
- Removed fake percentage progress for bulk upload
- Added real UI states: uploading, reading workbook, detecting headers, importing rows, waiting for backend response, completed
- Added a 180-second timeout for bulk upload requests
- Added clearer network/timeout error messages when the backend import route crashes or hangs


## v8.6 import preview pass
- Added workbook scan step before import to show how many rows were detected
- Added per-sheet detected counts and sample detected items before full import
- Upload status now includes detected row count and can show a sample 'adding XYZ item' message based on previewed rows
- This is a preview-based status improvement, not true row-by-row streamed backend progress yet


## v8.7 background import progress + master registry nav
- Replaced long blocking bulk upload with background import jobs
- Added job status polling endpoint so the UI can show actual percentage, current item name, and X out of Y items
- Removed frontend timeout dependency for bulk import by returning job_id quickly and polling progress
- Added sidebar entry for Master Registry to directly browse all inventory, crew, clients, vendors, warehouses, and equipment masters


## v8.8 actual progress wiring fix
- Fixed Additions page to use background import job endpoints instead of the old blocking /bulk-upload request
- Bulk upload now shows actual percentage, current item name, and processed X out of Y items
- Kept Master Registry as the dedicated left-sidebar section for all inventory and master browsing
- Added Inventory Quick View inside Additions for immediate visibility


## v8.8.1 loader wording fix
- Fixed misleading loader text that showed `Adding XYZ · 0 out of Y · 0%`
- Loader now shows a clearer startup state for the first item before any row is completed
- Completion text now says `X out of Y items completed`


## v8.9 progress + first-item hang fix
- Fixed import jobs getting visually stuck on the first item at 0%
- Progress snapshot now reports current started item index, not only completed row count
- Inventory import now uses local monotonic PRD/EQM sequence counters instead of repeated count-based generation that could stall or collide
- Loader now shows `Adding XYZ · current out of total items · %` while a row is in flight


## v8.9.1 backend hang fix
- Replaced count-based product/equipment master code generation inside inventory background imports with monotonic local counters
- Prevents first-row stalls caused by repeated duplicate-code generation during import jobs


## v8.9.2 PDF auth + button layout fix
- Fixed Job Card / Challan, Gate Pass, Service PDF, and Paper PDF buttons to download with auth headers instead of plain anchor links
- Resolved `not authenticated` errors when clicking protected PDF endpoints
- Tightened table button styling so PDF buttons no longer overlap adjacent action buttons


---

## v8.9.3 statutory + UX pass (master branch)
- Statutory validation for Aadhaar (Verhoeff checksum), GSTIN (Luhn-mod-36 + state decode + embedded PAN), PAN, Passport, Voter ID, Driver's Licence
- "Others" ID proof type with free-text description field
- Live validation badges + optional server verify endpoint
- PAN field on Client, Vendor, and Crew forms
- Blood group dropdown + emergency contact on crew
- Booking page 4-tab header: New Booking / Modify Booking / Planned Booking / All Bookings
- Modify Shoot modal: pre-populated with all existing dates, equipment, accessories, and crew
- Country code dropdown on every phone field across the project (100+ countries, India default)


---

# Tier_V Feature Branches

This project is incrementally extended through numbered branches. Each branch builds on all prior branches (merged forward). The final consolidated branch is `Tier_V_FINAL`.

## How to switch branches

```bash
# List all tier branches
git branch -r | grep Tier_V

# Checkout a specific tier
git fetch origin
git checkout Tier_V_01          # Quotations
git checkout Tier_V_02          # E-Way Bill
# ... and so on
git checkout Tier_V_FINAL       # All features merged
```

## What each branch contains

| Branch | Feature | Key files added / changed |
|--------|---------|--------------------------|
| `Tier_V_01` | **Quotation / Proposal module** — quote creation, versioning, expiry, PDF output, convert-to-booking | `backend/app/routers/quotes.py`, `frontend/src/pages/QuotesPage.jsx` |
| `Tier_V_02` | **E-Way Bill** — fields on road challan, vehicle/GSTIN/value, state-crossing detection | `backend/app/routers/eway.py`, frontend E-Way section in Operations |
| `Tier_V_03` | **Purchase Orders** — PO to vendors, GRN, PO→bill matching, approval workflow | `backend/app/routers/purchase_orders.py`, `frontend/src/pages/PurchaseOrdersPage.jsx` |
| `Tier_V_04` | **Petty Cash & Expense Claims** — crew submits receipts, approver clears, links to booking P&L | `backend/app/routers/expenses.py`, `frontend/src/pages/ExpensesPage.jsx` |
| `Tier_V_05` | **Barcode / QR per asset** — QR sticker generation, scan-based dispatch/return | `backend/app/routers/qr.py`, QR section in Master Registry |
| `Tier_V_06` | **HR & Payroll** — salary structure, attendance, leave, payslip, PF/ESI/TDS deductions | `backend/app/routers/payroll.py`, `frontend/src/pages/PayrollPage.jsx` |
| `Tier_V_07` | **Preventive Maintenance Scheduler** — auto service jobs on service-due approach, warranty/insurance alerts | `backend/app/routers/maintenance.py`, maintenance dashboard |
| `Tier_V_08` | **Rate Cards** — per-client negotiated rates, per-equipment day/week/month pricing, auto-fill invoice | `backend/app/routers/rates.py`, rate card UI in Additions |
| `Tier_V_09` | **GST Returns** — GSTR-1 export, HSN codes per category, invoice classification | `backend/app/routers/gst_returns.py`, GST section in Audit |
| `Tier_V_10` | **Damage & Insurance Claims** — policy tracking, claim workflow, client recovery | `backend/app/routers/claims.py`, `frontend/src/pages/ClaimsPage.jsx` |
| `Tier_V_11` | **Client Portal** — separate login, view own bookings, download docs, outstanding dues | `backend/app/routers/client_portal.py`, `frontend/src/pages/ClientPortal.jsx` |
| `Tier_V_12` | **CRM Pipeline** — Lead→Enquiry→Quote→Booking funnel, follow-up reminders, win/loss analysis | `backend/app/routers/crm.py`, `frontend/src/pages/CRMPage.jsx` |
| `Tier_V_13` | **Resource Planning Calendar** — visual availability calendar for equipment and crew by date | `frontend/src/pages/ResourceCalendarPage.jsx`, availability API endpoints |
| `Tier_V_14` | **Multi-Warehouse Transfers** — transfer orders, transit tracking, stock reconciliation | `backend/app/routers/transfers.py`, `frontend/src/pages/TransfersPage.jsx` |
| `Tier_V_15` | **Crew Self-Service** — crew login, see assignments, confirm availability, view payouts, submit expenses | `backend/app/routers/crew_portal.py`, `frontend/src/pages/CrewPortal.jsx` |
| `Tier_V_16` | **Analytics Dashboard** — revenue by client/period, equipment utilisation %, crew cost ratio, receivables aging | `frontend/src/pages/AnalyticsPage.jsx`, summary API endpoints |
| `Tier_V_17` | **Digital Signatures** — Aadhaar eSign / DSC on job cards and contracts | `backend/app/routers/esign.py`, signature UI on Papers & QC |
| `Tier_V_18` | **WhatsApp / Email Notifications** — auto-send on booking confirm, return reminders, payment due alerts | `backend/app/notifications.py`, notification settings in System |
| `Tier_V_19` | **Contract Management** — MSA per client, rate validity period, auto-renew alerts, digital sign linkage | `backend/app/routers/contracts.py`, `frontend/src/pages/ContractsPage.jsx` |
| `Tier_V_20` | **TDS Management** — TDS on vendor payments (194C/194J), Form 16A generation, TDS returns | `backend/app/routers/tds.py`, TDS section in Accounts |
| `Tier_V_FINAL` | **All tiers merged** — single deployable branch with every feature above | All of the above |


---
