// netlify/functions/update-car.js
// ─────────────────────────────────────────────────────────────────────────────
// PUT /netlify/functions/update-car
// Content-Type: multipart/form-data (when image is included) or application/json
//
// Updates an existing car in Google Sheets, optionally replaces its image.
// Then triggers the GitHub Action to regenerate cars.json.
//
// CdC v4 §4.1: "Sheets + trigger GitHub Action"
// CdC v4 §12 criterion 6: "Modification de prix → ~2 minutes"
// CdC v4 §12 criterion 7: "Toggle actif/inactif fonctionne sans supprimer la voiture"
//
// Expected body (JSON):
//   { id, category, name, price, unit, features, badge, imageAlt, active }
//   OR multipart/form-data with optional "image" file field
// ─────────────────────────────────────────────────────────────────────────────

const { getAuthUser, unauthorized, badRequest, serverError, ok, handleOptions } = require('./_utils/auth');
const { uploadImage, deleteImage } = require('./_utils/cloudinary');
const sheets                       = require('./_utils/sheets');
const { triggerAction }            = require('./_utils/github');
const { parseMultipart }           = require('./_utils/multipart');

const ALLOWED_MIME    = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES  = 10 * 1024 * 1024;

exports.handler = async (event, context) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  const { user } = getAuthUser(context);
  if (!user) return unauthorized();

  if (event.httpMethod !== 'PUT' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    let fields = {};
    let file   = null;
    const contentType = event.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      ({ fields, file } = parseMultipart(event));
    } else {
      // JSON body (no image replacement)
      fields = JSON.parse(event.body || '{}');
    }

    const { id } = fields;
    if (!id) return badRequest('Missing required field: id');

    // Build update object — only include fields that were sent
    const updates = {};
    const stringFields = ['category', 'name', 'price', 'unit', 'badge', 'imageAlt'];
    stringFields.forEach(k => {
      if (fields[k] !== undefined) updates[k] = fields[k];
    });

    // active flag — handle string "true"/"false" from form-data
    if (fields.active !== undefined) {
      updates.active = fields.active === true || fields.active === 'true' || fields.active === 'TRUE';
    }

    // features: normalize to array
    if (fields.features !== undefined) {
      const raw = fields.features;
      updates.features = Array.isArray(raw)
        ? raw
        : raw.includes('|')
          ? raw.split('|').map(f => f.trim()).filter(Boolean)
          : raw.split(',').map(f => f.trim()).filter(Boolean);
    }

    // Handle image replacement
    if (file) {
      if (!ALLOWED_MIME.includes(file.mimeType)) {
        return badRequest(`Invalid image type: ${file.mimeType}`);
      }
      if (file.buffer.length > MAX_SIZE_BYTES) {
        return badRequest('Image too large. Maximum size is 10 MB.');
      }

      // Get the old imagePublicId to delete from Cloudinary after upload
      const allCars  = await sheets.getAllCars();
      const existing = allCars.find(c => c.id === id);
      const oldPublicId = existing?.imagePublicId || null;

      // Upload new image
      const newPublicId = await uploadImage(file.buffer, `car-${Date.now()}`, file.mimeType);
      updates.imagePublicId = newPublicId;

      // Delete old image from Cloudinary (non-fatal if it fails)
      if (oldPublicId && oldPublicId !== newPublicId) {
        await deleteImage(oldPublicId).catch(err =>
          console.warn('[update-car] Old image Cloudinary delete failed:', err.message)
        );
      }
    }

    // Write updated car to Sheets
    const updatedCar = await sheets.updateCar(id, updates);

    // Trigger GitHub Action
    try {
      await triggerAction();
    } catch (triggerErr) {
      console.warn('[update-car] GitHub Action trigger failed (non-fatal):', triggerErr.message);
    }

    return ok({ success: true, car: updatedCar });

  } catch (err) {
    return serverError('Failed to update car', err);
  }
};
