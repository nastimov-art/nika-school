// Учимся с Никой: самоучитель. Контент живёт в content/*.json, здесь только движок.
(() => {
  'use strict';
  const KEY = 'nika-school-v1';
  const app = document.getElementById('app');
  const LV = ['🔒', '🌱', '🌿', '🌳', '⭐', '🚀'];
  const LVT = ['пока закрыто', 'начала', 'учусь', 'получается', 'освоила', 'готова дальше'];
  const BOX_DAYS = [0, 1, 3, 7, 21]; // коробки повторения: завтра, 3 дня, неделя, 3 недели
  const PRIO = { red: 0, yellow: 1, green: 2 };
  const HINT_LABELS = ['Скажу проще', 'Подсказка', 'Пример', 'По шагам', 'Попробуй полегче'];
  const GENERIC_HINTS = ['Прочитай задание ещё раз медленно, по слогам.', 'Ответ прячется в тексте или на картинке. Найди нужное место пальцем.'];
  const INSTR = { choice: 'Прочитай вопрос. Потом нажми на один ответ из кнопок ниже.', input: 'Посчитай и набери ответ на кнопках с цифрами. Потом нажми «Проверить».',
    order: 'Нажимай на карточки по порядку: сначала то, что было первым. Потом «Проверить».', match: 'Нажми на карточку слева, потом на её пару справа.',
    say: 'Скажи ответ вслух маме или себе. Потом нажми зелёную кнопку.', info: 'Прочитай и нажми «Дальше».', word: 'Прочитай новое слово и что оно значит. Потом «Дальше».', listen: 'Послушай историю до конца.' };

  let C = null;   // контент
  let S = null;   // состояние (прогресс)
  let P = null;   // текущий урок
  let cleanup = null;

  // ---------- утилиты ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const z = (n) => String(n).padStart(2, '0');
  const dstr = (d) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  const today = () => dstr(new Date());
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const fmtDay = (iso) => {
    if (!iso) return '';
    if (iso <= today()) return 'сегодня';
    if (iso === addDays(1)) return 'завтра';
    const [y, m, d] = iso.split('-');
    return `${+d}.${m}`;
  };

  function blankState() {
    return { v: 1, name: '', worlds: [], skills: {}, lessons: {}, words: {}, log: [], sessions: [],
      parent: { pin: '', comment: '', notes: '', unlockAll: false }, set: { syll: false },
      days: {}, calendar: {}, outbox: [], lastSend: null };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return Object.assign(blankState(), s); } catch (e) { /* пусто */ }
    return blankState();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.error('Прогресс не сохранился', e); } }

  // ---------- озвучка ----------
  let voices = [];
  const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch (e) { voices = []; } };
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function speak(text, lang) {
    if (!('speechSynthesis' in window)) return;
    const l = lang === 'en' ? 'en' : 'ru';
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/[«»]/g, ''));
    u.lang = l === 'en' ? 'en-GB' : 'ru-RU';
    const v = voices.find((x) => x.lang && x.lang.toLowerCase().startsWith(l) && /natural|online|google/i.test(x.name)) ||
      voices.find((x) => x.lang && x.lang.toLowerCase().startsWith(l));
    if (v) u.voice = v;
    u.rate = l === 'en' ? 0.85 : 0.92;
    speechSynthesis.speak(u);
    if (P && P.ts && P.ts.wrongs > 0) P.ts.listenedAfterWrong = true;
  }

  // ---------- слоги (для чтения по слогам цветом) ----------
  const VOW = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ';
  function sylls(w) {
    const idx = [];
    for (let i = 0; i < w.length; i++) if (VOW.includes(w[i])) idx.push(i);
    if (idx.length < 2) return [w];
    const cuts = [];
    for (let k = 0; k < idx.length - 1; k++) {
      const a = idx[k], b = idx[k + 1], cons = b - a - 1;
      // открытый слог: стык согласных уходит вправо (ко-шка, у-тро),
      // кроме сонорных и й перед другой согласной (кон-фе-та, ёл-ка, май-ка) и двойных (ван-на)
      const f = w[a + 1].toLowerCase(), n = (w[a + 2] || '').toLowerCase();
      let cut = cons <= 1 ? a + 1 : ('йрлмн'.includes(f) || f === n) ? a + 2 : a + 1;
      while (cut < b && 'ьъЬЪ'.includes(w[cut])) cut++;
      cuts.push(cut);
    }
    const out = []; let p = 0;
    for (const c of cuts) { out.push(w.slice(p, c)); p = c; }
    out.push(w.slice(p));
    return out;
  }
  function rich(text, lang) {
    const t = esc(text).replace(/\n/g, '<br>');
    const on = S.set.syll || (P && P.ts && P.ts.syllOn);
    if (!on || lang === 'en') return t;
    return t.replace(/[А-Яа-яЁё]+/g, (w) => sylls(w).map((s, i) => `<span class="s${i % 2}">${s}</span>`).join(''));
  }
  const sayBtn = (text, lang, cls) => `<button class="say-btn ${cls || ''}" data-say="${esc(text)}" data-lang="${lang || 'ru'}" aria-label="Прослушать">🔊</button>`;

  // ---------- контент ----------
  // ---------- закрытый контент: data.enc шифруется паролем (build.js), здесь расшифровка ----------
  let BUNDLE = null;
  const KEYSTORE = 'nika-key';
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const normPass = (p) => p.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  async function decryptWith(key, enc) {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  async function keyFromPass(pass, enc) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normPass(pass)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }
  async function unlock() {
    let enc;
    try { const r = await fetch('data.enc', { cache: 'no-cache' }); if (!r.ok) return; enc = await r.json(); } catch (e) { return; } // локально: открытый content/
    try {
      const raw = localStorage.getItem(KEYSTORE);
      if (raw) { const key = await crypto.subtle.importKey('raw', b64(raw), 'AES-GCM', true, ['decrypt']); BUNDLE = await decryptWith(key, enc); return; }
    } catch (e) { /* ключ устарел (сменили пароль) */ }
    BUNDLE = await askPassword(enc);
  }
  function askPassword(enc) {
    return new Promise((done) => {
      app.innerHTML = `<main class="player"><div class="hello" style="margin-top:40px"><div class="duo">${Chars.html('nika', 'happy')}${Chars.html('luna', 'think', 'md')}</div>
        <div class="bubble">Это закрытая школа. Введи пароль, который дала мама. Вводить нужно только один раз.</div></div>
        <div class="card" style="text-align:center"><input class="field name-input" id="pw" placeholder="Пароль" autocomplete="off" autocapitalize="off" spellcheck="false">
        <p class="sub" id="pwmsg"></p><div class="pfoot"><button class="btn" id="pwgo">Войти</button></div></div></main>`;
      const inp = document.getElementById('pw'), msg = document.getElementById('pwmsg'), go = document.getElementById('pwgo');
      const tryIt = async () => {
        if (!inp.value.trim()) return;
        go.disabled = true; msg.textContent = 'Проверяю…';
        try {
          const key = await keyFromPass(inp.value, enc);
          const b = await decryptWith(key, enc);
          const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
          try { localStorage.setItem(KEYSTORE, btoa(String.fromCharCode(...raw))); } catch (e) { /* без запоминания */ }
          done(b);
        } catch (e) { msg.textContent = 'Не подходит. Проверь буквы и пробелы.'; go.disabled = false; inp.focus(); }
      };
      go.onclick = tryIt; inp.onkeydown = (e) => { if (e.key === 'Enter') tryIt(); }; inp.focus();
    });
  }
  const src = (p) => (BUNDLE && BUNDLE.files[p]) || p; // картинка из зашифрованного пакета или обычный путь

  async function loadContent() {
    const get = (f) => BUNDLE ? Promise.resolve(BUNDLE.files[f]).then((x) => { if (!x) throw new Error(f); return x; })
      : fetch('content/' + f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
    const idx = await get('index.json');
    const [program, words, errors, modes, calendar, ...files] = await Promise.all([get(idx.program), get(idx.words), get(idx.errors), get(idx.modes), get(idx.calendar), ...idx.lessons.map(get)]);
    const lessons = files.flatMap((f) => f.lessons);
    const skills = program.skills;
    const skillById = Object.fromEntries(skills.map((s) => [s.id, s]));
    const wordById = Object.fromEntries(words.words.map((w) => [w.id, w]));
    return { program, tracks: program.tracks, worlds: program.worlds, skills, skillById, lessons, words: words.words, wordById, errors, modes, calendar: calendar.days,
      config: (BUNDLE && BUNDLE.files['config.json']) || {} };
  }
  const track = (id) => C.tracks.find((t) => t.id === id) || { id, title: id, emoji: '•', color: '#fff' };
  const skillOf = (l) => C.skillById[l.skill];

  // ---------- навыки и доступ ----------
  const sk = (id) => (S.skills[id] = S.skills[id] || { lvl: 0, box: 0, due: '' });
  const lvl = (id) => { const s = S.skills[id]; if (!s) return 0; return s.manual != null ? s.manual : s.lvl; };
  const skillOpen = (s) => S.parent.unlockAll || s.deps.every((d) => lvl(d) >= 3);
  const lessonsOf = (sid) => C.lessons.filter((l) => l.skill === sid);
  const isDone = (l) => !!(S.lessons[l.id] && S.lessons[l.id].done);
  function lessonOpen(l) {
    const s = skillOf(l);
    if (!s || !skillOpen(s)) return false;
    if (l.repeat || S.parent.unlockAll) return true;
    const list = lessonsOf(l.skill).filter((x) => !x.repeat);
    const i = list.indexOf(l);
    return i <= 0 || isDone(list[i - 1]);
  }
  const lockReason = (l) => {
    const s = skillOf(l);
    const miss = s.deps.filter((d) => lvl(d) < 3).map((d) => C.skillById[d].title);
    return miss.length ? 'Откроется после: ' + miss.join(', ') : 'Сначала предыдущий урок';
  };
  function nextInTrack(tid) {
    const ls = C.lessons.filter((l) => skillOf(l).track === tid);
    return ls.find((l) => !l.repeat && lessonOpen(l) && !isDone(l)) || ls.find((l) => l.repeat && lessonOpen(l)) || null;
  }
  function mainPick() {
    const pref = ['reading', 'math', 'reading', 'math', 'reading', 'words', 'math'][new Date().getDay()];
    const cand = C.lessons.filter((l) => !l.repeat && lessonOpen(l) && !isDone(l) && ['reading', 'math', 'words'].includes(skillOf(l).track));
    cand.sort((a, b) => (PRIO[skillOf(a).priority] - PRIO[skillOf(b).priority]) ||
      ((skillOf(a).track === pref ? 0 : 1) - (skillOf(b).track === pref ? 0 : 1)) || (C.lessons.indexOf(a) - C.lessons.indexOf(b)));
    return cand[0] || null;
  }
  const dueSkills = () => C.skills.filter((s) => S.skills[s.id] && S.skills[s.id].box > 0 && S.skills[s.id].due <= today());
  const dueWords = () => Object.keys(S.words).filter((id) => C.wordById[id] && S.words[id].box > 0 && S.words[id].due <= today());

  // ---------- учебный день: режимы, рабочее время, план, отчёты ----------
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const modeFor = (d) => S.calendar[d] || (C.calendar[d] && C.calendar[d].mode) || C.modes.week[String(new Date(d + 'T12:00').getDay())] || 'school';
  const modeInfo = (m) => C.modes.modes[m] || C.modes.modes.school;
  const dayNote = (d) => (C.calendar[d] && C.calendar[d].note) || '';
  const day = () => S.days[today()];
  const minutesSince = (t) => Math.floor((Date.now() - t) / 60000);

  function buildDay(mode, energy) {
    const steps = [], used = new Set(), missing = [];
    const add = (l) => { if (l && !used.has(l.id)) { used.add(l.id); steps.push({ kind: 'lesson', lesson: l.id, title: l.title, track: skillOf(l).track, done: false }); return true; } return false; };
    if (dueSkills().length || dueWords().length) steps.push({ kind: 'review', title: 'Вспомним', track: 'review', done: false });
    if (energy === 'tired') { // устала: повторение и одно лёгкое
      if (steps.length < 1) add(nextInTrack('english') || nextInTrack('logic'));
      return { steps, missing };
    }
    for (const slot of modeInfo(mode).plan) {
      if (slot === 'break') { if (steps.length && steps[steps.length - 1].kind !== 'break') steps.push({ kind: 'break', title: 'Перерыв 5 минут', track: 'break', done: false }); continue; }
      const ok = slot === 'main' ? add(mainPick()) : add(nextInTrack(slot));
      if (!ok && slot !== 'main') missing.push(track(slot).title);
    }
    while (steps.length && steps[steps.length - 1].kind === 'break') steps.pop();
    if (energy === 'meh') { // так себе: не больше двух шагов, без перерывов
      const keep = steps.filter((x) => x.kind !== 'break').slice(0, 2);
      return { steps: keep, missing };
    }
    return { steps, missing };
  }
  const nextStepOf = (dy) => dy.steps.find((x) => !x.done);
  function markStepDone(kind, lessonId) {
    const dy = day(); if (!dy || !dy.steps) return;
    const st = dy.steps.find((x) => !x.done && x.kind === kind && (kind !== 'lesson' || x.lesson === lessonId));
    if (st) { st.done = true; st.at = Date.now(); }
    if (dy.extraLesson && dy.extraLesson === lessonId) { dy.extraDone = true; enqueueReport(today()); }
    save();
  }
  function closeDayIfNeeded() {
    const dy = day(); if (!dy || !dy.started || dy.end || !dy.steps) return;
    const allDone = dy.steps.every((x) => x.done);
    const cap = modeInfo(dy.mode).minutes;
    const timeUp = cap && minutesSince(dy.started) >= cap && dy.steps.some((x) => x.done);
    if (allDone || timeUp) { dy.end = Date.now(); dy.timeUp = !allDone; save(); enqueueReport(today()); }
  }

  // отчёт за день: из журнала событий
  function dayReport(d) {
    const dy = S.days[d] || {};
    const logs = S.log.filter((x) => dstr(new Date(x.t)) === d);
    const byLesson = {};
    for (const x of logs) {
      const k = x.lesson; const L = byLesson[k] = byLesson[k] || { lesson: k, title: (C.lessons.find((l) => l.id === k) || { title: k === 'review' ? 'Повторение' : k }).title, skill: x.skill, tasks: 0, clean: 0, hints: 0, revealed: 0, help: {}, errs: {} };
      if (x.info) { (x.help || []).forEach((h) => (L.help[h] = (L.help[h] || 0) + 1)); continue; }
      L.tasks++; if (!x.wrongs && !x.hints && !(x.help || []).length) L.clean++;
      L.hints += x.hints || 0; if (x.revealed) L.revealed++;
      (x.help || []).forEach((h) => (L.help[h] = (L.help[h] || 0) + 1));
      (x.errs || []).forEach((e) => (L.errs[e] = (L.errs[e] || 0) + 1));
    }
    const mins = dy.started ? Math.round(((dy.end || Date.now()) - dy.started) / 60000) : 0;
    return { v: 1, kind: 'daily', date: d, sent: new Date().toISOString(), mode: dy.mode || modeFor(d), started_by: dy.by || null, energy: dy.energy || null,
      minutes: mins, time_up: !!dy.timeUp, steps: (dy.steps || []).map((x) => ({ title: x.title, track: x.track, done: !!x.done })), missing: dy.missing || [],
      extra: dy.extraLesson ? { lesson: dy.extraLesson, done: !!dy.extraDone } : null, refused: dy.refused || null,
      lessons: Object.values(byLesson), errors_legend: C.errors, words_in_work: Object.keys(S.words).length };
  }
  function enqueueReport(d) {
    const now = new Date();
    S.outbox.push({ path: `daily/${d}_${z(now.getHours())}${z(now.getMinutes())}${z(now.getSeconds())}.json`, json: dayReport(d) });
    if (!S.outbox.some((x) => x.snapshot)) S.outbox.push({ path: 'snapshot/latest.json', snapshot: true, replace: true }); // снимок собирается при отправке
    save(); flushOutbox();
  }
  const utf8b64 = (str) => btoa(unescape(encodeURIComponent(str)));
  let flushing = false;
  async function flushOutbox() {
    const r = C && C.config && C.config.reports;
    if (!r || flushing || !navigator.onLine) return;
    flushing = true;
    try {
      // ponytail: snapshot перезаписывается через sha, остальные файлы уникальны по времени
      const queue = S.outbox.slice();
      for (const item of queue) {
        const url = `https://api.github.com/repos/${r.owner}/${r.repo}/contents/${item.path}`;
        const headers = { Authorization: 'Bearer ' + r.token, Accept: 'application/vnd.github+json' };
        let sha;
        if (item.replace) { const g = await fetch(url, { headers }); if (g.ok) sha = (await g.json()).sha; }
        const json = item.snapshot ? { v: 1, kind: 'snapshot', at: new Date().toISOString(), state: Object.assign({}, S, { outbox: [] }) } : item.json;
        const body = { message: item.path, content: utf8b64(JSON.stringify(json, null, 1)) };
        if (sha) body.sha = sha;
        const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
        if (res.ok || res.status === 422) { S.outbox = S.outbox.filter((x) => x.path !== item.path); S.lastSend = new Date().toISOString(); save(); }
        else break;
      }
    } catch (e) { /* нет сети или GitHub недоступен: попробуем позже */ }
    flushing = false;
  }
  setInterval(() => { if (C) flushOutbox(); }, 5 * 60000);
  window.addEventListener('online', () => { if (C) flushOutbox(); });

  // истории для «послушать» (режим «не хочу»): длинные тексты из уроков чтения
  const stories = () => C.lessons.filter((l) => skillOf(l).track === 'reading').flatMap((l) => l.steps).map((t) => t.text).filter((x) => x && x.length > 160);

  function startMini(choice) {
    let steps = [];
    if (choice === 'story') steps = [{ type: 'listen', text: pick(stories()) }];
    if (choice === 'riddle') {
      const pool = C.lessons.filter((l) => skillOf(l).track === 'logic').flatMap((l) => l.steps).filter((t) => t.type === 'choice');
      steps = [Object.assign({}, pick(pool))];
    }
    if (choice === 'words') {
      const known = Object.keys(S.words).filter((id) => C.wordById[id]);
      const ids = shuffle(known.length >= 3 ? known : C.words.map((w) => w.id)).slice(0, 3);
      steps = ids.map((id) => { const w = C.wordById[id]; const others = shuffle(C.words.filter((x) => x.id !== id)).slice(0, 2);
        return { type: 'choice', q: `Что значит «${w.word}»?`, pic: w.pic, options: shuffle([{ t: w.simple, ok: true }, ...others.map((o) => ({ t: o.simple, err: 'word_meaning' }))]), reviewWord: S.words[id] ? id : null }; });
    }
    P = { mode: 'mini', lesson: { id: 'mini-' + choice, title: 'Самое лёгкое' }, lang: 'ru', steps, i: 0, t0: Date.now(), wrongs: 0, hints: 0, results: [] };
    newTask();
  }

  // ---------- каркас экрана ----------
  function shell(active, inner) {
    const nav = [['today', '☀️', 'Сегодня'], ['map', '🗺️', 'Карта'], ['skills', '🌳', 'Навыки'], ['homework', '📷', 'Домашка']];
    return `<header class="top">
        <div class="brand">${Chars.html('nika', 'happy', 'sm')}<span>Учимся с Никой</span></div>
        <div class="grow"></div>
        <button class="iconbtn ${S.set.syll ? 'on' : ''}" data-act="syll" title="Показывать слоги цветом">сло·ги</button>
        <a class="iconbtn ghost" href="#/parent" title="Для мамы" aria-label="Для мамы">⚙️</a>
      </header>
      <main>${inner}</main>
      <nav class="nav">${nav.map(([id, i, t]) => `<a href="#/${id}" class="${active === id ? 'on' : ''}"><span class="i">${i}</span>${t}</a>`).join('')}</nav>`;
  }
  function lessonCard(l, tag, tagCls) {
    const s = skillOf(l), t = track(s.track);
    return `<button class="task-card" data-go="#/lesson/${l.id}">
      <div class="pic" style="background:${t.color}">${esc(l.pic || t.emoji)}</div>
      <div><span class="tag ${tagCls || ''}">${esc(tag)}</span><div class="t">${esc(l.title)}</div><div class="m">${esc(t.title)} · ${lvl(s.id) ? LV[lvl(s.id)] : '🌱'} ${esc(s.title)}</div></div>
      <div class="go">➜</div></button>`;
  }

  // ---------- экраны ----------
  function viewToday() {
    const d = today(), mode = modeFor(d), M = modeInfo(mode);
    closeDayIfNeeded();
    const dy = S.days[d];
    const note = dayNote(d);
    const chip = `<span class="tag">${M.emoji} ${esc(M.title)}${note ? ' · ' + esc(note) : ''}</span>`;
    const bubble = (who, mood, text, tag) => `<div class="hello"><div class="duo">${Chars.html('nika', who === 'nika' ? mood : 'happy')}${Chars.html('luna', who === 'luna' ? mood : 'happy', 'md')}</div>
      <div class="bubble">${tag ? `<div class="tag">${esc(tag)}</div>` : ''}<div>${text}</div></div></div>`;
    const momNote = S.parent.comment ? `<div class="card" style="margin-bottom:16px"><div class="tag yellow">Записка от мамы</div><div>${rich(S.parent.comment)}</div></div>` : '';

    // выходной и день отдыха: ничего обязательного
    if (mode === 'off' || mode === 'weekend') {
      let h = chip + bubble('nika', 'happy', `Привет, ${esc(S.name)}! ${esc(M.about)}`) + momNote;
      h += '<h2>Если хочется</h2><div class="tiles">';
      for (const [tid, e, t] of [['create', '🎨', 'Создать'], ['book', '📚', 'Моя книга'], ['english', '🎧', 'English'], ['logic', '🧩', 'Загадка'], ['story', '👂', 'Послушать историю']]) {
        h += `<button class="tile" style="background:${track(tid === 'book' || tid === 'story' ? 'reading' : tid).color}" data-tile="${tid}"><span class="e">${e}</span>${t}</button>`;
      }
      return shell('today', h + '</div>');
    }

    // ещё не начали
    if (!dy || !dy.started) {
      return shell('today', `${chip}${bubble('nika', 'happy', `Привет, ${esc(S.name)}! ${esc(M.about)} Когда будешь готова, начинай рабочее время.`)}${momNote}
        <div class="card" style="text-align:center;padding:30px"><button class="btn green" style="font-size:26px;min-height:84px;padding:20px 40px" data-act="startday">▶ Начинаем рабочее время</button>
        <p class="sub" style="margin-top:16px">${M.minutes} минут. Ника, Луна и мама тоже работают.</p></div>
        <div class="pfoot"><button class="btn soft small" data-go="#/nowant">Сегодня не хочу</button></div>`);
    }

    // самочувствие
    if (!dy.energy) {
      const hi = dy.by === 'kira' ? 'Ты начала сама. Это и есть рабочее время.' : 'Рабочее время началось.';
      return shell('today', `${chip}${bubble('nika', 'proud', `${hi} Как ты сейчас?`)}
        <div class="tiles" style="max-width:640px">
          <button class="tile" style="background:var(--green-l)" data-energy="ok"><span class="e">😊</span>Бодрая</button>
          <button class="tile" style="background:var(--sun-l)" data-energy="meh"><span class="e">😐</span>Так себе</button>
          <button class="tile" style="background:var(--peach-l)" data-energy="tired"><span class="e">😴</span>Устала</button></div>`);
    }

    // конец дня
    if (dy.end) {
      const done = dy.steps.filter((x) => x.done && x.kind !== 'break').length;
      const extraBtns = !dy.extraLesson ? `<h2>Хочешь ещё одну?</h2><p class="sub">Только если правда хочется. Можно и закончить.</p><div class="tiles">
          ${[['reading', '📖', 'История'], ['math', '🔢', 'Числа'], ['english', '🎧', 'English'], ['logic', '🧩', 'Загадка'], ['create', '🎨', 'Создать']].map(([tid, e, t]) => `<button class="tile" style="background:${track(tid).color}" data-extra="${tid}"><span class="e">${e}</span>${t}</button>`).join('')}</div>` : '';
      const text = dy.refused ? 'Сегодня был лёгкий день. Это тоже нормально. Завтра продолжим.' : dy.timeUp ? 'Время вышло. На сегодня достаточно, остальное доделаем завтра.' : `На сегодня всё. Ты сделала шагов: ${done}. Отлично поработали.`;
      return shell('today', `${chip}<div class="done-screen"><div class="duo" style="justify-content:center">${Chars.html('nika', 'proud', 'jump')}${Chars.html('luna', 'happy', 'md jump')}</div>
        <h1>На сегодня всё</h1><p class="sub" style="font-size:22px">${esc(text)}</p></div>${extraBtns}`);
    }

    // план дня
    const nx = nextStepOf(dy);
    const mins = minutesSince(dy.started);
    const icon = { review: '🔁', break: '🧃', reading: '📖', math: '🔢', russian: '✏️', words: '🔤', english: '🎧', world: '🌍', logic: '🧩', create: '🎨', homework: '📷' };
    let list = dy.steps.map((x) => `<div class="skill" style="${x === nx ? 'outline:4px solid var(--violet)' : ''}"><div class="lv">${x.done ? '✅' : icon[x.track] || '•'}</div>
      <div><div>${esc(x.title)}</div><div class="st">${x.done ? 'готово' : x === nx ? 'сейчас' : 'потом'}</div></div></div>`).join('');
    let go = '';
    if (nx) {
      if (nx.kind === 'break') go = `<button class="btn green" data-act="breakdone">🧃 Отдохнула, дальше</button>`;
      else go = `<button class="btn" data-act="nextstep">Дальше: ${esc(nx.title)}</button>`;
    }
    const brk = nx && nx.kind === 'break' ? bubble('luna', 'happy', 'Перерыв. Встань, потянись, попей воды. 5 минут, и дальше.') : '';
    return shell('today', `${chip}<div class="row" style="justify-content:space-between"><h1>Сегодня</h1><span class="tag green">⏱ ${mins} из ${modeInfo(dy.mode).minutes} мин</span></div>
      ${brk}${momNote}<div style="max-width:720px">${list}</div><div class="pfoot">${go}</div>
      <div class="pfoot"><button class="btn soft small" data-go="#/nowant">Сегодня не хочу</button></div>`);
  }

  function viewNoWant() {
    const reasons = [['bored', 'Скучно'], ['tired', 'Устала'], ['hard', 'Трудно'], ['dunno', 'Не знаю']];
    const sel = (day() && day().refuseReason) || '';
    return shell('today', `<div class="hello"><div class="duo">${Chars.html('nika', 'support')}${Chars.html('luna', 'happy', 'md')}</div>
      <div class="bubble">Окей. Так бывает. Тогда выбери самое лёгкое, это займёт пару минут.</div></div>
      <p class="sub">Если хочешь, скажи почему (можно не выбирать):</p>
      <div class="row" style="margin-bottom:20px">${reasons.map(([k, t]) => `<button class="btn ${sel === k ? '' : 'soft'} small" data-reason="${k}">${t}</button>`).join('')}</div>
      <div class="tiles" style="max-width:720px">
        <button class="tile" style="background:var(--sky-l)" data-mini="story"><span class="e">👂</span>Послушать историю</button>
        <button class="tile" style="background:var(--sun-l)" data-mini="riddle"><span class="e">🧩</span>Одна загадка</button>
        <button class="tile" style="background:var(--peach-l)" data-mini="words"><span class="e">🔤</span>3 слова</button></div>
      <div class="pfoot"><button class="btn soft small" data-go="#/today">Назад</button></div>`);
  }

  function viewMap(tid) {
    tid = tid || 'reading';
    const t = track(tid);
    const ls = C.lessons.filter((l) => skillOf(l).track === tid);
    const firstNext = ls.find((l) => lessonOpen(l) && !isDone(l));
    const decos = { reading: ['🌳', '🍄', '🦆'], math: ['🌻', '🐝', '🏡'], words: ['📜', '🖋️', '🕯️'], english: ['🎈', '⛵', '🏰'], logic: ['🧩', '🔺', '🟡'], create: ['🎨', '🖌️', '🌈'] }[tid] || ['⭐'];
    let h = `<h1>Карта</h1><div class="tabs">${C.tracks.map((x) => `<button data-tab="${x.id}" class="${x.id === tid ? 'on' : ''}">${x.emoji} ${esc(x.title)}</button>`).join('')}</div>`;
    h += `<div class="world" style="background:${t.color}"><svg class="path"></svg>`;
    decos.forEach((d, i) => { h += `<span class="deco" style="top:${12 + i * 30}%;${i % 2 ? 'left' : 'right'}:3%">${d}</span>`; });
    ls.forEach((l) => {
      const open = lessonOpen(l), done = isDone(l), s = skillOf(l);
      const cls = !open ? 'locked' : (l === firstNext ? 'next' : '');
      const status = done ? `${LV[Math.max(1, lvl(s.id))]} ${LVT[Math.max(1, lvl(s.id))]}` : open ? (l.repeat ? 'можно много раз' : 'Начать') : '🔒 ' + lockReason(l);
      h += `<div class="node-row"><button class="node ${cls}" ${open ? `data-go="#/lesson/${l.id}"` : 'disabled'}>
        ${done ? '<span class="check">✓</span>' : ''}<div class="np">${esc(l.pic || t.emoji)}</div><div class="nt">${esc(l.title)}</div><div class="ns">${esc(status)}</div></button></div>`;
    });
    h += '</div>';
    return shell('map', h);
  }
  function drawPath() {
    const w = document.querySelector('.world'); if (!w) return;
    const svg = w.querySelector('svg.path'), box = w.getBoundingClientRect();
    const pts = [...w.querySelectorAll('.node')].map((n) => { const r = n.getBoundingClientRect(); return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2]; });
    let d = '';
    pts.forEach(([x, y], i) => {
      if (!i) { d = `M${x} ${y}`; return; }
      const [px, py] = pts[i - 1], my = (py + y) / 2;
      d += ` C${px} ${my} ${x} ${my} ${x} ${y}`;
    });
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.innerHTML = `<path d="${d}" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="26" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="rgba(124,92,255,.35)" stroke-width="5" stroke-dasharray="2 16" stroke-linecap="round"/>`;
  }

  function viewSkills() {
    let h = `<h1>Мои навыки</h1><p class="sub">Это не оценки. Это путь: от первого шага до «могу научить другого».</p>
      <div class="legend">${LV.slice(1).map((e, i) => `<span>${e} ${LVT[i + 1]}</span>`).join('')}</div>`;
    for (const t of C.tracks) {
      const ss = C.skills.filter((s) => s.track === t.id);
      if (!ss.length) continue;
      h += `<h2>${t.emoji} ${esc(t.title)}</h2>`;
      for (const s of ss) {
        const v = lvl(s.id), open = skillOpen(s), st = S.skills[s.id];
        const note = !open ? 'Откроется позже' : v === 0 ? 'Ещё не начинали' : st && st.box > 0 ? `Повторим ${fmtDay(st.due)}` : LVT[v];
        h += `<div class="skill"><div class="lv">${open ? (v ? LV[v] : '○') : '🔒'}</div><div><div>${esc(s.title)}</div><div class="st">${esc(note)}</div></div>
          <div class="dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${v >= i ? 'f' : ''}"></i>`).join('')}</div></div>`;
      }
    }
    return shell('skills', h);
  }

  function viewHomework() {
    const hw = C.lessons.filter((l) => skillOf(l).track === 'homework');
    let h = `<h1>Домашка</h1>
      <div class="hello">${Chars.html('luna', 'think', 'md')}<div class="bubble">Сфотографируй задание, которое не получается. Мама пришлёт его мне, и здесь появится разбор по шагам.</div></div>
      <div class="card"><div id="camwrap"><div class="row"><button class="btn" data-act="cam">📷 Включить камеру</button>
      <label class="btn soft">📁 Выбрать фото<input type="file" accept="image/*,.pdf" data-act="file" hidden></label></div></div></div>`;
    h += '<h2>Разборы от мамы</h2>';
    h += hw.length ? `<div class="cards">${hw.map((l) => lessonCard(l, isDone(l) ? 'Разобрали' : 'Новый разбор', isDone(l) ? 'green' : 'yellow')).join('')}</div>` : '<p class="sub">Пока разборов нет.</p>';
    return shell('homework', h);
  }
  function startCam() {
    const wrap = document.getElementById('camwrap');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { wrap.insertAdjacentHTML('beforeend', '<p class="sub">Камера здесь недоступна. Выбери фото файлом.</p>'); return; }
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } } }).then((stream) => {
      wrap.innerHTML = `<video class="cam" autoplay playsinline></video><div class="pfoot"><button class="btn green" data-act="snap">Сфотографировать</button></div>`;
      const v = wrap.querySelector('video'); v.srcObject = stream;
      cleanup = () => stream.getTracks().forEach((t) => t.stop());
    }).catch(() => wrap.insertAdjacentHTML('beforeend', '<p class="sub">Не получилось включить камеру. Разреши доступ к камере или выбери фото файлом.</p>'));
  }
  function snap() {
    const v = document.querySelector('video.cam'); if (!v) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    if (cleanup) { cleanup(); cleanup = null; }
    c.toBlob((b) => showShot(b), 'image/jpeg', 0.9);
  }
  // фото домашки сразу уходит в почтовый ящик (без хранения в браузере: большие картинки не влезут)
  async function uploadHomework(blob, path) {
    const r = C.config.reports; if (!r) return 'nobox';
    try {
      const img = await createImageBitmap(blob);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const b64 = c.toDataURL('image/jpeg', 0.78).split(',')[1];
      const res = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/contents/${path}`, { method: 'PUT',
        headers: { Authorization: 'Bearer ' + r.token, Accept: 'application/vnd.github+json' }, body: JSON.stringify({ message: path, content: b64 }) });
      return res.ok ? 'ok' : 'fail';
    } catch (e) { return 'fail'; }
  }
  function showShot(blob) {
    const url = URL.createObjectURL(blob);
    const d = new Date(), name = `домашка_${dstr(d)}_${z(d.getHours())}-${z(d.getMinutes())}.${blob.type === 'application/pdf' ? 'pdf' : 'jpg'}`;
    document.getElementById('camwrap').innerHTML = `${blob.type.startsWith('image') ? `<img class="shot" src="${url}" alt="Фото задания">` : '<p>Файл выбран.</p>'}
      <div class="pfoot"><a class="btn green" href="${url}" download="${name}">💾 Сохранить для мамы</a><button class="btn soft" data-go="#/homework">Переснять</button></div>
      <p class="sub" id="hwstatus">Отправляю маме…</p>`;
    if (blob.type.startsWith('image')) {
      uploadHomework(blob, `homework/${dstr(d)}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.jpg`).then((st) => {
        const el = document.getElementById('hwstatus'); if (!el) return;
        el.textContent = st === 'ok' ? '✅ Отправлено маме. Разбор появится здесь.' : 'Не получилось отправить. Нажми «Сохранить для мамы» и скажи маме, что в «Загрузках» новое задание.';
      });
    } else { const el = document.getElementById('hwstatus'); if (el) el.textContent = 'Нажми «Сохранить для мамы» и скажи маме, что в «Загрузках» новое задание.'; }
  }

  // ---------- онбординг ----------
  let pickedWorlds = [];
  function viewOnboarding(step) {
    if (step !== 2) {
      return `<main class="player"><div class="hello" style="margin-top:40px"><div class="duo">${Chars.html('nika', 'happy')}${Chars.html('luna', 'wow', 'md')}</div>
        <div class="bubble">Привет! Я совёнок Ника, а это лисичка Луна. Мы будем разбираться в историях, числах и словах вместе. Как тебя зовут?</div></div>
        <div class="card" style="text-align:center"><input class="field name-input" id="nm" maxlength="20" placeholder="Имя" value="${esc(S.name)}" autocomplete="off">
        <div class="pfoot"><button class="btn" data-act="name">Дальше</button></div></div></main>`;
    }
    return `<main class="player"><div class="hello" style="margin-top:20px">${Chars.html('nika', 'think')}
      <div class="bubble">${esc(S.name)}, выбери три мира, которые тебе интересны. Задания будут про них.</div></div>
      <div class="worlds">${C.worlds.map((w) => `<button class="tile ${pickedWorlds.includes(w.id) ? 'sel' : ''}" style="background:#fff" data-world="${w.id}"><span class="e">${w.emoji}</span>${esc(w.title)}</button>`).join('')}</div>
      <div class="pfoot"><button class="btn" data-act="worlds" ${pickedWorlds.length === 3 ? '' : 'disabled'}>Готово (${pickedWorlds.length} из 3)</button></div></main>`;
  }

  // ---------- проигрыватель урока ----------
  function expandSteps(steps) {
    const out = [];
    for (const st of steps) {
      if (st.type !== 'words') { out.push(st); continue; }
      for (const id of st.ids) {
        const w = C.wordById[id];
        out.push({ type: 'word', word: id });
        out.push({ type: 'choice', q: w.q.text, options: w.q.options, hints: [`Вспомни, что это: ${w.simple}`], wordRef: id });
      }
      const w0 = C.wordById[st.ids[0]];
      out.push({ type: 'say', q: `Выбери любое новое слово, например «${w0.word}», и скажи с ним своё предложение вслух.`, mood: 'happy' });
    }
    return out;
  }
  function startLesson(id) {
    const l = C.lessons.find((x) => x.id === id);
    if (!l || !lessonOpen(l)) { location.hash = '#/map/' + (l ? skillOf(l).track : ''); return; }
    const s = sk(l.skill); if (s.lvl < 1) { s.lvl = 1; save(); }
    P = { mode: 'lesson', lesson: l, lang: l.lang || 'ru', steps: expandSteps(l.steps), i: 0, t0: Date.now(), wrongs: 0, hints: 0, results: [] };
    newTask();
  }
  function startReview() {
    const steps = [];
    for (const s of dueSkills().slice(0, 2)) {
      const pool = lessonsOf(s.id).filter(isDone).flatMap((l) => l.steps.filter((t) => ['choice', 'input', 'order', 'match'].includes(t.type)).map((t) => Object.assign({}, t, { reviewSkill: s.id, lang: t.lang || l.lang })));
      steps.push(...shuffle(pool).slice(0, 2));
    }
    for (const id of shuffle(dueWords()).slice(0, 5)) {
      const w = C.wordById[id];
      const others = shuffle(C.words.filter((x) => x.id !== id)).slice(0, 2);
      steps.push({ type: 'choice', q: `Что значит «${w.word}»?`, pic: w.pic, options: shuffle([{ t: w.simple, ok: true }, ...others.map((o) => ({ t: o.simple, err: 'word_meaning' }))]), hints: [`Пример: ${w.example}`], reviewWord: id });
    }
    if (!steps.length) { location.hash = '#/today'; return; }
    P = { mode: 'review', lesson: { id: 'review', title: 'Вспомним' }, lang: 'ru', steps, i: 0, t0: Date.now(), wrongs: 0, hints: 0, results: [] };
    newTask();
  }
  function newTask() {
    const t = P.steps[P.i];
    P.ts = { wrongs: 0, hints: 0, revealed: false, solved: false, errs: [], listenedAfterWrong: false, input: '', wrongOpts: [], ans: [], pool: [], fixed: 0, matched: [], sel: null,
      help: [], audioOn: false, syllOn: false, menu: false, instr: null, wordHelp: null };
    if (t.type === 'order') P.ts.pool = shuffle(t.items.map((x, i) => ({ x, i })));
    if (t.type === 'choice') P.ts.opts = t.keepOrder ? t.options : shuffle(t.options);
    if (t.type === 'match') { P.ts.left = shuffle(t.pairs.map((p, i) => ({ x: p[0], i }))); P.ts.right = shuffle(t.pairs.map((p, i) => ({ x: p[1], i }))); }
    renderPlayer();
    if (t.type === 'listen') setTimeout(() => speak(t.text, 'ru'), 400);
  }
  const isCheckable = (t) => ['choice', 'input', 'order', 'match'].includes(t.type);
  const tLang = (t) => t.lang || P.lang;

  function renderPlayer(feedback) {
    const t = P.steps[P.i], ts = P.ts, lang = tLang(t);
    const pct = Math.round((P.i / P.steps.length) * 100);
    const mood = ts.solved ? (ts.wrongs || ts.hints ? 'happy' : 'proud') : ts.wrongs > 0 || ts.hints > 0 ? 'support' : (t.mood || (t.type === 'info' || t.type === 'word' ? 'happy' : 'think'));
    const who = t.who || (P.i % 5 === 3 ? 'luna' : 'nika');
    let body = '';

    if (t.title) body += `<div class="tag">${esc(t.title)}</div>`;
    if (t.type === 'word') {
      const w = C.wordById[t.word];
      body += `<div class="card wordcard"><div class="tag">Новое слово</div>${w.img ? `<img class="pic-img" src="${esc(src(w.img))}" alt="">` : `<div class="p">${esc(w.pic)}</div>`}
        <div class="w">${rich(w.word)} ${ts.audioOn ? sayBtn(w.word) : ''}</div><div class="d">${rich(w.simple)}</div>
        <div class="ex">${rich(w.example)} ${ts.audioOn ? sayBtn(w.example) : ''}</div></div>`;
    } else if (t.type === 'listen') {
      body += `<div class="tag">Послушай</div><div class="reading">${sayBtn(t.text, 'ru', 'say')}${rich(t.text)}</div>`;
    } else {
      if (t.q) body += `<p class="q">${rich(t.q, t.qLang)} ${ts.audioOn ? sayBtn(t.q, t.qLang || 'ru') : ''}</p>`;
      if (t.text) body += `<div class="reading">${ts.audioOn ? sayBtn(t.text, lang, 'say') : ''}${rich(t.text, lang)}</div>`;
      if (t.img) body += `<img class="pic-img" src="${esc(src(t.img))}" alt="">`;
      if (t.pic) body += `<div class="pic-big">${esc(t.pic)}</div>`;
      if (t.audio) body += `<p>${sayBtn(t.audio, lang, 'big')} <span class="listen muted">Нажми и послушай</span></p>`;
    }

    if (t.type === 'choice') {
      const emoji = ts.opts.every((o) => !/[A-Za-zА-Яа-яЁё0-9]/.test(o.t));
      body += `<div class="opts ${emoji ? 'emoji' : ''}">${ts.opts.map((o, i) => {
        const cls = ts.solved && o.ok ? 'ok' : ts.wrongOpts.includes(i) ? 'no' : (ts.revealed && o.ok ? 'hint' : '');
        return `<button class="opt ${cls}" data-opt="${i}" ${ts.solved || ts.wrongOpts.includes(i) ? 'disabled' : ''}>${rich(o.t, lang)}</button>`;
      }).join('')}</div>`;
    }
    if (t.type === 'input') {
      body += `<div class="answer-box ${ts.solved ? 'ok' : ''}" id="ansbox">${esc(ts.input) || '&nbsp;'}</div>`;
      if (!ts.solved) body += `<div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<button data-key="${n}">${n}</button>`).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="btn soft small" data-key="del">⌫ Стереть</button></div>`;
    }
    if (t.type === 'order') {
      body += `<div class="chips ans">${ts.ans.map((c, k) => `<button class="chip ${k < ts.fixed ? 'fixed' : ''}" data-back="${k}" ${k < ts.fixed || ts.solved ? 'disabled' : ''}>${rich(c.x, lang)}</button>`).join('') || '<span class="muted small">Нажимай на карточки по порядку</span>'}</div>
        <div class="chips">${ts.pool.map((c, k) => `<button class="chip" data-put="${k}">${rich(c.x, lang)}</button>`).join('')}</div>`;
    }
    if (t.type === 'match') {
      const col = (arr, side) => arr.map((c) => {
        const k = ts.matched.indexOf(c.i), sel = ts.sel && ts.sel.side === side && ts.sel.i === c.i;
        const pc = k >= 0 ? PAIR_COLORS[k % PAIR_COLORS.length] : null; // у каждой найденной пары свой цвет
        return `<button class="opt ${k >= 0 ? 'paired' : sel ? 'sel' : ''}" ${pc ? `style="background:${pc[0]};border-color:${pc[1]}"` : ''} data-m="${side}:${c.i}" ${k >= 0 ? 'disabled' : ''}>${rich(c.x, lang)}</button>`;
      }).join('');
      body += `<div class="match"><div class="col">${col(ts.left, 'L')}</div><div class="col">${col(ts.right, 'R')}</div></div>`;
    }

    // лестница подсказок
    const hints = (t.hints && t.hints.length ? t.hints : GENERIC_HINTS);
    for (let k = 0; k < ts.hints && k < hints.length; k++) {
      body += `<div class="hintbox"><b>💡 ${HINT_LABELS[k] || 'Подсказка'}:</b><span>${rich(hints[k])}</span></div>`;
    }
    if (ts.revealed) body += `<div class="hintbox"><b>🙋 Дальше вместе:</b><span>Это правда трудная задача. Позови маму, вы разберёте её вместе. Или пропусти пока, мы к ней вернёмся.</span></div>`;
    if (ts.instr) body += `<div class="hintbox"><b>🤔 Что делать:</b><span>${rich(ts.instr)}</span></div>`;
    if (ts.wordHelp) body += ts.wordHelp.length ? ts.wordHelp.map((w) => `<div class="hintbox"><b>${esc(w.pic)} ${rich(w.word)}:</b><span>${rich(w.simple)}</span></div>`).join('')
      : `<div class="hintbox"><b>🔤 Слово:</b><span>Найди непонятное слово и посмотри на слова рядом с ним. Если не выходит, спроси маму, что оно значит.</span></div>`;
    if (ts.menu) {
      const opts = [];
      if (!ts.audioOn) opts.push(['reading', '👀', 'Не могу прочитать']);
      opts.push(['word', '🔤', 'Не понимаю слово']);
      opts.push(['instruction', '🤔', 'Не понимаю, что делать']);
      if (isCheckable(t) && !ts.solved && !ts.revealed) opts.push(['solve', '🧩', 'Не знаю, как решить']);
      body += `<div class="card" style="margin-top:16px"><div class="tag yellow">Что трудно?</div><div class="tiles">${opts.map(([k, e, txt]) => `<button class="tile" style="background:var(--sun-l)" data-help="${k}"><span class="e">${e}</span>${txt}</button>`).join('')}</div></div>`;
    }

    let foot = '';
    const helpBtn = `<button class="btn yellow ${isCheckable(t) ? '' : 'small'}" data-act="helpmenu">💡 Мне трудно</button>`;
    if (t.type === 'info' || t.type === 'word') foot = `${helpBtn}<button class="btn" data-act="next">Дальше</button>`;
    else if (t.type === 'say') foot = `${helpBtn}<button class="btn green" data-act="next">${esc(t.done || 'Готово')}</button>`;
    else if (t.type === 'listen') foot = `<button class="btn green" data-act="next">Дослушала</button>`;
    else if (!ts.solved) {
      foot += ts.revealed ? `<button class="btn soft" data-act="skip">Пропустить пока</button>` : helpBtn;
      if (t.type === 'input') foot += `<button class="btn" data-act="check" ${ts.input ? '' : 'disabled'}>Проверить</button>`;
      if (t.type === 'order') foot += `<button class="btn" data-act="check" ${ts.pool.length ? 'disabled' : ''}>Проверить</button>`;
    }

    app.innerHTML = `<div class="ptop"><button class="iconbtn" data-act="exit" aria-label="Выйти">✕</button>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <button class="iconbtn ${S.set.syll ? 'on' : ''}" data-act="syll">сло·ги</button></div>
      <main class="player"><div class="stage">${Chars.html(who, mood, ts.solved && !ts.wrongs ? 'jump' : '')}<div class="body">${body}</div></div>
      <div class="pfoot">${foot}</div></main>${feedback || ''}`;
  }
  function answerText(t) {
    if (t.type === 'choice') return t.options.find((o) => o.ok).t;
    if (t.type === 'input') return String(Array.isArray(t.answer) ? t.answer[0] : t.answer);
    if (t.type === 'order') return t.items.join(' → ');
    if (t.type === 'match') return t.pairs.map((p) => `${p[0]}: ${p[1]}`).join('; ');
    return '';
  }

  const PAIR_COLORS = [['#DDF7EA', '#2FBF7F'], ['#FFE9DC', '#FF9A5B'], ['#DDF1FF', '#4AA8E8'], ['#FFF4C9', '#E0A800'], ['#FFE3EE', '#F06A9B'], ['#EDE7FF', '#7C5CFF']];
  const PRAISE_CLEAN = ['Верно.', 'Точно.', 'Да, так и есть.', 'Правильно, и без подсказок.', 'В точку.'];
  const PRAISE_RETRY = ['Получилось со второй попытки. Так и учатся.', 'Ты не сдалась и нашла.', 'Да! Ошибка помогла найти правильный путь.'];
  const PRAISE_HINT = ['Подсказка помогла, и ты справилась.', 'Разобрались по шагам. Получилось.'];
  const WRONG = ['Почти. Давай посмотрим ещё раз.', 'Не совсем. Прочитай ещё раз, медленно.', 'Хм, не то. Попробуй другой вариант.'];

  function wrong(err) {
    const ts = P.ts; ts.wrongs++; P.wrongs++;
    if (err) ts.errs.push(err);
    const auto = ts.wrongs >= 2 && ts.hints === 0;
    if (auto) ts.hints = 1, P.hints++;
    renderPlayer(`<div class="feedback soft"><div class="in">${Chars.html('nika', 'support', 'sm')}<div class="msg">${esc(pick(WRONG))}${auto ? '<div class="why">Я открыла подсказку ниже.</div>' : ''}</div></div></div>`);
    const fb = document.querySelector('.feedback'); setTimeout(() => fb && fb.remove(), 1700);
  }
  function solved() {
    const t = P.steps[P.i], ts = P.ts; ts.solved = true;
    P.results.push({ t: Date.now(), lesson: P.lesson.id, skill: P.mode === 'lesson' ? P.lesson.skill : t.reviewSkill || null, word: t.wordRef || t.reviewWord || null, step: P.i,
      wrongs: ts.wrongs, hints: ts.hints, revealed: ts.revealed, cond: ts.listenedAfterWrong, errs: ts.errs, review: P.mode === 'review', help: ts.help, audio: ts.audioOn });
    const msg = ts.revealed || ts.hints ? pick(PRAISE_HINT) : ts.wrongs ? pick(PRAISE_RETRY) : pick(PRAISE_CLEAN);
    renderPlayer(`<div class="feedback"><div class="in">${Chars.html('nika', 'proud', 'sm')}<div class="msg">${esc(msg)}${t.why ? `<div class="why">${rich(t.why)}</div>` : ''}</div>
      <button class="btn green" data-act="next" autofocus>Дальше</button></div></div>`);
    const b = document.querySelector('.feedback .btn'); if (b) b.focus();
  }
  function nextStep() {
    const t = P.steps[P.i];
    if (!isCheckable(t) && P.ts.help.length) P.results.push({ t: Date.now(), lesson: P.lesson.id, skill: P.mode === 'lesson' ? P.lesson.skill : null, step: P.i, info: true, help: P.ts.help });
    if (P.i < P.steps.length - 1) { P.i++; newTask(); return; }
    finish();
  }
  function finish() {
    const r = P.results; const ms = Date.now() - P.t0;
    S.log.push(...r); if (S.log.length > 3000) S.log = S.log.slice(-3000);
    S.sessions.push({ d: today(), id: P.lesson.id, ms });
    let lines = '';
    if (P.mode === 'lesson') {
      const l = P.lesson, s = sk(l.skill), before = lvl(l.skill);
      const checked = r.length || 1, bad = r.filter((x) => x.revealed || x.wrongs > 1).length;
      const good = bad <= Math.floor(checked / 3) && P.hints <= Math.max(2, Math.floor(checked / 2));
      s.lvl = Math.max(s.lvl, good ? 3 : 2);
      const prev = S.lessons[l.id] || { times: 0 };
      S.lessons[l.id] = { done: true, at: today(), times: prev.times + 1, wrongs: P.wrongs, hints: P.hints };
      const allDone = lessonsOf(l.skill).filter((x) => !x.repeat).every(isDone);
      if (allDone && s.box === 0 && !l.repeat) { s.box = 1; s.due = addDays(BOX_DAYS[1]); }
      for (const st of l.steps) if (st.type === 'words') for (const id of st.ids) if (!S.words[id]) S.words[id] = { box: 1, due: addDays(1) };
      const after = lvl(l.skill);
      lines = `<div class="lvchange">${esc(C.skillById[l.skill].title)}: <span class="big">${LV[Math.max(1, before)]}</span> ➜ <span class="big">${LV[after]}</span></div>
        <p class="sub">${esc(LVT[after])}${s.box ? ` · вспомним ${fmtDay(s.due)}` : ''}</p>`;
    } else {
      const bySkill = {};
      for (const x of r) {
        if (x.word) { const w = S.words[x.word]; const ok = !x.wrongs && !x.hints; w.box = ok ? Math.min(4, w.box + 1) : 1; w.due = addDays(BOX_DAYS[w.box]); }
        if (x.skill) bySkill[x.skill] = (bySkill[x.skill] !== false) && !x.wrongs && !x.hints;
      }
      for (const [id, ok] of Object.entries(bySkill)) {
        const s = sk(id);
        if (ok) { s.box = Math.min(4, s.box + 1); if (s.box >= 3) s.lvl = Math.max(s.lvl, 4); if (s.box >= 4) s.lvl = 5; }
        else { s.box = 1; s.lvl = Math.max(2, Math.min(s.lvl, 3)); }
        s.due = addDays(BOX_DAYS[s.box]);
      }
      lines = `<p class="sub">Повторение помогает помнить долго. Следующее будет, когда придёт время.</p>`;
    }
    save();
    if (P.mode === 'lesson') markStepDone('lesson', P.lesson.id);
    if (P.mode === 'review') markStepDone('review');
    if (P.mode === 'mini') { // «не хочу»: самое лёгкое сделано, день закрыт без упрёка
      const d = today(), dy = S.days[d] || (S.days[d] = { mode: modeFor(d), started: Date.now(), by: 'kira' });
      dy.refused = { reason: dy.refuseReason || null, choice: P.lesson.id.replace('mini-', '') };
      dy.started = dy.started || Date.now(); dy.by = dy.by || 'kira';
      dy.steps = dy.steps || []; dy.energy = dy.energy || 'refused'; dy.end = dy.end || Date.now();
      save(); enqueueReport(d); P = null;
      if (location.hash === '#/today') route(); else location.hash = '#/today';
      return;
    }
    const dy = day(), inDay = dy && dy.started && !dy.end && dy.steps;
    const nxt = P.mode === 'lesson' && !inDay ? nextInTrack(skillOf(P.lesson).track) : null;
    P = null;
    app.innerHTML = `<main class="player done-screen"><div class="duo">${Chars.html('nika', 'proud', 'jump')}${Chars.html('luna', 'happy', 'md jump')}</div>
      <h1>Готово!</h1>${lines}
      <div class="pfoot"><button class="btn" data-go="#/today">${inDay ? 'Дальше' : 'На главную'}</button>${nxt ? `<button class="btn soft" data-go="#/lesson/${nxt.id}">Ещё: ${esc(nxt.title)}</button>` : ''}</div></main>`;
  }

  function onPlayerClick(el) {
    const t = P.steps[P.i], ts = P.ts;
    if (el.dataset.opt != null && t.type === 'choice' && !ts.solved) {
      const i = +el.dataset.opt, o = ts.opts[i];
      if (o.ok) solved(); else { ts.wrongOpts.push(i); wrong(o.err); }
      return;
    }
    if (el.dataset.key != null && t.type === 'input' && !ts.solved) {
      const k = el.dataset.key;
      ts.input = k === 'del' ? ts.input.slice(0, -1) : (ts.input + k).slice(0, 4);
      renderPlayer(); return;
    }
    if (el.dataset.put != null) { ts.ans.push(ts.pool.splice(+el.dataset.put, 1)[0]); renderPlayer(); return; }
    if (el.dataset.back != null) { ts.pool.push(ts.ans.splice(+el.dataset.back, 1)[0]); renderPlayer(); return; }
    if (el.dataset.m) {
      const [side, i] = el.dataset.m.split(':'); const n = +i;
      if (!ts.sel || ts.sel.side === side) { ts.sel = { side, i: n }; renderPlayer(); return; }
      if (ts.sel.i === n) { ts.matched.push(n); ts.sel = null; if (ts.matched.length === t.pairs.length) solved(); else renderPlayer(); }
      else { ts.sel = null; wrong(t.err || 'match'); }
      return;
    }
    const act = el.dataset.act;
    if (act === 'check') {
      if (t.type === 'input') {
        const ok = (Array.isArray(t.answer) ? t.answer : [t.answer]).map(String).includes(ts.input);
        if (ok) solved(); else { const e = (t.errs && t.errs[ts.input]) || 'calc'; ts.input = ''; wrong(e); }
      }
      if (t.type === 'order') {
        let k = 0; while (k < ts.ans.length && ts.ans[k].i === k) k++;
        if (k === t.items.length) solved();
        else { ts.fixed = k; ts.pool.push(...ts.ans.splice(k)); ts.pool = shuffle(ts.pool); wrong(t.err || 'order'); }
      }
      return;
    }
    if (act === 'helpmenu') { ts.menu = !ts.menu; renderPlayer(); return; }
    if (el.dataset.help) {
      const h = el.dataset.help; ts.menu = false; if (!ts.help.includes(h)) ts.help.push(h);
      if (h === 'reading') { ts.audioOn = true; ts.syllOn = true; }
      if (h === 'instruction') ts.instr = t.simple || INSTR[t.type] || INSTR.choice;
      if (h === 'word') {
        const hay = [t.q, t.text, ...(t.options || []).map((o) => o.t)].filter(Boolean).join(' ').toLowerCase();
        ts.wordHelp = C.words.filter((w) => hay.includes(w.word.toLowerCase().slice(0, Math.max(4, w.word.length - 2)))).slice(0, 2);
      }
      if (h === 'solve') {
        const hints = t.hints && t.hints.length ? t.hints : GENERIC_HINTS;
        if (ts.hints < hints.length) { ts.hints++; P.hints++; } else ts.revealed = true;
        if (ts.hints < hints.length || !ts.revealed) ts.menu = false;
      }
      renderPlayer(); return;
    }
    if (act === 'next') { nextStep(); return; }
    if (act === 'skip') {
      P.results.push({ t: Date.now(), lesson: P.lesson.id, skill: P.mode === 'lesson' ? P.lesson.skill : t.reviewSkill || null, step: P.i,
        wrongs: ts.wrongs, hints: ts.hints, revealed: true, skipped: true, errs: ts.errs, help: ts.help, audio: ts.audioOn });
      nextStep(); return;
    }
    if (act === 'exit') { if (confirm('Выйти из урока? Прогресс этого урока не сохранится.')) { P = null; location.hash = '#/today'; } return; }
  }

  // ---------- родительский режим ----------
  let pinBuf = '', parentOk = false;
  function viewParent() {
    if (!parentOk) {
      const creating = !S.parent.pin;
      return shell('', `<div class="card" style="max-width:520px;margin:30px auto;text-align:center">
        <h1>Для мамы</h1><p class="sub">${creating ? 'Придумайте PIN из 4 цифр. Он защищает от случайного входа.' : 'Введите PIN.'}</p>
        <div class="pin">${[0, 1, 2, 3].map((i) => `<i class="${pinBuf.length > i ? 'f' : ''}"></i>`).join('')}</div>
        <div class="keypad" style="justify-content:center">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => `<button data-pin="${n}">${n}</button>`).join('')}</div>
        <div class="pfoot"><button class="btn soft small" data-pin="del">⌫</button><button class="btn soft small" data-go="#/today">Назад</button></div></div>`);
    }
    const week = addDays(-6);
    const sess = S.sessions.filter((s) => s.d >= week);
    const mins = Math.round(sess.reduce((a, s) => a + s.ms, 0) / 60000);
    const errName = (c) => (C.errors[c] || c);
    let h = `<h1>Кабинет мамы</h1><p class="sub">${esc(S.name)} · миры: ${S.worlds.map((w) => (C.worlds.find((x) => x.id === w) || {}).title).filter(Boolean).join(', ') || 'не выбраны'}</p>
      <div class="cards"><div class="card"><div class="tag">7 дней</div><div style="font-size:34px;font-weight:900">Занятий: ${sess.length} · минут: ${mins}</div>
      <div class="muted small">Уроков пройдено всего: ${Object.values(S.lessons).filter((x) => x.done).length} из ${C.lessons.length}</div></div>
      <div class="card"><div class="tag">Повторение</div><div style="font-size:34px;font-weight:900">К повтору: ${dueSkills().length + dueWords().length}</div>
      <div class="muted small">Слов в работе: ${Object.keys(S.words).length}</div></div></div>`;

    // режимы и отчёты
    const d = today(), dy = S.days[d];
    const mopts = (sel) => Object.entries(C.modes.modes).map(([k, m]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${m.emoji} ${m.title}</option>`).join('');
    h += `<h2>Сегодня и режимы</h2><div class="card">
      <div class="row"><b>Сегодня, ${WD[new Date().getDay()]} ${d}:</b><select data-daymode="${d}">${mopts(modeFor(d))}</select>${S.calendar[d] ? '<span class="muted small">выбрано вручную</span>' : ''}</div>
      <div class="row" style="margin-top:12px">Период с <input type="date" id="rfrom" class="field" style="width:auto"> по <input type="date" id="rto" class="field" style="width:auto">
        <select id="rmode">${mopts('weekend')}</select><button class="btn small" data-act="setrange">Применить</button><button class="btn soft small" data-act="clearrange">Сбросить ручные режимы</button></div>
      <label class="row small" style="margin-top:12px"><input type="checkbox" data-act="reminded" ${(dy && dy.by === 'mom') || S.parent.remindOn === d ? 'checked' : ''}> Сегодня рабочее время началось после моего напоминания</label>
      <p class="muted small">По умолчанию: Пн-Пт школьный день, Сб отдыхаем, Вс полная учёба. 22.10 отдыхаем (день рождения).</p>
      ${dy && dy.missing && dy.missing.length ? `<p class="small">⚠️ Для этих предметов пока нет уроков, они пропущены: ${esc(dy.missing.join(', '))}.</p>` : ''}
      <div class="row" style="margin-top:8px"><button class="btn small" data-act="sendreport">📤 Отправить отчёт за сегодня</button><button class="btn soft small" data-act="savereport">💾 Сохранить отчёт файлом</button></div>
      <p class="muted small">В очереди: ${S.outbox.length}. Последняя отправка: ${S.lastSend ? new Date(S.lastSend).toLocaleString('ru-RU') : 'ещё не было'}. ${C.config.reports ? '' : 'Почтовый ящик пока не подключён: отчёты копятся здесь и уйдут, когда подключим.'}</p></div>`;

    // где трудно
    h += '<h2>Где трудно</h2><div class="card"><table class="ptable"><tr><th>Навык</th><th>Заданий</th><th>Чисто</th><th>Случайная</th><th>Не поняла условие</th><th>Слишком сложно</th><th>Повторяющиеся ошибки</th></tr>';
    for (const s of C.skills) {
      const rs = S.log.filter((x) => x.skill === s.id); if (!rs.length) continue;
      const clean = rs.filter((x) => !x.wrongs && !x.hints).length;
      const rnd = rs.filter((x) => x.wrongs === 1 && !x.hints && !x.revealed).length;
      const cond = rs.filter((x) => x.cond && !x.revealed).length;
      const hard = rs.filter((x) => x.revealed).length;
      const cnt = {}; rs.flatMap((x) => x.errs || []).forEach((e) => (cnt[e] = (cnt[e] || 0) + 1));
      const rule = Object.entries(cnt).filter(([, n]) => n >= 2).map(([e, n]) => `${errName(e)} ×${n}`).join('; ');
      h += `<tr><td>${esc(s.title)}</td><td>${rs.length}</td><td>${clean}</td><td>${rnd}</td><td>${cond}</td><td>${hard}</td><td>${esc(rule || 'нет')}</td></tr>`;
    }
    h += '</table><p class="muted small">Случайная: одна ошибка, потом верно. Не поняла условие: после прослушивания ответила верно. Слишком сложно: дошла до показа ответа. Повторяющиеся: одна и та же ошибка 2 раза и больше, значит не понято правило.</p></div>';

    // навыки
    h += `<h2>Навыки</h2><div class="card"><label class="row small"><input type="checkbox" data-act="unlock" ${S.parent.unlockAll ? 'checked' : ''}> Открыть все уроки без очереди</label>
      <table class="ptable"><tr><th>Навык</th><th>Уровень</th><th>Ручная отметка</th><th>Повтор</th><th>По программе</th></tr>`;
    for (const s of C.skills) {
      const st = S.skills[s.id] || {};
      h += `<tr><td>${{ red: '🔴', yellow: '🟡', green: '🟢' }[s.priority]} ${esc(s.title)}</td><td>${lvl(s.id) ? LV[lvl(s.id)] + ' ' + LVT[lvl(s.id)] : skillOpen(s) ? '○ не начинали' : '🔒 закрыто'}</td>
        <td><select data-manual="${s.id}"><option value="">авто</option>${LVT.map((t, i) => `<option value="${i}" ${st.manual === i ? 'selected' : ''}>${LV[i]} ${t}</option>`).join('')}</select></td>
        <td>${st.box ? fmtDay(st.due) : ''}</td><td class="muted small">${esc(s.frp || '')}</td></tr>`;
    }
    h += '</table></div>';

    h += `<h2>Записка на главный экран</h2><div class="card"><textarea class="field" id="pcomment" placeholder="Её покажет Ника на главном экране">${esc(S.parent.comment)}</textarea>
      <div class="row" style="margin-top:10px"><button class="btn small" data-act="savecomment">Сохранить</button><button class="btn soft small" data-act="clearcomment">Убрать</button></div></div>
      <h2>Заметки для себя</h2><div class="card"><textarea class="field" id="pnotes">${esc(S.parent.notes)}</textarea>
      <div class="row" style="margin-top:10px"><button class="btn small" data-act="savenotes">Сохранить</button></div></div>
      <h2>Данные</h2><div class="card"><div class="row">
      <button class="btn small" data-act="export">⬇️ Выгрузить прогресс</button>
      <label class="btn soft small">⬆️ Загрузить<input type="file" accept=".json" data-act="import" hidden></label>
      <button class="btn soft small" data-act="newpin">Сменить PIN</button>
      <button class="btn soft small" data-act="forgetkey">Забыть пароль школы на этом компьютере</button>
      <button class="btn soft small" data-act="reset">Сбросить всё</button></div>
      <p class="muted small">Прогресс хранится только в этом браузере. Выгрузку можно передать в Claude: он разберёт ошибки и добавит уроки.</p></div>`;
    return shell('', h);
  }

  // ---------- роутер ----------
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    const [, page, arg] = (location.hash || '#/today').split('/');
    if (!S.name || !S.worlds.length) {
      if (page !== 'onboarding') { location.hash = '#/onboarding/' + (S.name ? 2 : 1); return; }
      app.innerHTML = viewOnboarding(+arg); return;
    }
    if (page !== 'parent') parentOk = false;
    if (page === 'lesson') { startLesson(arg); return; }
    if (page === 'review') { startReview(); return; }
    P = null;
    const views = { today: viewToday, nowant: viewNoWant, map: () => viewMap(arg), skills: viewSkills, homework: viewHomework, parent: viewParent };
    app.innerHTML = (views[page] || viewToday)();
    window.scrollTo(0, 0);
    if (!views[page] || page === 'today') { const iv = setInterval(() => { if (!P) app.innerHTML = viewToday(); }, 60000); cleanup = () => clearInterval(iv); }
    if (page === 'map') requestAnimationFrame(drawPath);
  }

  // ---------- события ----------
  app.addEventListener('click', (e) => {
    const el = e.target.closest('button, a, [data-go]'); if (!el) return;
    if (el.dataset.say != null) { speak(el.dataset.say, el.dataset.lang); return; }
    if (el.dataset.go) { location.hash = el.dataset.go; return; }
    if (el.dataset.act === 'syll') { S.set.syll = !S.set.syll; save(); P ? renderPlayer() : route(); return; }
    if (P) { onPlayerClick(el); return; }
    if (el.dataset.tab) { location.hash = '#/map/' + el.dataset.tab; return; }
    const d = today();
    if (el.dataset.act === 'startday') {
      S.days[d] = Object.assign(S.days[d] || {}, { mode: modeFor(d), started: Date.now(), by: S.parent.remindOn === d ? 'mom' : 'kira' });
      save(); route(); return;
    }
    if (el.dataset.energy) {
      const dy = S.days[d]; dy.energy = el.dataset.energy;
      const b = buildDay(dy.mode, dy.energy); dy.steps = b.steps; dy.missing = b.missing; save(); route(); return;
    }
    if (el.dataset.act === 'nextstep') {
      const nx = nextStepOf(S.days[d]); if (!nx) { route(); return; }
      location.hash = nx.kind === 'review' ? '#/review' : '#/lesson/' + nx.lesson; return;
    }
    if (el.dataset.act === 'breakdone') { const nx = nextStepOf(S.days[d]); if (nx) { nx.done = true; nx.at = Date.now(); } save(); route(); return; }
    if (el.dataset.extra) {
      const l = nextInTrack(el.dataset.extra); if (!l) { location.hash = '#/map/' + el.dataset.extra; return; }
      S.days[d].extraLesson = l.id; save(); location.hash = '#/lesson/' + l.id; return;
    }
    if (el.dataset.reason) { S.days[d] = S.days[d] || { mode: modeFor(d) }; S.days[d].refuseReason = el.dataset.reason; save(); app.innerHTML = viewNoWant(); return; }
    if (el.dataset.mini) { startMini(el.dataset.mini); return; }
    if (el.dataset.tile) {
      const tid = el.dataset.tile;
      if (tid === 'story') { P = { mode: 'free', lesson: { id: 'story', title: 'История' }, lang: 'ru', steps: [{ type: 'listen', text: pick(stories()) }], i: 0, t0: Date.now(), wrongs: 0, hints: 0, results: [] }; newTask(); return; }
      const l = tid === 'book' ? C.lessons.find((x) => x.id === 'rd-book') : nextInTrack(tid);
      location.hash = l ? '#/lesson/' + l.id : '#/map/' + tid; return;
    }
    if (el.dataset.world) {
      const id = el.dataset.world;
      pickedWorlds = pickedWorlds.includes(id) ? pickedWorlds.filter((x) => x !== id) : pickedWorlds.length < 3 ? [...pickedWorlds, id] : pickedWorlds;
      app.innerHTML = viewOnboarding(2); return;
    }
    if (el.dataset.pin != null) {
      const k = el.dataset.pin;
      pinBuf = k === 'del' ? pinBuf.slice(0, -1) : (pinBuf + k).slice(0, 4);
      if (pinBuf.length === 4) {
        if (!S.parent.pin) { S.parent.pin = pinBuf; save(); parentOk = true; }
        else if (S.parent.pin === pinBuf) parentOk = true;
        else { pinBuf = ''; app.innerHTML = viewParent(); document.querySelector('.pin').classList.add('shake'); return; }
        pinBuf = '';
      }
      app.innerHTML = viewParent(); return;
    }
    const act = el.dataset.act;
    if (act === 'name') { const v = document.getElementById('nm').value.trim(); if (!v) return; S.name = v; save(); location.hash = '#/onboarding/2'; return; }
    if (act === 'worlds') { S.worlds = pickedWorlds.slice(); save(); location.hash = '#/today'; return; }
    if (act === 'cam') { startCam(); return; }
    if (act === 'snap') { snap(); return; }
    if (act === 'savecomment') { S.parent.comment = document.getElementById('pcomment').value.trim(); save(); el.textContent = 'Сохранено ✓'; return; }
    if (act === 'clearcomment') { S.parent.comment = ''; save(); route(); return; }
    if (act === 'savenotes') { S.parent.notes = document.getElementById('pnotes').value; save(); el.textContent = 'Сохранено ✓'; return; }
    if (act === 'export') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `nika-progress-${today()}.json`; a.click(); return;
    }
    if (act === 'setrange') {
      const a = document.getElementById('rfrom').value, b = document.getElementById('rto').value, m = document.getElementById('rmode').value;
      if (!a || !b || a > b) { alert('Выберите даты «с» и «по».'); return; }
      for (let x = new Date(a + 'T12:00'); dstr(x) <= b; x.setDate(x.getDate() + 1)) S.calendar[dstr(x)] = m;
      save(); app.innerHTML = viewParent(); return;
    }
    if (act === 'clearrange') { S.calendar = {}; save(); app.innerHTML = viewParent(); return; }
    if (act === 'sendreport') { enqueueReport(today()); el.textContent = 'Поставлено в отправку ✓'; return; }
    if (act === 'savereport') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(dayReport(today()), null, 1)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `kira-report-${today()}.json`; a.click(); return;
    }
    if (act === 'forgetkey') { localStorage.removeItem(KEYSTORE); location.reload(); return; }
    if (act === 'newpin') { S.parent.pin = ''; save(); parentOk = false; route(); return; }
    if (act === 'reset') { if (confirm('Стереть весь прогресс? Сначала лучше выгрузить его.')) { localStorage.removeItem(KEY); S = blankState(); parentOk = false; location.hash = '#/onboarding/1'; } return; }
  });
  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.manual) { const s = sk(el.dataset.manual); s.manual = el.value === '' ? undefined : +el.value; save(); app.innerHTML = viewParent(); return; }
    if (el.dataset.act === 'unlock') { S.parent.unlockAll = el.checked; save(); return; }
    if (el.dataset.daymode) { const d = el.dataset.daymode; S.calendar[d] = el.value; const dy = S.days[d]; if (dy && !dy.started) dy.mode = el.value; save(); app.innerHTML = viewParent(); return; }
    if (el.dataset.act === 'reminded') { const d = today(); S.parent.remindOn = el.checked ? d : ''; if (S.days[d]) S.days[d].by = el.checked ? 'mom' : 'kira'; save(); return; }
    if (el.dataset.act === 'file' && el.files[0]) { showShot(el.files[0]); return; }
    if (el.dataset.act === 'import' && el.files[0]) {
      el.files[0].text().then((txt) => { const s = JSON.parse(txt); if (s.v !== 1) throw 0; S = Object.assign(blankState(), s); save(); alert('Прогресс загружен.'); route(); })
        .catch(() => alert('Это не файл прогресса.'));
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { if (e.key === 'Enter' && e.target.id === 'nm') document.querySelector('[data-act="name"]').click(); return; }
    if (!P) return;
    const t = P.steps[P.i];
    if (t.type === 'input' && !P.ts.solved) {
      if (/^[0-9]$/.test(e.key)) { onPlayerClick({ dataset: { key: e.key } }); return; }
      if (e.key === 'Backspace') { onPlayerClick({ dataset: { key: 'del' } }); return; }
      if (e.key === 'Enter' && P.ts.input) { onPlayerClick({ dataset: { act: 'check' } }); return; }
    }
    if (e.key === 'Enter' && (P.ts.solved || t.type === 'info' || t.type === 'word' || t.type === 'say')) { e.preventDefault(); nextStep(); }
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => { if (document.querySelector('.world')) drawPath(); });

  // ---------- старт ----------
  S = load();
  document.body.classList.toggle('syll', S.set.syll);
  unlock().then(loadContent).then((c) => { C = c; pickedWorlds = S.worlds.slice(); route(); flushOutbox(); })
    .catch((e) => { app.innerHTML = `<div class="boot">Не получилось загрузить уроки. Проверь интернет и обнови страницу.<br><small>${esc(e.message)}</small></div>`; });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
