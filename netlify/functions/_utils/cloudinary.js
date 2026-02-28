// _utils/cloudinary.js
// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary image operations — upload and delete.
// Uses the Cloudinary REST API directly (no SDK) to keep Node.js bundle small.
//
// Required Netlify env vars (set in Netlify UI → Site settings → Env vars):
//   CLOUDINARY_CLOUD_NAME  — e.g. "usf-luxury-cars"
//   CLOUDINARY_API_KEY     — from Cloudinary console
//   CLOUDINARY_API_SECRET  — from Cloudinary console
//
// CdC v4 §4.2: Cloudinary env vars
// CdC v4 §4.4: upload in step 3 of add-car.js sequence
// CdC v4 §12 criterion 8: "Suppression retire la voiture ET supprime l'image Cloudinary"
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const FormData = require('form-data'); // built-in in Node 18 via fetch; using manually here

/**
 * Upload an image buffer to Cloudinary.
 *
 * @param {Buffer} imageBuffer - Raw image bytes
 * @param {string} publicId - Cloudinary public ID to assign (e.g. "car-1234567890")
 * @param {string} [mimeType='image/jpeg'] - MIME type of the image
 * @returns {Promise<string>} - The Cloudinary public_id of the uploaded image
 */
async function uploadImage(imageBuffer, publicId, mimeType = 'image/jpeg') {
  const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey     = process.env.CLOUDINARY_API_KEY;
  const apiSecret  = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary env vars not configured');
  }

  // Cloudinary signed upload signature
  // Params that are part of the signature (must be alphabetically sorted, no API key/secret)
  const timestamp = Math.floor(Date.now() / 1000);
  const folder    = 'usf-cars';
  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha256')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  // Build multipart form
  const formData = new FormData();
  formData.append('file', imageBuffer, {
    filename: `${publicId}.jpg`,
    contentType: mimeType
  });
  formData.append('public_id', publicId);
  formData.append('folder', folder);
  formData.append('timestamp', String(timestamp));
  formData.append('api_key', apiKey);
  formData.append('signature', signature);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: formData.getHeaders()
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Cloudinary upload failed: ${data.error?.message || response.status}`);
  }

  // Return the full public_id including folder prefix (e.g. "usf-cars/car-1234567890")
  return data.public_id;
}

/**
 * Delete an image from Cloudinary by its public_id.
 * Called by delete-car.js — criterion 8.
 *
 * @param {string} publicId - e.g. "usf-cars/car-1234567890"
 * @returns {Promise<void>}
 */
async function deleteImage(publicId) {
  if (!publicId) return; // No image to delete (e.g. car had no photo)

  const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey     = process.env.CLOUDINARY_API_KEY;
  const apiSecret  = process.env.CLOUDINARY_API_SECRET;

  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha256')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp:  String(timestamp),
    api_key:    apiKey,
    signature
  });

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    // Log but don't throw — a failed image delete should not block the car deletion
    console.error('[Cloudinary] deleteImage failed:', data.error?.message || response.status);
  }
}

module.exports = { uploadImage, deleteImage };
