// _utils/auth.js
// ─────────────────────────────────────────────────────────────────────────────
// Netlify Identity JWT verification.
//
// How it works:
//   1. The admin frontend (admin.js) uses netlify-identity-widget.
//   2. After login, the widget gives the user a JWT.
//   3. Every Function call sends: Authorization: Bearer <jwt>
//   4. Netlify's edge layer validates the JWT and populates context.clientContext
//      automatically — no manual crypto needed, no secret to manage.
//
// CdC v4 §7 security: "Netlify Identity JWT vérifié dans chaque Function"
// CdC v4 §12 criterion 10: "Netlify Functions sans JWT valide → HTTP 401"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts and validates the authenticated user from the Netlify Function context.
 *
 * @param {object} context - The Netlify Function context object (second argument of handler)
 * @returns {{ user: object } | { user: null }}
 *
 * Usage in every Function handler:
 *   const { user } = getAuthUser(context);
 *   if (!user) return unauthorized();
 */
function getAuthUser(context) {
  const user = context?.clientContext?.user ?? null;
  return { user };
}

/**
 * Standard 401 Unauthorized response.
 * Use this as the return value when getAuthUser returns null.
 */
function unauthorized() {
  return {
    statusCode: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Unauthorized — valid Netlify Identity JWT required' })
  };
}

/**
 * Standard 400 Bad Request response.
 */
function badRequest(message) {
  return {
    statusCode: 400,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message })
  };
}

/**
 * Standard 500 Internal Server Error response.
 */
function serverError(message, err) {
  console.error(`[USF Admin] ${message}`, err?.message || err);
  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message })
  };
}

/**
 * Standard 200 OK response with JSON body.
 */
function ok(data) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
}

/**
 * Handle CORS preflight OPTIONS requests.
 * Call at the top of every handler before auth check.
 */
function handleOptions(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': 'https://admin.usfluxurycars.com',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
      },
      body: ''
    };
  }
  return null;
}

module.exports = { getAuthUser, unauthorized, badRequest, serverError, ok, handleOptions };
