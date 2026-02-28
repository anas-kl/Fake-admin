// _utils/cloudinary.js
// Zero external dependencies — Node built-in crypto + native FormData (Node 18).

const crypto = require('crypto');

async function uploadImage(imageBuffer, publicId, mimeType = 'image/jpeg') {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary env vars not configured');
  }

  const timestamp    = Math.floor(Date.now() / 1000);
  const folder       = 'usf-cars';
  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature    = crypto.createHash('sha1')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  // Use native FormData (built into Node 18 — no external package needed)
  const formData = new FormData();
  formData.append('file',       new Blob([imageBuffer], { type: mimeType }), `${publicId}.jpg`);
  formData.append('public_id',  publicId);
  formData.append('folder',     folder);
  formData.append('timestamp',  String(timestamp));
  formData.append('api_key',    apiKey);
  formData.append('signature',  signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: formData }
    // No Content-Type header — fetch sets it automatically with the boundary
  );

  const data = await res.json();
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${data.error?.message || res.status}`);
  return data.public_id;
}

async function deleteImage(publicId) {
  if (!publicId) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const timestamp    = Math.floor(Date.now() / 1000);
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature    = crypto.createHash('sha1')
    .update(paramsToSign + apiSecret)
    .digest('hex');

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: apiKey, signature }).toString()
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error('[Cloudinary] deleteImage failed:', data.error?.message || res.status);
  }
}

module.exports = { uploadImage, deleteImage };
