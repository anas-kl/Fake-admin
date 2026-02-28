// _utils/github.js
// ─────────────────────────────────────────────────────────────────────────────
// v4: 10 lines. Triggers the GitHub Action via workflow_dispatch.
// The GitHub Action then reads Google Sheets and commits cars.json using
// its own auto-generated GITHUB_TOKEN (never expires, zero maintenance).
//
// This module no longer reads SHA, base64-encodes files, or commits anything.
// That logic is gone. The Action does all of it.
//
// CdC v4 §4.3: "_utils/github.js v4 — Code Simplifié"
// CdC v4 §4.2: GITHUB_TRIGGER_TOKEN env var (Fine-grained PAT, scope: actions only)
// ─────────────────────────────────────────────────────────────────────────────

async function triggerAction() {
  const owner    = process.env.GITHUB_REPO_OWNER;
  const repo     = process.env.GITHUB_REPO_NAME;
  const token    = process.env.GITHUB_TRIGGER_TOKEN;
  const url      = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/sync-sheets.yml/dispatches`;

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:        `Bearer ${token}`,
      Accept:               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ ref: 'main' })
  });

  // 204 No Content = success. Non-2xx = failure.
  if (!response.ok) {
    throw new Error(`GitHub Action trigger failed: ${response.status}`);
  }
}

module.exports = { triggerAction };
