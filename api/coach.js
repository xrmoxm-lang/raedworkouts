// The coach, proxied — so the access key never reaches the browser.
//
// COACH_KEY used to ship inside app.js. Anyone who opened the site could read it
// and spend Raed's OpenAI credit; a hard $25/month ceiling on the server bounds
// the damage, but the honest fix is for the client never to hold the secret at
// all. A browser app cannot keep one: it either carries a credential the user
// can read, or it goes through a server. This is the server.
//
// His two constraints, in his words: «ما يكون تليسكيل» and «ما يعقد علي الـprocess
// التمرين». Neither is affected. The coach is already public HTTPS through the
// Tailscale Funnel, so this function reaches it from anywhere — nothing on his
// phone joins a tailnet, and nothing about starting a workout changes. The only
// cost is one extra network leg, which was measured before this was adopted.
const UPSTREAM = 'https://raed-hp.tail53bd35.ts.net/coach';

// Exactly the three the app uses. An open-ended proxy would turn a hidden key
// into a public one with extra steps.
const ROUTES = {
  answer: { path: '/answer', method: 'POST' },
  usage: { path: '/usage', method: 'GET' },
  model: { path: '/model', method: 'POST' },
};

const MAX_BODY = 32 * 1024;

export default async function handler(req, res) {
  const key = process.env.COACH_KEY;
  if (!key) return res.status(503).json({ status: 'error', error: 'coach_key_unset' });

  const route = ROUTES[String(req.query.route || '')];
  if (!route) return res.status(404).json({ status: 'error', error: 'unknown_route' });
  if (req.method !== route.method) return res.status(405).json({ status: 'error', error: 'method' });

  let body;
  if (route.method === 'POST') {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (body.length > MAX_BODY) return res.status(413).json({ status: 'error', error: 'too_large' });
  }

  try {
    const upstream = await fetch(UPSTREAM + route.path, {
      method: route.method,
      headers: { 'X-Coach-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body,
      // Under the app's own 30s ceiling, so a hung upstream surfaces as a
      // timeout he can retry rather than as a function that never answers.
      signal: AbortSignal.timeout(28000),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    // Never cached: an answer is specific to one question, and the usage figure
    // is a running total.
    res.setHeader('Cache-Control', 'no-store');
    return res.send(text);
  } catch (error) {
    // The name only. The message can carry the upstream URL, and this response
    // goes to a browser.
    return res.status(502).json({ status: 'error', error: error?.name || 'upstream_failed' });
  }
}
