// _utils/sheets.js
// ─────────────────────────────────────────────────────────────────────────────
// Google Sheets read/write operations.
// Uses the Google Sheets REST API v4 with a Service Account for auth.
// No googleapis SDK — we use fetch + JWT to keep the bundle lightweight.
//
// Required Netlify env vars:
//   GOOGLE_SERVICE_ACCOUNT_JSON — base64-encoded service account JSON
//   GOOGLE_SHEET_ID             — the spreadsheet ID from the URL
//
// Google Sheet structure expected by this module:
//
//   Sheet "Fleet" — columns A through L:
//     A:id  B:category  C:name  D:price  E:unit  F:features (pipe-sep)
//     G:badge  H:imagePublicId  I:imageAlt  J:active  K:createdAt  L:updatedAt
//
//   Sheet "Settings" — columns A:B (key / value pairs):
//     name | tagline | description | whatsapp | whatsappMessage |
//     email | address | hours | instagram | facebook
//
// CdC v4 §3.2 sync-sheets.js defines the same schema — keep in sync.
// ─────────────────────────────────────────────────────────────────────────────

const { SignJWT } = require('jose'); // jose is available in Node 18

// ── Service Account JWT for Google API auth ──────────────────────────────────
async function getAccessToken() {
  const raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf8');
  const creds = JSON.parse(raw);

  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(creds.private_key, 'RS256');

  const jwt = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/spreadsheets'
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer(creds.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .sign(privateKey);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString()
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Google OAuth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// Import for jose — lazy require to avoid issues
async function importPKCS8(pem, alg) {
  const { importPKCS8: imp } = await import('jose');
  return imp(pem, alg);
}

// ── Low-level Sheets API helpers ─────────────────────────────────────────────
const SHEET_ID = () => process.env.GOOGLE_SHEET_ID;
const BASE     = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sheetsGet(range) {
  const token = await getAccessToken();
  const url = `${BASE}/${SHEET_ID()}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets GET ${range} failed: ${res.status}`);
  return res.json();
}

async function sheetsUpdate(range, values) {
  const token = await getAccessToken();
  const url = `${BASE}/${SHEET_ID()}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
  if (!res.ok) throw new Error(`Sheets PUT ${range} failed: ${res.status}`);
  return res.json();
}

async function sheetsAppend(range, values) {
  const token = await getAccessToken();
  const url = `${BASE}/${SHEET_ID()}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values })
  });
  if (!res.ok) throw new Error(`Sheets APPEND ${range} failed: ${res.status}`);
  return res.json();
}

// ── Fleet column definitions ──────────────────────────────────────────────────
// Order must match the Google Sheet columns A through L.
const FLEET_COLUMNS = [
  'id', 'category', 'name', 'price', 'unit',
  'features',       // stored as pipe-separated string "A|B|C"
  'badge', 'imagePublicId', 'imageAlt', 'active', 'createdAt', 'updatedAt'
];
const FLEET_RANGE = 'Fleet!A:L';

// Convert a row array to a car object
function rowToCar(row) {
  const car = {};
  FLEET_COLUMNS.forEach((col, i) => { car[col] = row[i] ?? ''; });
  car.active   = car.active === 'TRUE';
  car.features = car.features ? car.features.split('|') : [];
  return car;
}

// Convert a car object to a row array (for writing)
function carToRow(car, now = new Date().toISOString()) {
  return [
    car.id           || '',
    car.category     || '',
    car.name         || '',
    car.price        || '',
    car.unit         || 'MAD/jour',
    Array.isArray(car.features) ? car.features.join('|') : (car.features || ''),
    car.badge        || '',
    car.imagePublicId || '',
    car.imageAlt     || '',
    car.active === false ? 'FALSE' : 'TRUE',
    car.createdAt    || now,
    now               // updatedAt always set to current time
  ];
}

// ── Public Fleet API ──────────────────────────────────────────────────────────

/** Read all cars from the Fleet sheet (includes inactive). */
async function getAllCars() {
  const res = await sheetsGet(FLEET_RANGE);
  const [headers, ...rows] = res.values || [FLEET_COLUMNS];
  return rows.map(rowToCar);
}

/** Find a car row index (1-based, accounting for header row) by car id. */
async function findCarRowIndex(id) {
  const res = await sheetsGet(FLEET_RANGE);
  const rows = res.values || [];
  // Row 0 is header, Row 1 = sheet row 2, etc.
  const idx = rows.findIndex((row, i) => i > 0 && row[0] === id);
  if (idx === -1) return null;
  return idx + 1; // 1-based sheet row number
}

/** Append a new car row. */
async function appendCar(car) {
  const row = carToRow(car);
  await sheetsAppend(FLEET_RANGE, [row]);
}

/** Update an existing car row by id. */
async function updateCar(id, updates) {
  const rowIndex = await findCarRowIndex(id);
  if (!rowIndex) throw new Error(`Car ${id} not found in Fleet sheet`);

  // Read existing row first to merge (don't overwrite unset fields)
  const res = await sheetsGet(`Fleet!A${rowIndex}:L${rowIndex}`);
  const existingRow = res.values?.[0] || [];
  const existing = {};
  FLEET_COLUMNS.forEach((col, i) => { existing[col] = existingRow[i] ?? ''; });
  existing.active   = existing.active === 'TRUE';
  existing.features = existing.features ? existing.features.split('|') : [];

  const merged = { ...existing, ...updates, id }; // id is immutable
  const row = carToRow(merged);
  await sheetsUpdate(`Fleet!A${rowIndex}:L${rowIndex}`, [row]);
  return rowToCar(row);
}

/** Delete a car row by id. Returns the deleted car data for cleanup. */
async function deleteCar(id) {
  const rowIndex = await findCarRowIndex(id);
  if (!rowIndex) throw new Error(`Car ${id} not found in Fleet sheet`);

  // Read the row before deletion so we can return imagePublicId for Cloudinary cleanup
  const res = await sheetsGet(`Fleet!A${rowIndex}:L${rowIndex}`);
  const car = rowToCar(res.values?.[0] || []);

  // Clear the row contents (Sheets API doesn't "delete" rows in the free tier easily)
  // We overwrite with empty values — sync-sheets.js filters empty rows
  const emptyRow = Array(FLEET_COLUMNS.length).fill('');
  await sheetsUpdate(`Fleet!A${rowIndex}:L${rowIndex}`, [emptyRow]);

  return car;
}

// ── Settings API ──────────────────────────────────────────────────────────────
const SETTINGS_RANGE = 'Settings!A:B';

/** Read all settings as a flat key/value object. */
async function getSettings() {
  const res = await sheetsGet(SETTINGS_RANGE);
  const settings = {};
  (res.values || []).forEach(([key, val]) => { if (key) settings[key] = val || ''; });
  return settings;
}

/** Update one or more settings keys. */
async function updateSettings(updates) {
  const existing = await getSettings();
  const merged = { ...existing, ...updates };

  const values = Object.entries(merged).map(([k, v]) => [k, v]);
  // Clear and rewrite the entire settings range
  await sheetsUpdate(SETTINGS_RANGE, values);
  return merged;
}

module.exports = {
  getAllCars,
  appendCar,
  updateCar,
  deleteCar,
  findCarRowIndex,
  getSettings,
  updateSettings
};
