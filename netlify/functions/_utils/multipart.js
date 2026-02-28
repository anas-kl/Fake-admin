// _utils/multipart.js
// ─────────────────────────────────────────────────────────────────────────────
// Minimal multipart/form-data parser for Netlify Functions.
// Netlify Functions receive the body as a base64-encoded string when
// isBase64Encoded = true. This parser extracts fields and file buffers.
//
// Used by: add-car.js, upload-image.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a multipart/form-data Netlify Function event.
 *
 * @param {object} event - Netlify Function event
 * @returns {{ fields: object, file: { buffer: Buffer, filename: string, mimeType: string } | null }}
 */
function parseMultipart(event) {
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);

  if (!boundaryMatch) {
    throw new Error('No boundary found in Content-Type header');
  }

  const boundary = boundaryMatch[1];
  const bodyBuffer = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body || '');

  const fields = {};
  let file = null;

  // Split body by boundary markers
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(bodyBuffer, boundaryBuf);

  for (const part of parts) {
    if (!part || part.length < 4) continue;

    // Find the double CRLF separator between headers and body
    const headerEndIdx = indexOfSequence(part, Buffer.from('\r\n\r\n'));
    if (headerEndIdx === -1) continue;

    const headerStr = part.slice(0, headerEndIdx).toString('utf8');
    const bodyPart  = part.slice(headerEndIdx + 4);
    // Strip trailing CRLF
    const bodyClean = bodyPart.slice(-2).toString() === '\r\n'
      ? bodyPart.slice(0, -2)
      : bodyPart;

    // Parse Content-Disposition
    const dispMatch  = headerStr.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
    const fileMatch  = headerStr.match(/filename="([^"]+)"/i);
    const ctypeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

    if (!dispMatch) continue;
    const fieldName = dispMatch[1];

    if (fileMatch) {
      // This part is a file
      file = {
        buffer:   bodyClean,
        filename: fileMatch[1],
        mimeType: ctypeMatch ? ctypeMatch[1].trim() : 'application/octet-stream'
      };
    } else {
      // This part is a text field
      fields[fieldName] = bodyClean.toString('utf8');
    }
  }

  return { fields, file };
}

// ── Buffer utilities ──────────────────────────────────────────────────────────

function indexOfSequence(buf, seq) {
  for (let i = 0; i <= buf.length - seq.length; i++) {
    let found = true;
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

function splitBuffer(buf, delimiter) {
  const parts = [];
  let start = 0;
  let idx;

  while ((idx = indexOfSequence(buf.slice(start), delimiter)) !== -1) {
    parts.push(buf.slice(start, start + idx));
    start += idx + delimiter.length;
    // Skip CRLF after boundary
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;
    // Check for terminal boundary (--)
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break;
  }

  return parts.filter(p => p.length > 0);
}

module.exports = { parseMultipart };
