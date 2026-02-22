# USF Admin Panel — Setup Guide

## Project Structure

```
your-repo/
├── fleet.json                    ← car data (edited by the pipeline)
├── admin.html                    ← admin panel (password protected)
├── netlify.toml                  ← Netlify config
├── netlify/
│   └── functions/
│       └── add-car.js            ← secure serverless function
└── (your existing site files)
```

---

## Step 1 — Cloudinary (image hosting)

1. Go to https://cloudinary.com → create free account
2. In the dashboard, note your **Cloud Name**
3. Go to Settings → Upload → Add upload preset
   - Name it: `usf_cars`
   - Set to **Unsigned**
   - Save
4. In `admin.html`, replace:
   ```js
   const CLOUDINARY_CLOUD_NAME = 'YOUR_CLOUD_NAME';
   ```

---

## Step 2 — GitHub Token

1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained
2. Create a token with:
   - Repository access: only your site repo
   - Permissions: **Contents → Read and Write**
3. Copy the token (you only see it once)

---

## Step 3 — Netlify Environment Variables

In Netlify dashboard → Site Settings → Environment Variables, add:

| Variable         | Value                        |
|-----------------|------------------------------|
| GITHUB_TOKEN     | your token from Step 2       |
| GITHUB_OWNER     | your GitHub username          |
| GITHUB_REPO      | your repository name          |
| ADMIN_PASSWORD   | choose a strong password      |

---

## Step 4 — Deploy

Push all files to GitHub. Netlify auto-deploys.

---

## How it works after setup

1. Client goes to `yoursite.com/admin`
2. Enters password
3. Fills the form + uploads photo
4. Clicks "Publier"
5. Netlify Function writes to `fleet.json` on GitHub
6. GitHub triggers Netlify deploy
7. Site updates in ~1 minute ✅

---

## To also DELETE a car, you need a second function

The current code only adds cars. Deleting and editing
requires a similar function — a natural next step.
