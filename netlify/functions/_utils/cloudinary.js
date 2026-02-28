// _utils/cloudinary.js
// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary image upload and delete using native Node 18 fetch + FormData.
// No external packages needed — form-data package removed.
//
// Required Netlify env vars:
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

/**
 * Upload an image buffer to Cloudinary using a signed upload.
 *
 * @param {Buffer} imageBuffer
 * @param {string} publicId     — e.g. "car-1234567890"
 * @param {string} mimeType     — e.g. "image/jpeg"
 * @returns {Promise<string>}   — full Cloudinary public_id e.g. "usf-cars/car-1234567890"
 */
async function uploadImage(imageBuffer, publicId, mimeType = 'image/jpeg') {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary env vars not configured');
  }

  const timestamp    = Math.floor(Date.now() / 1000);
  const folder       = 'usf-cars';

  // Signature: alphabetically sorted params (no api_key, no file, no resource_type)
  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature    = crypto
    .createHash('sha1')       // Cloudinary uses SHA-1 by default
    .update(paramsToSign + apiSecret)
    .digest('hex');

  // Use native FormData + Blob (available in Node 18 — no external package needed)
  const formData = new FormData();
  formData.append('file',       new Blob([imageBuffer], { type: mimeType }));
  formData.append('public_id',  publicId);
  formData.append('folder',     folder);
  formData.append('timestamp',  String(timestamp));
  formData.append('api_key',    apiKey);
  formData.append('signature',  signature);

  // DO NOT set Content-Type header — fetch sets it automatically with the correct boundary
  const url      = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const response = await fetch(url, { method: 'POST', body: formData });
  const data     = await response.json();

  if (!response.ok) {
    throw new Error(`Cloudinary upload failed: ${data.error?.message || response.status}`);
  }

  // Returns full public_id including folder prefix: "usf-cars/car-1234567890"
  return data.public_id;
}

/**
 * Delete an image from Cloudinary by its public_id.
 *
 * @param {string} publicId — e.g. "usf-cars/car-1234567890"
 * @returns {Promise<void>}
 */
async function deleteImage(publicId) {
  if (!publicId) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const timestamp    = Math.floor(Date.now() / 1000);
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature    = crypto
    .createHash('sha1')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key:   apiKey,
    signature
  });

  const url      = `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`;
  const response = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString()
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    // Non-fatal — log but don't throw
    console.error('[Cloudinary] deleteImage failed:', data.error?.message || response.status);
  }
}

module.exports = { uploadImage, deleteImage };
