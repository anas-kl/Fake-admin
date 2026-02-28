// netlify/functions/upload-image.js
// ─────────────────────────────────────────────────────────────────────────────
// POST /netlify/functions/upload-image
// Content-Type: multipart/form-data
//
// Uploads an image to Cloudinary and returns the publicId.
// Used by the admin panel image picker before saving a car.
// If an existing publicId is passed (for replacement), the old image is deleted.
//
// CdC v4 §4.1: "Cloudinary + Sheets + trigger"
// ─────────────────────────────────────────────────────────────────────────────

const { getAuthUser, unauthorized, badRequest, serverError, ok, handleOptions } = require('./_utils/auth');
const { uploadImage, deleteImage } = require('./_utils/cloudinary');
const { parseMultipart }           = require('./_utils/multipart');

const ALLOWED_MIME   = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

exports.handler = async (event, context) => {
  const preflight = handleOptions(event);
  if (preflight) return preflight;

  const { user } = getAuthUser(context);
  if (!user) return unauthorized();

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { fields, file } = parseMultipart(event);

    if (!file) return badRequest('No image file provided');

    if (!ALLOWED_MIME.includes(file.mimeType)) {
      return badRequest(`Invalid image type: ${file.mimeType}. Allowed: JPEG, PNG, WebP`);
    }

    if (file.buffer.length > MAX_SIZE_BYTES) {
      return badRequest('Image too large. Maximum size is 10 MB.');
    }

    // If an old publicId is provided, delete it from Cloudinary after upload
    const oldPublicId = fields.oldImagePublicId || null;

    const publicId = `car-${Date.now()}`;
    const newPublicId = await uploadImage(file.buffer, publicId, file.mimeType);

    if (oldPublicId && oldPublicId !== newPublicId) {
      await deleteImage(oldPublicId).catch(err =>
        console.warn('[upload-image] Old image delete failed:', err.message)
      );
    }

    return ok({ success: true, imagePublicId: newPublicId });

  } catch (err) {
    return serverError('Image upload failed', err);
  }
};
