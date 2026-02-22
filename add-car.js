// netlify/functions/add-car.js
// ─────────────────────────────────────────────────────────────
// Secure middleman between admin page and GitHub API.
// The GITHUB_TOKEN lives here (server side), never in the browser.
//
// Environment variables to set in Netlify dashboard:
//   GITHUB_TOKEN  = your GitHub personal access token
//   GITHUB_OWNER  = your GitHub username  (e.g. "usfluxurycars")
//   GITHUB_REPO   = your repo name        (e.g. "usf-website")
//   ADMIN_PASSWORD = simple password to protect the endpoint
// ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {

  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Parse the incoming data from the admin form
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // ── Simple password check ──────────────────────────────────
  if (body.password !== process.env.ADMIN_PASSWORD) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // ── Read the current fleet.json from GitHub ────────────────
  const baseUrl = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/fleet.json`;

  const headers = {
    'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
    'Accept':        'application/vnd.github+json',
    'Content-Type':  'application/json'
  };

  // GET current file (we need its SHA to update it)
  const getResponse = await fetch(baseUrl, { headers });
  const fileData    = await getResponse.json();

  // Decode current content from base64
  const currentContent = JSON.parse(
    Buffer.from(fileData.content, 'base64').toString('utf8')
  );

  // ── Build the new car object ───────────────────────────────
  const newCar = {
    id:           Date.now(), // simple unique id
    brand:        body.brand,
    model:        body.model,
    year:         parseInt(body.year),
    price:        parseInt(body.price),
    category:     body.category,
    image:        body.image,   // Cloudinary URL (sent from frontend)
    features_fr:  body.features_fr,
    features_en:  body.features_en
  };

  // Add to the array
  const updatedFleet = [...currentContent, newCar];

  // ── Write the updated file back to GitHub ─────────────────
  const putResponse = await fetch(baseUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Add car: ${newCar.brand} ${newCar.model} ${newCar.year}`, // commit message
      content: Buffer.from(JSON.stringify(updatedFleet, null, 2)).toString('base64'),
      sha:     fileData.sha   // required by GitHub API to confirm we're updating the right version
    })
  });

  if (!putResponse.ok) {
    const error = await putResponse.json();
    return { statusCode: 500, body: `GitHub API error: ${error.message}` };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, car: newCar })
  };
};
