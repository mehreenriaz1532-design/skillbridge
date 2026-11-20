// ONE serverless function for the whole site (public + trainee + admin + AI + payments + email).
// Zero npm dependencies: Supabase via REST, Groq and Brevo via fetch.
const crypto = require('crypto');
const { SUPABASE_URL: SU, SUPABASE_SERVICE_KEY: SK, GROQ_API_KEY: GK, JWT_SECRET: JS, ADMIN_USER: AU, ADMIN_PASS: AP, BREVO_API_KEY: BK, MAIL_FROM: MF, SITE_URL } = process.env;
// llama-3.3-70b-versatile was shut down by Groq on 16 Aug 2026. Set GROQ_MODEL in Vercel to override the first choice.
const MODELS = [process.env.GROQ_MODEL, 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'].filter(Boolean);
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
const SETTING_KEYS = ['hero_title', 'hero_sub', 'about', 'hero_images', 'pass_percent', 'exam_questions', 'pay_info', 'faqs', 'hero_cta', 'marquee_on', 'contact_email', 'contact_phone', 'contact_address'];
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
  if (!GK) throw E('AI is not set up yet: add GROQ_API_KEY in Vercel and redeploy', 503);
  let last = '';
  for (const model of MODELS) {
    for (const useJson of json ? [true, false] : [false]) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + GK, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, temperature: 0.4, ...(useJson ? { response_format: { type: 'json_object' } } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return d.choices?.[0]?.message?.content || '';
      last = (d.error && d.error.message) || String(r.status);
      if (r.status === 401 || r.status === 429) throw E('AI service error: ' + last, 502);
    }
  }
  throw E('AI service error: ' + last, 502);
}
// Admin uploads (images / PDF) go to the public Supabase Storage bucket "media".
async function upload(type, b64) {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[type];
  if (!ext) throw E('Only JPG, PNG, WebP images and PDF files are allowed');
  const buf = Buffer.from(String(b64 || ''), 'base64');
  if (!buf.length || buf.length > 3e6) throw E('File is too large (max 3 MB)');
  const magic = { jpg: 'ffd8', png: '89504e47', webp: '52494646', pdf: '25504446' }[ext];
  if (buf.subarray(0, magic.length / 2).toString('hex') !== magic) throw E('This file does not look like a valid ' + ext.toUpperCase());
  const path = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const r = await fetch(`${SU}/storage/v1/object/media/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': type }, body: buf });
  if (!r.ok) throw E('Upload failed. Did you run schema3.sql (it creates the media bucket)? ' + (await r.text()).slice(0, 150), 502);
  return `${SU}/storage/v1/object/public/media/${path}`;
}
// Password-reset email through Brevo (free plan, verified sender address).
async function mail(to, subject, html) {
  if (!BK || !MF) throw new Error('Email is not configured');
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': BK, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: { email: MF, name: 'SkillBridge' }, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!r.ok) throw new Error(await r.text());
}

const enrolled = async (tid, cid) => {
  if (!(await db(`enrollments?trainee_id=eq.${tid}&course_id=eq.${cid | 0}&select=course_id`)).length) throw E('Enroll in this course first', 403);
};
async function allDone(tid, cid) {
  const [ls, pr] = await Promise.all([db(`lessons?select=id,modules!inner(course_id)&modules.course_id=eq.${cid | 0}`), db(`progress?trainee_id=eq.${tid}&select=lesson_id`)]);
  const p = new Set(pr.map((x) => x.lesson_id));
  if (!ls.length || ls.some((l) => !p.has(l.id))) throw E('Complete all lessons first');
}
const courseQs = (cid, sel) => db(`questions?select=${sel},modules!inner(course_id)&modules.course_id=eq.${cid | 0}`);

async function route(a, b, me, adm) {
  switch (a) {
    // ---------- public ----------
    case 'stats': {
      const [t, c, l] = await Promise.all([cnt('trainees'), cnt('certificates', '&revoked=eq.false'), cnt('lessons')]);
      return { trainees: t, certificates: c, lessons: l, rate: t ? Math.round((c / t) * 100) : 0 };
    }
    case 'content': {
      const [courses, announcements, gallery, st] = await Promise.all([
        db('courses?select=id,title,summary,icon,price,is_demo,instructor&published=eq.true&order=position'),
        db('announcements?select=*&order=pinned.desc,created_at.desc&limit=8'),
        db('gallery?select=*&order=position,id'),
        settings(),
      ]);
      return { courses, announcements, gallery, settings: st };
    }
    case 'course': {
      const [c] = await db(`courses?id=eq.${b.id | 0}&published=eq.true&select=*,modules(id,title,position,lessons(id,title,position))&modules.published=eq.true&modules.order=position&modules.lessons.order=position`);
      if (!c) throw E('Course not found', 404);
      return c;
    }
    case 'verify': {
      const code = S(b.code).toUpperCase();
      const [c] = await db(`certificates?id=eq.${enc(code)}&select=id,issued_at,score,revoked,courses(title),trainees(first_name,middle_name,last_name,cnic)`);
      if (!c) return { valid: false };
      const t = c.trainees;
      return { valid: !c.revoked, code: c.id, course: c.courses && c.courses.title, name: [t.first_name, t.middle_name, t.last_name].filter(Boolean).join(' '), cnic: '*********' + t.cnic.slice(-4), issued_at: c.issued_at, score: c.score };
    }
    case 'register': {
      const cnic = digits(b.cnic);
      if (cnic.length !== 13) throw E('Enter a valid 13-digit CNIC');
      if (cnic !== digits(b.cnic2)) throw E('CNIC numbers do not match');
      if (!S(b.first_name) || !S(b.last_name) || !S(b.dob)) throw E('Fill in all required fields');
      if (!/^\S+@\S+\.\S+$/.test(S(b.email))) throw E('Enter a valid email address');
      if (String(b.password || '').length < 6) throw E('Password must be at least 6 characters');
      try {
        const [t] = await db('trainees', 'POST', { cnic, first_name: S(b.first_name), middle_name: S(b.middle_name), last_name: S(b.last_name), dob: S(b.dob), email: S(b.email).toLowerCase(), phone: S(b.phone), password_hash: hash(String(b.password)) });
        return { token: sign({ r: 't', id: t.id }) };
      } catch (e) { throw e.dup ? E('This CNIC is already registered') : e; }
    }
    case 'login': {
      const [t] = await db(`trainees?cnic=eq.${digits(b.cnic)}&select=id,password_hash`);
      if (!t || !check(String(b.password || ''), t.password_hash)) throw E('Wrong CNIC or password');
      return { token: sign({ r: 't', id: t.id }) };
    }
    case 'forgot': {
      // Always answer the same way so nobody can test which CNICs/emails exist.
      const q = S(b.who), d = digits(q);
      const [t] = await db(d.length === 13 ? `trainees?cnic=eq.${d}&select=id,email,first_name` : `trainees?email=eq.${enc(q.toLowerCase())}&select=id,email,first_name&limit=1`);
      if (t) {
        const token = crypto.randomBytes(24).toString('hex');
        await db('resets', 'POST', { token_hash: sha(token), trainee_id: t.id, expires_at: new Date(Date.now() + 36e5).toISOString() }, 'return=minimal');
        const link = `${HOST}/#/reset/${token}`;
        await mail(t.email, 'Reset your SkillBridge password', `<p>Hello ${t.first_name.replace(/[<>&]/g, '')},</p><p>Click the link below to choose a new password. It works for 1 hour.</p><p><a href="${link}">${link}</a></p><p>If you did not ask for this, ignore this email.</p>`);
      }
      return { ok: true };
    }
    case 'reset': {
      if (String(b.password || '').length < 6) throw E('Password must be at least 6 characters');
      const h = sha(S(b.token));
      const [r] = await db(`resets?token_hash=eq.${h}&used=eq.false&expires_at=gt.${enc(new Date().toISOString())}&select=*`);
      if (!r) throw E('This reset link is invalid or has expired');
      await db(`trainees?id=eq.${r.trainee_id}`, 'PATCH', { password_hash: hash(String(b.password)) }, 'return=minimal');
      await db(`resets?token_hash=eq.${h}`, 'PATCH', { used: true }, 'return=minimal');
      return { ok: true };
    }
    case 'admin_login':
      if (!same(b.user, AU) || !same(b.pass, AP)) throw E('Wrong username or password');
      return { token: sign({ r: 'a' }) };

    // ---------- trainee ----------
    case 'me': {
      need(me);
      const en = (await db(`enrollments?trainee_id=eq.${me.id}&select=course_id`)).map((e) => e.course_id);
      const [t, courses, done, certs, pays, live, st] = await Promise.all([
        db(`trainees?id=eq.${me.id}&select=first_name,middle_name,last_name,cnic,email`),
        db(`courses?id=in.(${en.join(',')})&select=id,title,icon,modules(id,title,icon,lessons(id,title,position))&order=position&modules.order=position&modules.lessons.order=position`),
        db(`progress?trainee_id=eq.${me.id}&select=lesson_id`),
        db(`certificates?trainee_id=eq.${me.id}&revoked=eq.false&select=*`),
        db(`payments?trainee_id=eq.${me.id}&select=course_id,status,created_at&order=created_at.desc`),
        en.length ? db(`live_classes?or=(course_id.is.null,course_id.in.(${en.join(',')}))&starts_at=gte.${enc(new Date(Date.now() - 72e5).toISOString())}&order=starts_at&limit=10`) : [],
        settings(),
      ]);
      if (!t[0]) throw E('Please login', 401);
      return { me: t[0], courses, done: done.map((d) => d.lesson_id), certs, pays, live, pass: st.pass_percent || 60 };
    }
    case 'enroll': {
      need(me);
      const [c] = await db(`courses?id=eq.${b.course_id | 0}&published=eq.true&select=id,price`);
      if (!c) throw E('Course not found', 404);
      if (c.price > 0) throw E('This is a paid course. Please complete the payment first.');
      await db('enrollments', 'POST', { trainee_id: me.id, course_id: c.id }, 'resolution=ignore-duplicates,return=minimal');
      return { ok: true };
    }
    case 'pay': {
      need(me);
      const [c] = await db(`courses?id=eq.${b.course_id | 0}&select=id,price`);
      if (!c || c.price <= 0) throw E('This course does not need payment');
      const method = ['bank', 'jazzcash', 'easypaisa'].includes(b.method) ? b.method : null;
      const trx = S(b.trx_id).toUpperCase(), proof = S(b.proof_url), amount = b.amount | 0;
      if (!method || trx.length < 6) throw E('Choose a payment method and enter a valid transaction ID');
      const since = enc(new Date(Date.now() - 864e5).toISOString());
      const [mine, recent, dup, reuse] = await Promise.all([
        db(`payments?trainee_id=eq.${me.id}&course_id=eq.${c.id}&status=in.(pending,approved)&select=id`),
        db(`payments?trainee_id=eq.${me.id}&created_at=gt.${since}&select=id`),
        db(`payments?trx_id=eq.${enc(trx)}&select=id`),
        proof ? db(`payments?proof_url=eq.${enc(proof)}&select=id`) : [],
      ]);
      if (mine.length) throw E('You already have a pending or approved payment for this course');
      if (recent.length >= 5) throw E('Too many payment submissions today. Try again tomorrow.');
      // Suspicious-payment flags: the admin sees these before approving.
      const flags = [dup.length && 'duplicate_trx', amount !== c.price && 'amount_mismatch', recent.length >= 3 && 'many_attempts', reuse.length && 'reused_proof'].filter(Boolean).join(',');
      await db('payments', 'POST', { trainee_id: me.id, course_id: c.id, method, amount, trx_id: trx, sender: S(b.sender), proof_url: proof, flags }, 'return=minimal');
      return { ok: true };
    }
    case 'lesson': {
      need(me);
      const [l] = await db(`lessons?id=eq.${b.id | 0}&select=*,modules(course_id)`);
      if (!l) throw E('Lesson not found', 404);
      await enrolled(me.id, l.modules && l.modules.course_id);
      delete l.modules;
      return l;
    }
    case 'done': {
      need(me);
      const [l] = await db(`lessons?id=eq.${b.id | 0}&select=id,modules(course_id)`);
      if (!l) throw E('Lesson not found', 404);
      await enrolled(me.id, l.modules && l.modules.course_id);
      await db('progress', 'POST', { trainee_id: me.id, lesson_id: l.id }, 'resolution=ignore-duplicates,return=minimal');
      return { ok: true };
    }
    case 'exam': {
      need(me); await enrolled(me.id, b.course_id); await allDone(me.id, b.course_id);
      const [st, qs] = await Promise.all([settings(), courseQs(b.course_id, 'id,question,options')]);
      return { questions: shuffle(qs).slice(0, st.exam_questions || 10).map(({ modules, ...q }) => q), pass: st.pass_percent || 60 };
    }
    case 'submit': {
      need(me); await enrolled(me.id, b.course_id); await allDone(me.id, b.course_id);
      const ans = b.answers || {};
      const ids = Object.keys(ans).map((x) => x | 0).filter(Boolean);
      const [st, all] = await Promise.all([settings(), courseQs(b.course_id, 'id,answer')]);
      if (!ids.length || ids.length < Math.min(st.exam_questions || 10, all.length)) throw E('Answer all questions');
      const pct = Math.round((all.filter((k) => ids.includes(k.id) && ans[k.id] === k.answer).length / ids.length) * 100);
      const passed = pct >= (st.pass_percent || 60);
      await db('attempts', 'POST', { trainee_id: me.id, score: pct, passed }, 'return=minimal');
      let cert = null;
      if (passed) {
        const ex = await db(`certificates?trainee_id=eq.${me.id}&course_id=eq.${b.course_id | 0}&select=*&limit=1`);
        cert = ex[0] || (await db('certificates', 'POST', { id: 'SB-' + crypto.randomBytes(4).toString('hex').toUpperCase(), trainee_id: me.id, course_id: b.course_id | 0, score: pct }))[0];
      }
      return { score: pct, passed, cert };
    }
    case 'mentor': {
      need(me);
      const hist = (Array.isArray(b.history) ? b.history : []).slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.content).slice(0, 600) }));
      const reply = await ai([
        { role: 'system', content: 'You are a friendly soft-skills mentor for Pakistani workers preparing for jobs abroad. Help with communication, teamwork, cultural adaptation, leadership and workplace etiquette. Reply in the same language the user writes (English, Urdu or Roman Urdu), in under 120 words, with one practical example.' },
        ...hist, { role: 'user', content: String(b.message || '').slice(0, 600) },
      ]);
      return { reply };
    }

    // ---------- admin ----------
    case 'a_stats': {
      need(adm);
      const [s, co, q, pp, at] = await Promise.all([route('stats'), cnt('courses'), cnt('questions'), cnt('payments', '&status=eq.pending'), cnt('attempts')]);
      return { ...s, courses: co, questions: q, pending_payments: pp, attempts: at };
    }
    case 'a_list': {
      need(adm);
      const q = {
        courses: 'courses?select=*&order=position',
        modules: 'modules?select=*&order=course_id,position',
        lessons: 'lessons?select=*&order=module_id,position',
        questions: 'questions?select=*&order=module_id,id',
        live_classes: 'live_classes?select=*&order=starts_at.desc',
        announcements: 'announcements?select=*&order=created_at.desc',
        gallery: 'gallery?select=*&order=position,id',
        payments: 'payments?select=*,trainees(first_name,last_name,cnic),courses(title)&order=created_at.desc&limit=300',
        trainees: 'trainees?select=id,cnic,first_name,last_name,email,phone,created_at&order=created_at.desc&limit=500',
        certificates: 'certificates?select=*,trainees(first_name,last_name,cnic),courses(title)&order=issued_at.desc&limit=500',
      }[b.t];
      if (!q) throw E('Bad table');
      return db(q);
    }
    case 'a_save': {
      need(adm);
      const ks = COLS[b.t]; if (!ks) throw E('Bad table');
      const row = pick(b.row || {}, ks);
      if (b.t === 'gallery' && !S(row.image_url) && !S(row.link)) throw E('Add an image, or a link / PDF');
      if (b.t === 'questions') {
        if (!Array.isArray(row.options) || row.options.length < 2 || !(row.answer >= 0 && row.answer < row.options.length)) throw E('Add at least 2 options and a valid correct option number');
        row.answer |= 0;
      }
      const id = b.row && b.row.id | 0;
      const r = id ? await db(`${b.t}?id=eq.${id}`, 'PATCH', row) : await db(b.t, 'POST', row);
      return r[0] || {};
    }
    case 'a_del':
      need(adm);
      if (![...Object.keys(COLS), 'trainees', 'certificates', 'payments'].includes(b.t)) throw E('Bad table');
      await db(`${b.t}?id=eq.${enc(b.id)}`, 'DELETE', null, 'return=minimal');
      return { ok: true };
    case 'a_cert':
      need(adm);
      await db(`certificates?id=eq.${enc(b.id)}`, 'PATCH', { revoked: !!b.revoked }, 'return=minimal');
      return { ok: true };
    case 'a_pay': {
      need(adm);
      const [p] = await db(`payments?id=eq.${b.id | 0}&select=*`);
      if (!p) throw E('Payment not found', 404);
      if (b.status === 'approved') {
        const other = await db(`payments?trx_id=eq.${enc(p.trx_id)}&status=eq.approved&id=neq.${p.id}&select=id`);
        if (other.length) throw E('Another payment with this transaction ID was already approved');
        await db('enrollments', 'POST', { trainee_id: p.trainee_id, course_id: p.course_id }, 'resolution=ignore-duplicates,return=minimal');
      } else if (b.status !== 'rejected') throw E('Bad status');
      await db(`payments?id=eq.${p.id}`, 'PATCH', { status: b.status }, 'return=minimal');
      return { ok: true };
    }
    case 'a_upload':
      need(adm);
      return { url: await upload(b.type, b.data) };
    case 'a_set':
      need(adm);
      if (!SETTING_KEYS.includes(b.key)) throw E('Bad setting');
      await db('settings', 'POST', { key: b.key, value: b.value }, 'resolution=merge-duplicates,return=minimal');
      return { ok: true };
    case 'a_quiz': {
      need(adm);
      const n = Math.min(b.n | 0 || 5, 10);
      const txt = await ai([
        { role: 'system', content: 'You write multiple-choice questions for a soft-skills course for workers going abroad. Return ONLY JSON: {"questions":[{"question":"","options":["","","",""],"answer":0}]} where answer is the 0-based index of the correct option.' },
        { role: 'user', content: `Write ${n} questions about: ${String(b.topic || '').slice(0, 3000)}` },
      ], true);
      let qs; try { qs = JSON.parse(txt).questions; } catch { throw E('AI returned invalid data, try again'); }
      const rows = (qs || []).filter((q) => q.question && Array.isArray(q.options) && q.options.length >= 2 && q.options[q.answer] !== undefined)
        .map((q) => ({ module_id: b.module_id | 0 || null, question: String(q.question), options: q.options.map(String), answer: q.answer | 0 }));
      if (!rows.length) throw E('No valid questions generated, try again');
      await db('questions', 'POST', rows, 'return=minimal');
      return { added: rows.length };
    }
    default: throw E('Unknown action', 404);
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') throw E('POST only', 405);
    if (!SU || !SK || !JS) throw E('Server is not configured: set the environment variables in Vercel', 500);
    HOST = (SITE_URL || 'https://' + req.headers.host).replace(/\/$/, '');
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const tok = verify((req.headers.authorization || '').replace('Bearer ', ''));
    res.status(200).json(await route(b.a, b, tok && tok.r === 't' ? tok : null, tok && tok.r === 'a'));
  } catch (e) {
    if (!e.user) console.error(e);
    res.status(e.code || 500).json({ error: e.user || 'Server error' });
  }
};
