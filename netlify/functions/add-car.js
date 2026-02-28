// netlify/functions/add-car.js
// ─────────────────────────────────────────────────────────────────────────────
// POST /netlify/functions/add-car
// Content-Type: multipart/form-data
//
// Follows the exact 7-step sequence from CdC v4 §4.4:
//   1. Verify JWT
//   2. Parse form-data (fields + image)
//   3. Upload image → Cloudinary
//   4. Build car object
//   5. Write to Google Sheets (backup + source of truth)
//   6. Trigger GitHub Action (which will regenerate cars.json ~30-60s later)
//   7. Respond immediately to Youssef with success + car data
//
// CdC v4 §7 security: file upload validation (MIME + size ≤ 10MB)
// CdC v4 §12 criterion 4: "Ajout voiture → visible sur le site en moins de 3 minutes"
//
// Expected form fields:
//   category, name, price, unit, features (pipe-sep or comma-sep), badge, imageAlt
//   + file field named "image"
// ─────────────────────────────────────────────────────────────────────────────

const { getAuthUser, unauthorized, badRequest, serverError, ok, handleOptions } = require('./_utils/auth');
const { uploadImage }  = require('./_utils/cloudinary');
const sheets           = require('./_utils/sheets');
const { triggerAction } = require('./_utils/github');
const { parseMultipart } = require('./_utils/multipart');

// Allowed MIME types — CdC v4 §7: "Vérification MIME + taille max 10 MB"
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

exports.handler = async (event, context) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  // ── Step 1: Verify JWT ────────────────────────────────────────────────────
  const { user } = getAuthUser(context);
  if (!user) return unauthorized();

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // ── Step 2: Parse multipart form-data ─────────────────────────────────
    let fields, file;
    try {
      ({ fields, file } = parseMultipart(event));
    } catch (parseErr) {
      return badRequest('Invalid multipart form data');
    }

    // Required field validation
    if (!fields.category || !fields.name || !fields.price) {
      return badRequest('Missing required fields: category, name, price');
    }

    // ── Step 3: Upload image → Cloudinary ─────────────────────────────────
    let imagePublicId = null;

    if (file) {
      // Security: validate MIME type
      if (!ALLOWED_MIME.includes(file.mimeType)) {
        return badRequest(`Invalid image type: ${file.mimeType}. Allowed: ${ALLOWED_MIME.join(', ')}`);
      }
      // Security: validate file size
      if (file.buffer.length > MAX_SIZE_BYTES) {
        return badRequest('Image too large. Maximum size is 10 MB.');
      }

      const publicId = `car-${Date.now()}`;
      imagePublicId = await uploadImage(file.buffer, publicId, file.mimeType);
    }

    // ── Step 4: Build the car object ──────────────────────────────────────
    // features may arrive as "A|B|C" or "A,B,C" from the form
    const rawFeatures = fields.features || '';
    const features = rawFeatures.includes('|')
      ? rawFeatures.split('|').map(f => f.trim()).filter(Boolean)
      : rawFeatures.split(',').map(f => f.trim()).filter(Boolean);

    const now = new Date().toISOString();
    const car = {
      id:             `car-${Date.now()}`,
      category:       fields.category.trim(),
      name:           fields.name.trim(),
      price:          fields.price.trim(),
      unit:           fields.unit?.trim() || 'MAD/jour',
      features,
      badge:          fields.badge?.trim() || '',
      imagePublicId:  imagePublicId || '',
      imageAlt:       fields.imageAlt?.trim() || `${fields.name} — location à Tanger`,
      active:         true,
      createdAt:      now,
      updatedAt:      now
    };

    // ── Step 5: Write to Google Sheets (source of truth) ──────────────────
    await sheets.appendCar(car);

    // ── Step 6: Trigger GitHub Action (regenerates cars.json ~30-60s later) ─
    // If trigger fails, data is safe in Sheets — the hourly schedule will catch up.
    try {
      await triggerAction();
    } catch (triggerErr) {
      // Non-fatal: log and continue. Hourly GitHub Action backup will sync.
      console.warn('[add-car] GitHub Action trigger failed (non-fatal):', triggerErr.message);
    }

    // ── Step 7: Respond immediately to Youssef ────────────────────────────
    return ok({ success: true, car });

  } catch (err) {
    return serverError('Failed to add car', err);
  }
};
