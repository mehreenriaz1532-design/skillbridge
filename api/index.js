// ONE serverless function for the whole site (public + trainee + admin + AI + payments + email).
// Zero npm dependencies: Supabase via REST, Groq and Brevo via fetch.
const crypto = require('crypto');
const { SUPABASE_URL: SU, SUPABASE_SERVICE_KEY: SK, GROQ_API_KEY: GK, JWT_SECRET: JS, ADMIN_USER: AU, ADMIN_PASS: AP, BREVO_API_KEY: BK, MAIL_FROM: MF, SITE_URL } = process.env;
const GROQ_MODEL = 'llama-3.3-70b-versatile';
let HOST = '';

const E = (m, c = 400) => Object.assign(new Error(m), { user: m, code: c });
const need = (x) => { if (!x) throw E('Please login', 401); };
const S = (v) => String(v || '').trim();
const digits = (s) => String(s || '').replace(/\D/g, '');
const enc = encodeURIComponent;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => k in o).map((k) => [k, o[k]]));
const COLS = {
  courses: ['title', 'summary', 'description', 'benefits', 'outcomes', 'instructor', 'icon', 'price', 'is_demo', 'published', 'position'],
  modules: ['course_id', 'title', 'description', 'icon', 'position', 'published'],
  lessons: ['module_id', 'title', 'content', 'video_url', 'position'],
  questions: ['module_id', 'question', 'options', 'answer'],
  live_classes: ['course_id', 'title', 'starts_at', 'link', 'notes'],
  announcements: ['title', 'body', 'pinned'],
  gallery: ['image_url', 'caption', 'link', 'position'],
};
const SETTING_KEYS = ['hero_title', 'hero_sub', 'about', 'hero_images', 'pass_percent', 'exam_questions', 'pay_info', 'faqs'];
// Legacy service_role keys are JWTs ("eyJ...") and also go in Authorization; new sb_secret_ keys only use apikey.
const H = { apikey: SK, ...(String(SK).startsWith('eyJ') ? { Authorization: 'Bearer ' + SK } : {}), 'Content-Type': 'application/json' };

async function db(path, method = 'GET', body, prefer = 'return=representation') {
  const r = await fetch(`${SU}/rest/v1/${path}`, { method, headers: { ...H, Prefer: prefer }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error(t), { dup: t.includes('23505') });
  return t ? JSON.parse(t) : [];
}
async function cnt(table, q = '') {
  const r = await fetch(`${SU}/rest/v1/${table}?select=id${q}`, { method: 'HEAD', headers: { ...H, Prefer: 'count=exact' } });
  return +(r.headers.get('content-range') || '*/0').split('/')[1] || 0;
}
const settings = async () => Object.fromEntries((await db('settings?select=key,value')).map((s) => [s.key, s.value]));

// --- auth helpers (no libraries) ---
const mac = (d) => crypto.createHmac('sha256', JS).update(d).digest('base64url');
const sign = (p) => { const d = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + 7 * 864e5 })).toString('base64url'); return d + '.' + mac(d); };
const verify = (t) => {
  try {
    const [d, s] = String(t).split('.');
    if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(mac(d)))) return null;
    const p = JSON.parse(Buffer.from(d, 'base64url'));
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
};
const hash = (pw) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 32).toString('hex'); };
const check = (pw, h) => { const [s, k] = h.split(':'); return crypto.timingSafeEqual(crypto.scryptSync(pw, s, 32), Buffer.from(k, 'hex')); };
const same = (x, y) => { x = String(x || ''); y = String(y || ''); return !!x && x.length === y.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(y)); };

async function ai(messages, json) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + GK, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.4, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  return d.choices?.[0]?.message?.content || '';
}
// Password-reset email through Brevo (free plan, verified sender address).
async function
