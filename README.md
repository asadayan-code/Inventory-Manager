# PakAudio POS & Retail Management System

A production-grade, offline-first desktop Point of Sale (POS) and inventory management system designed for car audio, home audio, and car accessories retail shops in Pakistan. Built for reliability on standalone Windows PCs, resilient against power outages, and fully operable with standard USB barcode scanners and A4 office printers.

---

## 1. Quick Start Guide for Windows (Plain-Language for Shop Owners)

### Running from Pre-Packaged Windows Installer:
1. Double-click `PakAudio-POS-Setup-1.0.0.exe`.
2. Follow the on-screen installer prompts. The installer sets up the desktop shortcut and registers necessary offline components.
3. Launch **PakAudio POS** from your Windows Desktop.
4. The system automatically initializes the local database in crash-safe WAL mode and opens the login counter screen.

### Default Login Accounts:
- **Shop Owner**: Username `admin` | Password `admin123` (Full access to prices, reports, user management, and refunds)
- **Cashier Staff**: Username `cashier1` | Password `cashier123` (Sales counter, barcode scan, customer bills)

---

## 2. Non-Negotiable Business Rules Enforced in System

1. **Integer Paisa Currency Storage**:
   - All monetary amounts are strictly calculated and stored as integer paisa (1 PKR = 100 paisa).
   - Floating-point numbers are rejected everywhere across backend and frontend to eliminate precision drift.
2. **Stock Movements Ledger**:
   - Inventory on hand is never edited directly. Stock on hand is ALWAYS the dynamic sum of `stock_movements`.
   - Every addition or deduction records a timestamp, authorized staff user, movement type, reference ID, and mandatory explanation note.
3. **Price, Cost & Warranty Snapshotting**:
   - When an invoice is finalized, current prices, cost prices, and warranty duration are copied directly onto the bill line items. Edits to catalog prices later will never alter historical invoices.
4. **All-or-Nothing Transactions**:
   - Every checkout, return, and stock adjustment executes within an atomic SQLite transaction. If a power cut or error occurs, the entire transaction rolls back cleanly.
5. **Stock & Minimum Price Guardrails**:
   - Sales cannot exceed in-stock quantity or fall below minimum variant prices unless an authorized shop owner overrides the guardrail.
6. **Salted Scrypt Password Security & Lockout**:
   - Passwords use scrypt hashing with unique cryptographic salts.
   - 5 consecutive incorrect passwords automatically lock the account for 5 minutes.
7. **Comprehensive Audit Trail**:
   - Every significant action (sales, returns, reprints, price overrides, adjustments, register closures) writes directly to the immutable `audit_log` table.
8. **Cashier-Friendly English Error Messages**:
   - Errors explain real-world situations clearly (e.g. *"Only 2 units of LED H4 55W are left in stock. Ask the owner to override if you need to sell 3."*).

---

## 3. Staff Roles & Permissions Table

| Feature / Action | Cashier Staff | Shop Owner |
| :--- | :---: | :---: |
| Search Products & Scan Barcodes | Yes | Yes |
| Create Sales Invoices & Split Payments | Yes | Yes |
| Issue Wholesale Price to Workshop Accounts | Auto | Auto |
| Line / Bill Discounts | Capped (Max 5%) | Unlimited |
| View Product Cost Price & Gross Margin | **Hidden** | **Visible** |
| Process Customer Returns & Cash Refunds | **No** | **Yes** |
| Manual Stock Adjustments (Damage / Theft) | **No** | **Yes (Mandatory Note)** |
| Conduct Physical Stocktake Count | **No** | **Yes** |
| Financial & Executive Profit Reports | **No** | **Yes** |
| Create Staff Accounts & Reset Passwords | **No** | **Yes** |
| Backup & Restore SQLite Database | **No** | **Yes** |

---

## 4. USB Barcode Scanner Integration

- **Plug & Play**: Connect any standard USB barcode scanner. No driver configuration needed.
- **Fast Keystroke Burst Detection**: Scanners type keystrokes with <50ms intervals terminated by Enter. The app distinguishes scanner bursts from human manual typing.
- **Scanning Flow**:
  - Scanning an item adds it to the active bill with quantity 1.
  - Scanning the same barcode again increments its quantity.
  - Audio feedback: synthesizes a short success tone via Web Audio API.
  - Serialized items (Head units, Android tabs, amplifiers): Prompts to scan or enter the unique unit serial number. Serials are checked for in-stock status and duplicate prevention.
  - Missing Barcodes: Generates valid EAN-13 barcodes and prints A4 sticker sheets (3x10 or 4x13 layout).

---

## 5. A4 Document Printing Layouts

Documents render in standardized A4 formats (`@page { size: A4 }`):
1. **Sales Tax Invoice**: Shop header, invoice #, cashier, customer vehicle details, itemized lines, serial numbers, warranty terms, return policy, amount in words, and "DUPLICATE COPY" stamp on reprinting.
2. **Quotation / Estimate**: Formatted proposal with validity expiration date.
3. **Installation Job Card**: Vehicle registration, make, model, technician name, labour charges, and customer sign-off box.
4. **Customer Statement**: Running balance showing purchase invoices and Udhaar payments.
5. **Reorder List**: Low-stock items grouped with suggested order quantities.
6. **Barcode Sticker Sheets**: Die-cut label layout with product name, SKU, price, and barcode lines.

---

## 6. Local JSON API Reference (`127.0.0.1:8000`)

### Authentication:
- `POST /api/auth/login`: Authenticate with username and password. Returns session token.
- `POST /api/auth/logout`: Invalidate bearer session token.
- `GET /api/auth/me`: Retrieve currently authenticated user.

### Catalog & Barcodes:
- `GET /api/catalog/search?q={query}`: Multi-field search across name, SKU, barcode, car compatibility.
- `GET /api/catalog/barcode/{code}`: Exact barcode lookup for scanner.
- `POST /api/catalog/attach-barcode`: One-click attach barcode to variant.
- `POST /api/products`: Create product and variants (Owner only).

### Sales & Billing:
- `POST /api/bills`: Finalize sale invoice or quotation.
- `GET /api/bills`: List invoice history.
- `GET /api/bills/{id}?reprint=1`: Retrieve bill detail and record reprint audit.
- `POST /api/returns`: Process customer refund (cancels Udhaar balance first).

### Stock & Inventory:
- `POST /api/purchases`: Goods Received / PO entry from supplier.
- `POST /api/stock/adjust`: Post damage, theft, or count adjustment with note.
- `GET /api/stock/low-stock`: List items at or below reorder level.
- `GET /api/stock/dead-stock?days=60`: List items with no sales in 60 days.
- `POST /api/stocktake/commit`: Apply physical count audit adjustments.

### Cash & Expenses:
- `POST /api/cash-register/open`: Open daily drawer float.
- `GET /api/cash-register/expected`: Calculate expected cash balance.
- `POST /api/cash-register/close`: Counted cash reconciliation.
- `POST /api/expenses`: Record operational expense voucher.

---

## 7. Database Backup, Safety & Disaster Recovery Guide

### Automatic Backups:
- The system automatically creates a timestamped backup in `/backups` every day and upon closing the application.
- The last 30 backups are retained automatically.

### Manual Backup to USB Drive:
1. Insert your USB flash drive into the shop PC.
2. Log in as Shop Owner and navigate to **Settings & Admin** -> **Data Backup & Restore**.
3. Click **Create Backup Now**.
4. To copy to a USB drive or external folder, copy the latest `.db` file from the `backups` directory to your USB drive.

### Restoring from Backup:
1. Log in as Shop Owner and open **Settings & Admin** -> **Data Backup & Restore**.
2. Select the desired backup timestamp from the list.
3. Click **Restore DB** and confirm the safety prompt.
4. An emergency snapshot of the current database is saved automatically before applying the restore.
