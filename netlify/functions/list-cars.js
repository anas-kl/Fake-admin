// netlify/functions/list-cars.js
// ─────────────────────────────────────────────────────────────────────────────
// GET /netlify/functions/list-cars
// Returns all cars (including inactive) for the admin panel.
// Public site reads /data/cars.json directly from GitHub Pages — this endpoint
// is only for the admin panel.
//
// CdC v4 §4.1: list-cars.js "Lit cars.json depuis GitHub raw" — v4 unchanged
// NOTE: In v4 we read directly from Sheets (authoritative source), not GitHub raw.
//       This avoids a 2-minute propagation lag when the admin panel lists cars.
// ─────────────────────────────────────────────────────────────────────────────

const { getAuthUser, unauthorized, serverError, ok, handleOptions } = require('./_utils/auth');
const sheets = require('./_utils/sheets');

exports.handler = async (event, context) => {
  // CORS preflight
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  // Auth
  const { user } = getAuthUser(context);
  if (!user) return unauthorized();

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const cars = await sheets.getAllCars();
    return ok({ cars });
  } catch (err) {
    return serverError('Failed to load cars from Sheets', err);
  }
};
