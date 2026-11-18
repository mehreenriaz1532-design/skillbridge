// ONE serverless function for the whole site (public + trainee + admin + AI).
// Zero npm dependencies: Supabase is called through its REST API, Groq through fetch.
const crypto = require('crypto');
const { SUPABASE_URL: SU, SUPABASE_SERVICE_KEY: SK, GROQ_API_KEY: GK, JWT_SECRET: JS, ADMIN_USER: AU, ADMIN_PASS: AP } = process.env;
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const E = (m, c = 400) => Object.assign(new Error(m), { user: m, code: c });
const need = (x) => { if (!x) throw E('Please login', 401); };
const S = (v) => String(v || '').trim();
const digits = (s) => String(s || '').replace(/\D/g, '');
const enc = encodeURIComponent;
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => k in o).map((k) => [k, o[k]]));
const COLS = {
  modules: ['title', 'description', 'icon', 'position', 'published'],
  lessons: ['module_id', 'title', 'content', 'video_url', 'position'],
  questions: ['module_id', 'question', 'options', 'answer'],
};
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

// --- Groq AI ---
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

async function allDone(id) {
  const [l, p] = await Promise.all([cnt('lessons'), db(`progress?trainee_id=eq.${id}&select=lesson_id`)]);
  if (!l || p.length < l) throw E('Complete all lessons first');
}

async function route(a, b, me, adm) {
  switch (a) {
    // ---------- public ----------
    case 'stats': {
      const [t, c, l] = await Promise.all([cnt('trainees'), cnt('certificates', '&revoked=eq.false'), cnt('lessons')]);
      return { trainees: t, certificates: c, lessons: l, rate: t ? Math.round((c / t) * 100) : 0 };
    }
    case 'content': {
      const [modules, st] = await Promise.all([db('modules?select=id,title,description,icon,lessons(count)&published=eq.true&order=position'), settings()]);
      return { modules, settings: st };
    }
    case 'verify': {
      const code = S(b.code).toUpperCase();
      const [c] = await db(`certificates?id=eq.${enc(code)}&select=id,issued_at,score,revoked,trainees(first_name,middle_name,last_name,cnic)`);
      if (!c) return { valid: false };
      const t = c.trainees;
      return { valid: !c.revoked, code: c.id, name: [t.first_name, t.middle_name, t.last_name].filter(Boolean).join(' '), cnic: '*********' + t.cnic.slice(-4), issued_at: c.issued_at, score: c.score };
    }
    case 'register': {
      const cnic = digits(b.cnic);
      if (cnic.length !== 13) throw E('Enter a valid 13-digit CNIC');
      if (cnic !== digits(b.cnic2)) throw E('CNIC numbers do not match');
      if (!S(b.first_name) || !S(b.last_name) || !S(b.dob)) throw E('Fill in all required fields');
      if (!/^\S+@\S+\.\S+$/.test(S(b.email))) throw E('Enter a valid email address');
      if (String(b.password || '').length < 6) throw E('Password must be at least 6 characters');
      try {
        const [t] = await db('trainees', 'POST', { cnic, first_name: S(b.first_name), middle_name: S(b.middle_name), last_name: S(b.last_name), dob: S(b.dob), email: S(b.email), phone: S(b.phone), password_hash: hash(String(b.password)) });
        return { token: sign({ r: 't', id: t.id }) };
      } catch (e) { throw e.dup ? E('This CNIC is already registered') : e; }
    }
    case 'login': {
      const [t] = await db(`trainees?cnic=eq.${digits(b.cnic)}&select=id,password_hash`);
      if (!t || !check(String(b.password || ''), t.password_hash)) throw E('Wrong CNIC or password');
      return { token: sign({ r: 't', id: t.id }) };
    }
    case 'admin_login':
      if (!same(b.user, AU) || !same(b.pass, AP)) throw E('Wrong username or password');
      return { token: sign({ r: 'a' }) };

    // ---------- trainee ----------
    case 'me': {
      need(me);
      const [t, modules, done, certs, st] = await Promise.all([
        db(`trainees?id=eq.${me.id}&select=first_name,middle_name,last_name,cnic,email`),
        db('modules?select=id,title,description,icon,lessons(id,title,position)&published=eq.true&order=position&lessons.order=position'),
        db(`progress?trainee_id=eq.${me.id}&select=lesson_id`),
        db(`certificates?trainee_id=eq.${me.id}&select=*&limit=1`),
        settings(),
      ]);
      if (!t[0]) throw E('Please login', 401);
      return { me: t[0], modules, done: done.map((d) => d.lesson_id), cert: certs[0] && !certs[0].revoked ? certs[0] : null, pass: st.pass_percent || 60 };
    }
    case 'lesson': { need(me); const [l] = await db(`lessons?id=eq.${b.id | 0}&select=*`); if (!l) throw E('Lesson not found', 404); return l; }
    case 'done':
      need(me);
      await db('progress', 'POST', { trainee_id: me.id, lesson_id: b.id | 0 }, 'resolution=ignore-duplicates,return=minimal');
      return { ok: true };
    case 'exam': {
      need(me); await allDone(me.id);
      const [st, qs] = await Promise.all([settings(), db('questions?select=id,question,options')]);
      return { questions: shuffle(qs).slice(0, st.exam_questions || 10), pass: st.pass_percent || 60 };
    }
    case 'submit': {
      need(me); await allDone(me.id);
      const ans = b.answers || {};
      const ids = Object.keys(ans).map((x) => x | 0).filter(Boolean);
      const [st, total_q] = await Promise.all([settings(), cnt('questions')]);
      if (!ids.length || ids.length < Math.min(st.exam_questions || 10, total_q)) throw E('Answer all questions');
      const key = await db(`questions?id=in.(${ids.join(',')})&select=id,answer`);
      const pct = Math.round((key.filter((k) => ans[k.id] === k.answer).length / ids.length) * 100);
      const passed = pct >= (st.pass_percent || 60);
      await db('attempts', 'POST', { trainee_id: me.id, score: pct, passed }, 'return=minimal');
      let cert = null;
      if (passed) {
        const ex = await db(`certificates?trainee_id=eq.${me.id}&select=*&limit=1`);
        cert = ex[0] || (await db('certificates', 'POST', { id: 'SB-' + crypto.randomBytes(4).toString('hex').toUpperCase(), trainee_id: me.id, score: pct }))[0];
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
      const [s, m, q, at] = await Promise.all([route('stats'), cnt('modules'), cnt('questions'), cnt('attempts')]);
      return { ...s, modules: m, questions: q, attempts: at };
    }
    case 'a_list': {
      need(adm);
      const q = {
        modules: 'modules?select=*&order=position',
        lessons: 'lessons?select=*&order=module_id,position',
        questions: 'questions?select=*&order=module_id,id',
        trainees: 'trainees?select=id,cnic,first_name,last_name,email,phone,created_at&order=created_at.desc&limit=500',
        certificates: 'certificates?select=*,trainees(first_name,last_name,cnic)&order=issued_at.desc&limit=500',
      }[b.t];
      if (!q) throw E('Bad table');
      return db(q);
    }
    case 'a_save': {
      need(adm);
      const ks = COLS[b.t]; if (!ks) throw E('Bad table');
      const row = pick(b.row || {}, ks);
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
      if (!['modules', 'lessons', 'questions', 'trainees', 'certificates'].includes(b.t)) throw E('Bad table');
      await db(`${b.t}?id=eq.${enc(b.id)}`, 'DELETE', null, 'return=minimal');
      return { ok: true };
    case 'a_cert':
      need(adm);
      await db(`certificates?id=eq.${enc(b.id)}`, 'PATCH', { revoked: !!b.revoked }, 'return=minimal');
      return { ok: true };
    case 'a_set':
      need(adm);
      if (!['hero_title', 'hero_sub', 'pass_percent', 'exam_questions', 'faqs'].includes(b.key)) throw E('Bad setting');
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
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const tok = verify((req.headers.authorization || '').replace('Bearer ', ''));
    res.status(200).json(await route(b.a, b, tok && tok.r === 't' ? tok : null, tok && tok.r === 'a'));
  } catch (e) {
    if (!e.user) console.error(e);
    res.status(e.code || 500).json({ error: e.user || 'Server error' });
  }
};
