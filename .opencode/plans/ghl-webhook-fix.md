# GHL Webhook Fix Plan

## Root Cause
The `vercel.json` rewrite `"/api/(.*)" → "/api/$1"` intercepts POST request bodies at Vercel's edge layer before they reach the serverless function, causing the connection to drop with `Failed to fetch`.

## Changes

### 1. `vercel.json`
**Remove the `rewrites` array.** Vercel automatically routes `/api/*` to serverless functions. No client-side routing exists, so the rewrite serves no purpose.

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "framework": "vite"
}
```

### 2. `api/ghl-webhook.js`
Three changes:

**a) Add body validation after the POST method check:**
```js
if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
  return res.status(400).json({ success: false, error: 'Request body is empty or invalid' });
}
```

**b) Add 8-second timeout to the GHL API fetch using AbortController:**
```js
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 8000);

const response = await fetch('https://api.leadconnectorhq.com/widget/form/SQTfOzAK45gQEoeaKGYz', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(ghlPayload),
  signal: controller.signal
});

clearTimeout(timeoutId);
```

**c) Handle AbortError in catch block:**
```js
if (error.name === 'AbortError') {
  return res.status(504).json({
    success: false,
    error: 'GHL API timed out — please try again later'
  });
}
```

**d) Remove the unused `standardFields` variable** (lines 30-31 in original).

### 3. `src/funnel.js`
**Replace the generic catch handler with one that distinguishes network errors:**

```js
if (error instanceof TypeError && error.message === 'Failed to fetch') {
  formError.textContent = 'Connection error — please check your internet and try again. If this persists, email us directly.';
} else {
  formError.textContent = error.message || 'Something went wrong. Please try again or contact us directly.';
}
```

Also replace `&rarr;` HTML entities with literal `→` in the catch block (line 313) for consistency (the initial button text uses the entity which renders fine, but the reset text in the catch block should too).
