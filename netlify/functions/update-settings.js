// netlify/functions/update-settings.js
// ─────────────────────────────────────────────────────────────────────────────
// POST /netlify/functions/update-settings
// Body: JSON object with one or more settings keys to update
//
// Updates the Settings sheet (which drives settings.json on the public site).
// Triggers the GitHub Action to regenerate settings.json immediately.
//
// CdC v4 §4.1: "Sheets + trigger GitHub Action"
// ─────────────────────────────────────────────────────────────────────────────

const { getAuthUser, unauthorized, badRequest, serverError, ok, handleOptions } = require('./_utils/auth');
const sheets            = require('./_utils/sheets');
const { triggerAction } = require('./_utils/github');

// Whitelist of allowed settings keys — never allow arbitrary key injection
const ALLOWED_KEYS = [
  'name', 'tagline', 'description', 'whatsapp', 'whatsappMessage',
  'email', 'address', 'hours', 'instagram', 'facebook'
];

exports.handler = async (event, context) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  const { user } = getAuthUser(context);
  if (!user) return unauthorized();

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'PUT') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // Only accept whitelisted keys — drop anything else silently
    const updates = {};
    ALLOWED_KEYS.forEach(key => {
      if (body[key] !== undefined && typeof body[key] === 'string') {
        updates[key] = body[key].trim();
      }
    });

    if (Object.keys(updates).length === 0) {
      return badRequest('No valid settings keys provided');
    }

    const merged = await sheets.updateSettings(updates);

    // Trigger GitHub Action to regenerate settings.json
    try {
      await triggerAction();
    } catch (triggerErr) {
      console.warn('[update-settings] GitHub Action trigger failed (non-fatal):', triggerErr.message);
    }

    return ok({ success: true, settings: merged });

  } catch (err) {
    return serverError('Failed to update settings', err);
  }
};
