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
  function save() { MCACHE = new Map(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.error('Прогресс не сохранился', e); } }

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
    const [program, words, errors, modes, calendar, worldsData, readwords, catalog, week, lines, roadmap, tutor, ...rest] = await Promise.all([get(idx.program), get(idx.words), get(idx.errors), get(idx.modes), get(idx.calendar), get(idx.worlds), get(idx.readwords), get(idx.catalog), get(idx.week), get(idx.lines), get(idx.roadmap), get(idx.tutor), ...idx.curricula.map(get), ...idx.lessons.map(get)]);
    const curricula = rest.slice(0, idx.curricula.length), files = rest.slice(idx.curricula.length);
    const lessons = files.flatMap((f) => f.lessons);
    const skills = program.skills;
    const skillById = Object.fromEntries(skills.map((s) => [s.id, s]));
    const wordById = Object.fromEntries(words.words.map((w) => [w.id, w]));
    return { program, tracks: program.tracks, worlds: program.worlds, skills, skillById, lessons, words: words.words, wordById, errors, modes, calendar: calendar.days,
      config: (BUNDLE && BUNDLE.files['config.json']) || {}, worldsData, readwords, catalog, week, lines: lines.events, roadmap, tutorCfg: tutor, curricula };
  }
  const track = (id) => C.tracks.find((t) => t.id === id) || { id, title: id, emoji: '•', color: '#fff' };
  const skillOf = (l) => C.skillById[l.skill];

  // ---------- навыки и доступ ----------
  const sk = (id) => (S.skills[id] = S.skills[id] || { lvl: 0, box: 0, due: '' });
  const lvl = (id) => { const s = S.skills[id]; if (s && s.manual != null) return s.manual; return mastery(id).lvl; };
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
    const ls = C.lessons.filter((l) => skillOf(l).track === tid && !l.control);
    return ls.find((l) => !l.repeat && lessonOpen(l) && !isDone(l)) || ls.find((l) => l.repeat && lessonOpen(l)) || null;
  }
  function mainPick() {
    const pref = ['reading', 'math', 'reading', 'math', 'reading', 'words', 'math'][new Date().getDay()];
    const cand = C.lessons.filter((l) => !l.repeat && !l.control && lessonOpen(l) && !isDone(l) && ['reading', 'math', 'words'].includes(skillOf(l).track));
    cand.sort((a, b) => (PRIO[skillOf(a).priority] - PRIO[skillOf(b).priority]) ||
      ((skillOf(a).track === pref ? 0 : 1) - (skillOf(b).track === pref ? 0 : 1)) || (C.lessons.indexOf(a) - C.lessons.indexOf(b)));
    return cand[0] || null;
  }
  const dueSkills = () => C.skills.filter((s) => S.skills[s.id] && S.skills[s.id].box > 0 && S.skills[s.id].due <= today());
  const dueWords = () => Object.keys(S.words).filter((id) => C.wordById[id] && S.words[id].box > 0 && S.words[id].due <= today());

  // ---------- освоение навыка: 4 измерения (умение, самостоятельность, сложность, устойчивость) ----------
  let MCACHE = new Map();
  const attemptsOf = (id) => S.log.filter((x) => x.skill === id && !x.info);
  const isOk = (x) => !x.revealed && !x.skipped && (x.wrongs || 0) <= 1;
  const isIndep = (x) => isOk(x) && !x.wrongs && !x.hints && !(x.help || []).length;
  function maxDiff(id) {
    const ls = lessonsOf(id).filter((l) => !l.repeat).length;
    return Math.max(1, GEN[id] ? 3 : ls);
  }
  function mastery(id) {
    if (MCACHE.has(id)) return MCACHE.get(id);
    const all = attemptsOf(id), a = all.slice(-6), n = all.length;
    let m = { n, lvl: 0, enough: n >= 4 };
    if (n) {
      const acc = a.filter(isOk).length / a.length, indep = a.filter(isIndep).length / a.length;
      const byD = {}; all.slice(-24).forEach((x) => (byD[x.d || 1] = byD[x.d || 1] || []).push(x));
      let diff = 0; for (const [d, xs] of Object.entries(byD)) { const last = xs.slice(-5); if (last.filter(isOk).length / last.length >= 0.8) diff = Math.max(diff, +d); }
      const stab = (S.skills[id] && S.skills[id].clean) || 0;
      const transfer = new Set(all.filter(isIndep).map((x) => x.fmt || 'choice')).size >= 2;
      let lvl = 1;
      if (acc >= 0.5) lvl = 2;
      if (acc >= 0.8 && diff >= Math.min(2, maxDiff(id))) lvl = 3;
      if (lvl >= 3 && indep >= 0.7 && stab >= 1) lvl = 4;
      if (lvl >= 4 && stab >= 2 && transfer) lvl = 5;
      m = { n, acc, indep, diff, stab, lvl, enough: n >= 4, transfer };
    }
    MCACHE.set(id, m); return m;
  }
  const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
  function masteryVerdict(id) {
    const m = mastery(id);
    if (!m.n) return 'ещё не начинали';
    if (!m.enough) return 'пока недостаточно данных';
    if (m.acc < 0.5) return 'трудно: нужна практика полегче и проверка базы';
    if (m.acc < 0.8) return 'учится, нужна ещё практика';
    if (m.indep < 0.7) return 'получается, но чаще с помощью';
    if (m.stab < 1) return 'получается сама, ждём проверку повторением';
    return 'устойчиво';
  }

  // ---------- генераторы заданий (математика и техника чтения) ----------
  const rnd = (n) => Math.floor(Math.random() * n);
  const rint = (a, b) => a + rnd(b - a + 1);
  const off1 = (ans, extra) => Object.assign({ [ans - 1]: 'off_by_one', [ans + 1]: 'off_by_one' }, extra || {});
  const plural = (n, f) => { const a = n % 10, b = n % 100; return f[a === 1 && b !== 11 ? 0 : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? 1 : 2]; };
  function hero() {
    const H = C.worldsData.heroes; const ids = (S.worlds || []).filter((w) => H[w]);
    return Math.random() < 0.6 && ids.length ? H[pick(ids)] : H.default; // миры не больше чем в половине с небольшим
  }
  const GEN = {
    'm.compose10': (d) => {
      const n = d >= 2 ? rint(6, 9) : 10, a = rint(1, n - 1);
      return { type: 'input', q: `${n} = ${a} + …`, answer: String(n - a), errs: off1(n - a), hints: [`От ${a} досчитай до ${n}. Сколько шагов?`] };
    },
    'm.teens': (d) => {
      const u = rint(1, 9);
      return Math.random() < 0.5 ? { type: 'input', q: `10 + ${u} = …`, answer: String(10 + u), errs: off1(10 + u, { [u + '1']: 'reversed_digits' }), hints: ['Один десяток и ещё немного. Как называется это число?'] }
        : { type: 'input', q: `${10 + u} = 10 + …`, answer: String(u), errs: off1(u), hints: [`${10 + u}: десяток и сколько единиц?`] };
    },
    'm.add_tens': (d) => {
      const a = rint(d >= 2 ? 5 : 7, 9), b = rint(11 - a, 9), s = a + b, need = 10 - a;
      return { type: 'input', q: `${a} + ${b} = …`, answer: String(s), errs: off1(s, { [Math.abs(a - b)]: 'wrong_operation' }),
        hints: [`До 10 от ${a} не хватает ${need}.`, `${b} это ${need} и ${b - need}. ${a} + ${need} = 10, потом 10 + ${b - need}.`] };
    },
    'm.sub_tens': (d) => {
      const m = rint(11, d >= 2 ? 18 : 15), s = rint(m - 9, 9) , r = m - s, first = m - 10;
      if (s <= first) return GEN['m.sub_tens'](d);
      return { type: 'input', q: `${m} − ${s} = …`, answer: String(r), errs: off1(r, { [m + s]: 'wrong_operation' }),
        hints: [`Сначала отними ${first}, получится 10.`, `Осталось отнять ещё ${s - first}: 10 − ${s - first}.`] };
    },
    'm.problems': (d) => {
      const H = hero(), kind = pick(d >= 2 ? ['add', 'sub', 'cmp'] : ['add', 'sub']);
      const a = rint(d >= 2 ? 8 : 4, d >= 2 ? 15 : 9), b = rint(2, Math.min(9, a - 1));
      if (kind === 'add') return { type: 'input', q: 'Сколько стало?', text: `${H.hero}: было ${a} ${plural(a, H.item)}. Потом добавилось ещё ${b}.`, answer: String(a + b),
        errs: off1(a + b, { [a - b]: 'wrong_operation' }), hints: ['Стало больше или меньше? Значит, плюс или минус?', `${a} + ${b}`] };
      if (kind === 'sub') return { type: 'input', q: 'Сколько осталось?', text: `${H.hero}: было ${a} ${plural(a, H.item)}. ${b} ${plural(b, H.item)} отдали друзьям.`, answer: String(a - b),
        errs: off1(a - b, { [a + b]: 'wrong_operation' }), hints: ['Осталось больше или меньше, чем было?', `${a} − ${b}`] };
      return { type: 'input', q: 'На сколько больше?', text: `У ${H.hero === 'Ника' ? 'Ники' : 'героя'} ${a} ${plural(a, H.item)}, у Луны ${b}. На сколько больше у первого?`, answer: String(a - b),
        errs: off1(a - b, { [a + b]: 'wrong_operation' }), hints: ['«На сколько больше» это из большего вычесть меньшее.', `${a} − ${b}`] };
    },
    'm.add100': (d) => {
      const kind = pick(d >= 2 ? ['t+', 't-', 'u+', 'u-'] : ['t+', 't-']);
      const a = rint(2, 8) * 10 + rint(1, 9), t = rint(1, 4) * 10, u = rint(1, 9);
      if (kind === 't+') return { type: 'input', q: `${a} + ${t} = …`, answer: String(a + t), errs: { [a + t - 10]: 'off_by_one', [a + t + 10]: 'off_by_one', [a + u]: 'digit_confusion' }, hints: ['Десятки складываем с десятками, единицы остаются.', `${a}: ${Math.floor(a / 10)} дес. и ${a % 10} ед. Прибавь ${t / 10} дес.`] };
      if (kind === 't-') return { type: 'input', q: `${a} − ${t} = …`, answer: String(a - t), errs: { [a - t - 10]: 'off_by_one', [a - t + 10]: 'off_by_one' }, hints: ['Десятки вычитаем из десятков, единицы остаются.', `${a}: ${Math.floor(a / 10)} дес. и ${a % 10} ед. Убери ${t / 10} дес.`] };
      if (kind === 'u+') { const x = rint(2, 8) * 10 + rint(1, 5); return { type: 'input', q: `${x} + ${u} = …`, answer: String(x + u), errs: off1(x + u), hints: [`Сначала добери до круглого числа: ${x} + ${10 - (x % 10)} = ${x + 10 - (x % 10)}.`, 'Потом прибавь остаток.'] }; }
      const x = rint(3, 9) * 10 + rint(0, 4); return { type: 'input', q: `${x} − ${u} = …`, answer: String(x - u), errs: off1(x - u), hints: [`Сначала отними единицы от числа: ${x % 10 ? x % 10 : 'иди через десяток'}.`, 'Круглое число отнять проще.'] };
    },
    'ru.syll': (d) => {
      const W = C.readwords.words.filter(([w]) => d === 1 ? w.length <= 5 : w.length >= 5);
      const [w, p] = pick(W); const n = (w.match(/[аеёиоуыэюя]/gi) || []).length;
      return { type: 'choice', q: `Сколько слогов в слове «${w}»? Хлопни ладошами.`, pic: p, options: shuffle([n - 1, n, n + 1].filter((x) => x >= 1).map((x) => x === n ? { t: String(x), ok: true } : { t: String(x), err: 'off_by_one' })), hints: ['Слогов столько, сколько гласных звуков.', 'Хлопай на каждый гласный: а, о, у, ы, э, я, ё, ю, е, и.'] };
    },
    'rd.tech': (d) => {
      const W = C.readwords.words.filter(([w]) => (d === 1 ? w.length <= 4 : d === 2 ? w.length >= 4 && w.length <= 6 : w.length >= 6));
      const [w, p] = pick(W);
      const same = C.readwords.words.filter(([x]) => x !== w && x.slice(0, 2) === w.slice(0, 2)); // ловушка: то же начало
      const other = shuffle(C.readwords.words.filter(([x]) => x !== w && !same.some(([y]) => y === x)));
      const ds = [...shuffle(same).slice(0, 1).map(([, pp]) => ({ t: pp, err: 'guess_start' })), ...other.slice(0, 3).map(([, pp]) => ({ t: pp, err: 'decoding' }))].slice(0, 2);
      return { type: 'choice', q: 'Прочитай слово и найди картинку.', text: w, options: shuffle([{ t: p, ok: true }, ...ds]), keepOrder: true,
        hints: ['Читай по слогам до самого конца слова, не угадывай по началу.'], big: true };
    }
  };
  function practiceSteps(id, n) {
    const m = mastery(id), md = maxDiff(id);
    let d = !m.n ? 1 : m.acc < 0.5 ? Math.max(1, (m.diff || 1) - 1) : Math.min(md, (m.diff || 1) + (m.acc >= 0.8 ? 1 : 0));
    return Array.from({ length: n }, () => Object.assign(GEN[id](d), { d, gen: true }));
  }
  function startPractice(id) {
    const s = C.skillById[id]; if (!s || !GEN[id]) { location.hash = '#/today'; return; }
    P = { mode: 'practice', lesson: { id: 'practice-' + id, title: 'Тренировка: ' + s.title, skill: id }, skill: id, lang: 'ru', steps: practiceSteps(id, 5), i: 0, t0: Date.now(), wrongs: 0, hints: 0, results: [] };
    newTask();
  }

  // ---------- динамика чтения: скорость (приблизительно) и контрольные истории ----------
  function readSpeed(fromDay, toDay) {
    const xs = S.log.filter((x) => x.rw && x.rms).filter((x) => { const d = dstr(new Date(x.t)); return d >= fromDay && d <= toDay; });
    if (xs.length < 3) return { n: xs.length, wpm: null };
    const w = xs.reduce((a, x) => a + x.rw, 0), ms = xs.reduce((a, x) => a + x.rms, 0);
    return { n: xs.length, wpm: Math.round(w / (ms / 60000)) };
  }
  function controlRuns() {
    const byLesson = {};
    for (const x of S.log) if (x.lesson && x.lesson.startsWith('ctl-') && !x.info) { const k = x.lesson + '|' + dstr(new Date(x.t)); (byLesson[k] = byLesson[k] || []).push(x); }
    return Object.entries(byLesson).map(([k, xs]) => ({ lesson: k.split('|')[0], date: k.split('|')[1], n: xs.length, ok: xs.filter(isOk).length, indep: xs.filter(isIndep).length, help: xs.filter((x) => (x.help || []).length).length,
      wpm: (() => { const r = xs.filter((x) => x.rw); return r.length ? Math.round(r.reduce((a, x) => a + x.rw, 0) / (r.reduce((a, x) => a + x.rms, 0) / 60000)) : null; })() }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  // покрытие карты программы: какая доля обязательных результатов закрыта навыками на уровне «получается»
  function coverage(cur) {
    return cur.items.map((it) => {
      const ss = it.skills.filter((id) => C.skillById[id]);
      const lv = ss.map((id) => lvl(id)); const started = ss.some((id) => mastery(id).n);
      const state = !ss.length ? 'none' : lv.every((v) => v >= 3) ? 'ok' : started ? 'partial' : 'todo';
      return Object.assign({}, it, { state });
    });
  }
  // ---------- самостоятельность за 14 дней ----------
  function selfStats() {
    const since = addDays(-13), ds = Object.entries(S.days).filter(([d, x]) => d >= since && x.started);
    const n = ds.length, by = ds.filter(([, x]) => x.by === 'kira').length, fin = ds.filter(([, x]) => x.end && !x.refused && !x.timeUp).length;
    const ref = ds.filter(([, x]) => x.refused).length, extra = ds.filter(([, x]) => x.extraLesson).length;
    const mins = ds.map(([, x]) => Math.round(activeMs(x) / 60000)).filter(Boolean);
    const logs = S.log.filter((x) => dstr(new Date(x.t)) >= since && !x.info);
    const helpAsk = logs.filter((x) => (x.help || []).length).length, hard = logs.filter((x) => x.revealed || x.wrongs >= 2).length;
    return { days: n, started_self: by, finished: fin, refused: ref, extra, avg_min: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : 0,
      help_asked: helpAsk, hard_tasks: hard };
  }

  // ---------- учебный день: режимы, рабочее время, план, отчёты ----------
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const intl = () => S.set.program === 'intl';
  const modeFor = (d) => S.calendar[d] || (C.calendar[d] && C.calendar[d].mode) || (intl() ? C.modes.week_intl : C.modes.week)[String(new Date(d + 'T12:00').getDay())] || 'school';
  const modeInfo = (m) => { const x = C.modes.modes[m] || C.modes.modes.school; return intl() && x.plan_intl ? Object.assign({}, x, { plan: x.plan_intl, minutes: x.minutes_intl || x.minutes }) : x; };
  const dayNote = (d) => (C.calendar[d] && C.calendar[d].note) || '';
  const day = () => S.days[today()];
  // Активное время: растёт только когда Кира что-то делает (нажимает, пишет, говорит).
  // Если страница просто открыта, время не идёт: между двумя действиями засчитывается не больше 90 секунд.
  const IDLE_CAP = 90000;
  let lastSave = 0;
  function touch() {
    const dy = S && S.days && S.days[today()]; if (!dy || !dy.started || dy.end) return;
    const now = Date.now();
    if (dy.active == null) { dy.active = 0; dy.lastAct = now; }
    dy.active += Math.min(now - (dy.lastAct || now), IDLE_CAP); dy.lastAct = now;
    if (now - lastSave > 20000) { lastSave = now; save(); }
  }
  const activeMs = (dy) => (dy && dy.active != null ? dy.active : 0);
  const activeMin = (dy) => Math.floor(activeMs(dy) / 60000);
  ['click', 'keydown', 'input', 'touchstart'].forEach((ev) => document.addEventListener(ev, touch, true));

  // ---------- адаптивный подбор: что Кире делать дальше и почему ----------
  const weekFocus = () => (S.parent.focus && S.parent.focus.length ? S.parent.focus : (C.week && C.week.focus) || []);
  const recent = (days) => { const since = addDays(-days); return S.log.filter((x) => !x.info && dstr(new Date(x.t)) >= since); };
  function continueSkill(s, used, why) {
    const tid = s.track, m = mastery(s.id);
    const L = (l, w) => (l && !used.has(l.id) ? (used.add(l.id), { kind: 'lesson', lesson: l.id, title: l.title, track: tid, why: w, done: false }) : null);
    const Pr = (sk2, w) => (GEN[sk2.id] && !used.has('p:' + sk2.id) ? (used.add('p:' + sk2.id), { kind: 'practice', skill: sk2.id, title: 'Тренировка: ' + sk2.title, track: sk2.track, why: w, done: false }) : null);
    const own = lessonsOf(s.id).filter((x) => !x.repeat);
    if (m.enough && m.acc < 0.5) { // правило 2: трудно → база и полегче
      const dep = s.deps.map((d) => C.skillById[d]).find((d) => d && lvl(d.id) < 3);
      if (dep) return continueSkill(dep, used, `база для «${s.title}»: сначала укрепляем её`);
      return Pr(s, 'трудно: тренировка полегче') || L(own.filter(isDone).pop(), 'трудно: повторяем знакомый урок');
    }
    return L(own.find((l) => lessonOpen(l) && !isDone(l)), why || 'продолжаем тему') || Pr(s, why || 'закрепляем') || (m.lvl < 3 ? L(own.filter(isDone).pop(), why || 'закрепляем') : null);
  }
  function stepFor(tid, used) {
    const ss = C.skills.filter((s) => s.track === tid && skillOpen(s)).sort((a, b) => PRIO[a.priority] - PRIO[b.priority]);
    for (const s of ss.filter((x) => weekFocus().includes(x.id))) { const st = continueSkill(s, used, 'фокус недели'); if (st) return st; }
    for (const s of ss) { const m = mastery(s.id); if (m.n && m.lvl < 3) { const st = continueSkill(s, used); if (st) return st; } }
    const mastered = C.lessons.filter((x) => !x.repeat && !x.control && skillOf(x).track === tid && lessonOpen(x) && !isDone(x) && lvl(skillOf(x).id) >= 4);
    if (mastered.length) logAdapt(`Пропущены уроки: ${[...new Set(mastered.map((x) => skillOf(x).title))].join('; ')}`, 'эти навыки уже освоены самостоятельно, идём дальше');
    const l = C.lessons.find((x) => !x.repeat && !x.control && skillOf(x).track === tid && lessonOpen(x) && !isDone(x) && !used.has(x.id) && lvl(skillOf(x).id) < 4);
    if (l) { used.add(l.id); return { kind: 'lesson', lesson: l.id, title: l.title, track: tid, why: 'новая тема', done: false }; }
    const weak = ss.filter((s) => GEN[s.id] && !used.has('p:' + s.id)).sort((a, b) => lvl(a.id) - lvl(b.id))[0];
    if (weak) { used.add('p:' + weak.id); return { kind: 'practice', skill: weak.id, title: 'Тренировка: ' + weak.title, track: tid, why: 'всё пройдено, держим форму', done: false }; }
    const rep = C.lessons.find((x) => x.repeat && !x.control && skillOf(x).track === tid && lessonOpen(x) && !used.has(x.id));
    if (rep) { used.add(rep.id); return { kind: 'lesson', lesson: rep.id, title: rep.title, track: tid, why: 'задание, которое можно делать много раз', done: false }; }
    return null;
  }
  function buildDay(mode, energy) {
    const steps = [], used = new Set(), missing = [], notes = [];
    const push = (st) => { if (st) steps.push(st); return !!st; };
    if (dueSkills().length || dueWords().length) steps.push({ kind: 'review', title: 'Вспомним', track: 'review', why: 'подошёл срок повторения', done: false });
    // контрольная история раз в две недели: сравниваем динамику (а не оцениваем)
    const ctlList = C.lessons.filter((l) => l.control);
    const lastCtl = Math.max(0, ...ctlList.map((l) => S.lessons[l.id] && S.lessons[l.id].at ? +new Date(S.lessons[l.id].at) : 0));
    const daysUsed = Object.values(S.days).filter((x) => x.started && x.steps && x.steps.length).length;
    if (ctlList.length && daysUsed >= 3 && mode !== 'weekend' && (!lastCtl || Date.now() - lastCtl > 13 * 864e5) && energy === 'ok' && loadFactor().delta >= 0) {
      const nxtC = ctlList.slice().sort((a, b) => ((S.lessons[a.id] || {}).times || 0) - ((S.lessons[b.id] || {}).times || 0))[0];
      used.add(nxtC.id); steps.push({ kind: 'lesson', lesson: nxtC.id, title: nxtC.title, track: 'reading', why: 'раз в две недели: сравниваем с прошлым разом, как растёт понимание', done: false });
    }
    // правило 4: часто просит прочитать за неё → техника чтения
    const r7 = recent(7), readHelp = r7.filter((x) => (x.help || []).includes('reading')).length;
    if (r7.length >= 8 && readHelp / r7.length > 0.3 && skillOpen(C.skillById['rd.tech'])) { used.add('p:rd.tech'); steps.push({ kind: 'practice', skill: 'rd.tech', title: 'Тренировка: читаю слово точно', track: 'reading', why: `часто просит прочитать за неё (${readHelp} из ${r7.length})`, done: false }); }
    // правило 3: не понимает условие задач → понимание предложения
    const cond = r7.filter((x) => x.skill === 'm.problems' && ((x.help || []).includes('instruction') || x.cond)).length;
    if (cond >= 2) { const s = C.skillById['rd.sentence']; push(continueSkill(s, used, 'в задачах трудно понять условие: тренируем понимание предложения')); }
    // правило 5: устала два дня подряд или отказ → меньше
    const tiredDays = [1, 2].filter((k) => { const x = S.days[addDays(-k)]; return x && (x.energy === 'tired' || x.refused); }).length;
    if (energy === 'tired') { if (steps.length < 1) push(stepFor('english', used) || stepFor('logic', used)); return { steps: steps.slice(0, 2), missing, notes: ['устала: только повторение и одно лёгкое'] }; }
    const plan = modeInfo(mode).plan;
    const pref = [['reading', 'math', 'russian'], ['math', 'reading', 'russian'], ['russian', 'reading', 'math']][new Date().getDay() % 3];
    for (const slot of plan) {
      if (slot === 'break' || slot === 'move') { if (steps.length && steps[steps.length - 1].kind !== 'break') steps.push({ kind: 'break', title: 'Разминка', track: 'break', move: pick(C.modes.moves || ['Встань, потянись, попей воды']), done: false }); continue; }
      if (slot === 'main') { pref.some((t) => push(stepFor(t, used))); continue; }
      const tid = slot === 'rotate' ? C.modes.rotate[Math.floor(Date.now() / 6048e5) % C.modes.rotate.length] : slot;
      if (!push(stepFor(tid, used))) missing.push(track(tid).title);
    }
    // правило 6: ей интересно → ветка интереса (если сама брала «ещё одну» по этому предмету 2 раза за 2 недели)
    const ext = {}; Object.entries(S.days).filter(([d]) => d >= addDays(-14)).forEach(([, x]) => { if (x.extraLesson) { const l = C.lessons.find((y) => y.id === x.extraLesson); if (l) ext[skillOf(l).track] = (ext[skillOf(l).track] || 0) + 1; } });
    const fav = Object.entries(ext).find(([, n]) => n >= 2);
    if (fav && mode === 'full') { const st = stepFor(fav[0], used); if (st) { st.why = 'ей интересно: сама выбирала это сверху'; steps.push(st); } }
    while (steps.length && steps[steps.length - 1].kind === 'break') steps.pop();
    // нагрузка по последним дням: легко → +1 шаг, трудно → -1 шаг
    const lf = loadFactor(), real = () => steps.filter((x) => x.kind !== 'break');
    if (lf.delta < 0 && real().length > 2) { const last = real().pop(); steps.splice(steps.lastIndexOf(last), 1); while (steps.length && steps[steps.length - 1].kind === 'break') steps.pop(); logAdapt('Нагрузка снижена на 1 шаг', lf.why); notes.push('нагрузка снижена'); }
    if (lf.delta > 0 && mode !== 'full' && energy === 'ok') { const add = stepFor(pref[0], used) || stepFor('logic', used); if (add) { add.why = 'добавлен 1 шаг: ' + lf.why; steps.push(add); logAdapt('Нагрузка увеличена на 1 шаг', lf.why); } }
    steps.filter((x) => x.why && /трудно|часто|база|интересно|условие|фокус|добавлен|две недели/.test(x.why)).forEach((x) => logAdapt(`${x.title}`, x.why));
    if (energy === 'meh' || tiredDays >= 2) { notes.push(energy === 'meh' ? 'так себе: без лишнего' : 'устала два дня подряд: объём меньше'); return { steps: steps.filter((x) => x.kind !== 'break').slice(0, 2), missing, notes }; }
    return { steps, missing, notes };
  }
  const nextStepOf = (dy) => dy.steps.find((x) => !x.done);
  function markStepDone(kind, lessonId) {
    const dy = day(); if (!dy || !dy.steps) return;
    const st = dy.steps.find((x) => !x.done && x.kind === kind && (kind === 'review' || x.lesson === lessonId || x.skill === lessonId));
    if (st) { st.done = true; st.at = Date.now(); }
    if (dy.extraLesson && dy.extraLesson === lessonId) { dy.extraDone = true; enqueueReport(today()); }
    save();
  }
  function closeDayIfNeeded() {
    const dy = day(); if (!dy || !dy.started || dy.end || !dy.steps) return;
    const allDone = dy.steps.every((x) => x.done);
    const cap = modeInfo(dy.mode).minutes;
    const timeUp = cap && activeMin(dy) >= cap && dy.steps.some((x) => x.done);
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
    const mins = Math.round(activeMs(dy) / 60000);
    return { v: 1, kind: 'daily', date: d, sent: new Date().toISOString(), mode: dy.mode || modeFor(d), started_by: dy.by || null, energy: dy.energy || null,
      minutes: mins, time_up: !!dy.timeUp, steps: (dy.steps || []).map((x) => ({ title: x.title, track: x.track, done: !!x.done, why: x.why || '' })), missing: dy.missing || [], notes: dy.notes || [],
      mastery: C.skills.filter((s) => mastery(s.id).n).map((s) => { const m = mastery(s.id); return { id: s.id, title: s.title, track: s.track, priority: s.priority, n: m.n, acc: m.acc, indep: m.indep, diff: m.diff, stab: m.stab, lvl: lvl(s.id), verdict: masteryVerdict(s.id) }; }),
      self: selfStats(), focus: weekFocus(), adapt: (S.adapt || []).filter((x) => x.d === d), read: readSpeed(d, d), control: controlRuns().filter((c) => c.date === d),
      tutor: (S.tutor || []).filter((x) => dstr(new Date(x.t)) === d),
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
      return shell('today', h + '</div>' + (momLinks() ? `<h2>От мамы</h2><div class="cards">${momLinks()}</div>` : ''));
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
        <h1>На сегодня всё</h1><p class="sub" style="font-size:22px">${esc(text)}</p></div>${extraBtns}${momLinks() ? `<h2>От мамы</h2><div class="cards">${momLinks()}</div>` : ''}`);
    }

    // план дня
    const nx = nextStepOf(dy);
    const mins = activeMin(dy);
    const icon = { review: '🔁', break: '🤸', explore: '🔭', code: '🤖', music: '🎵', feelings: '💛', reading: '📖', math: '🔢', russian: '✏️', words: '🔤', english: '🎧', world: '🌍', logic: '🧩', create: '🎨', homework: '📷' };
    let list = dy.steps.map((x) => `<div class="skill" style="${x === nx ? 'outline:4px solid var(--violet)' : ''}"><div class="lv">${x.done ? '✅' : icon[x.track] || '•'}</div>
      <div><div>${esc(x.title)}</div><div class="st">${x.done ? 'готово' : x === nx ? 'сейчас' : 'потом'}</div></div></div>`).join('');
    let go = '';
    if (nx) {
      if (nx.kind === 'break') go = `<button class="btn green" data-act="breakdone">🤸 Сделала, дальше</button>`;
      else go = `<button class="btn" data-act="nextstep">Дальше: ${esc(nx.title)}</button>`;
    }
    const brk = nx && nx.kind === 'break' ? bubble('luna', 'happy', `Разминка! ${esc(nx.move || 'Встань и потянись.')} Потом попей воды.`) : '';
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
    const hw = C.lessons.filter((l) => l.homework || skillOf(l).track === 'homework');
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
    const order = lessonsOf(l.skill).filter((x) => !x.repeat);
    P = { mode: 'lesson', lesson: l, lang: l.lang || 'ru', steps: expandSteps(l.steps), i: 0, t0: Date.now(), wrongs: 0, hints: 0, results: [], diff: l.d || Math.max(1, order.indexOf(l) + 1) };
    newTask();
  }
  function startReview() {
    const steps = [];
    for (const s of dueSkills().slice(0, 2)) {
      const order = lessonsOf(s.id).filter((x) => !x.repeat);
      const pool = lessonsOf(s.id).filter(isDone).flatMap((l) => l.steps.filter((t) => ['choice', 'input', 'order', 'match'].includes(t.type)).map((t) => Object.assign({}, t, { reviewSkill: s.id, lang: t.lang || l.lang, d: t.d || Math.max(1, order.indexOf(l) + 1) })));
      if (GEN[s.id]) pool.push(...practiceSteps(s.id, 2).map((t) => Object.assign(t, { reviewSkill: s.id }))); // новые числа, не заученные ответы
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
    if (P.a0 == null) P.a0 = activeMs(day());
    const t = P.steps[P.i];
    P.ts = { tFirst: 0, wrongs: 0, hints: 0, revealed: false, solved: false, errs: [], listenedAfterWrong: false, input: '', wrongOpts: [], ans: [], pool: [], fixed: 0, matched: [], sel: null,
      help: [], audioOn: false, syllOn: false, menu: false, instr: null, wordHelp: null, t0: Date.now() };
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
    const rc = ts.react;
    if (rc) body += `<div class="bubble" style="margin-bottom:14px"><div class="tag ${rc.who === 'luna' ? 'yellow' : ''}">${rc.who === 'luna' ? 'Луна' : 'Ника'}</div>${esc(rc.text)}</div>`;
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
      if (t.text) body += `<div class="reading" ${t.big ? 'style="font-size:56px;text-align:center;letter-spacing:.04em"' : ''}>${ts.audioOn ? sayBtn(t.text, lang, 'say') : ''}${rich(t.text, lang)}</div>`;
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
    body += tutorHtml();
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
      <main class="player"><div class="stage">${Chars.html(rc ? rc.who : who, rc ? rc.mood : mood, ts.solved && !ts.wrongs ? 'jump' : '')}<div class="body">${body}</div></div>
      <div class="pfoot">${foot}</div></main>${feedback || ''}`;
    clearTimeout(idleTimer);
    if (isCheckable(t) && !ts.solved && !ts.menu && !ts.idleShown) idleTimer = setTimeout(() => { if (P && P.ts === ts && !ts.solved) { ts.idleShown = true; ts.react = react('idle'); renderPlayer(); } }, 90000);
  }
  function answerText(t) {
    if (t.type === 'choice') return t.options.find((o) => o.ok).t;
    if (t.type === 'input') return String(Array.isArray(t.answer) ? t.answer[0] : t.answer);
    if (t.type === 'order') return t.items.join(' → ');
    if (t.type === 'match') return t.pairs.map((p) => `${p[0]}: ${p[1]}`).join('; ');
    return '';
  }

  // реакции Ники и Луны на поведение (не болтовня: одна реплика на событие)
  const react = (ev) => { const e = C.lines[ev]; return e ? { who: e.who, mood: e.mood, text: pick(e.lines) } : null; };
  let idleTimer = null;
  // скорость чтения: слов в минуту по времени до первого ответа; только когда читала сама и текст не короткий
  function readStat(t, ts) {
    const w = (t.text || '').trim().split(/\s+/).filter(Boolean).length;
    if (t.lang === 'en' || w < 12 || ts.audioOn || !ts.tFirst || t.big) return {};
    const ms = ts.tFirst - (ts.t0 || ts.tFirst); if (ms < 3000 || ms > 240000) return {};
    return { rw: w, rms: ms };
  }
  const PAIR_COLORS = [['#DDF7EA', '#2FBF7F'], ['#FFE9DC', '#FF9A5B'], ['#DDF1FF', '#4AA8E8'], ['#FFF4C9', '#E0A800'], ['#FFE3EE', '#F06A9B'], ['#EDE7FF', '#7C5CFF']];
  const PRAISE_CLEAN = ['Верно.', 'Точно.', 'Да, так и есть.', 'Правильно, и без подсказок.', 'В точку.'];
  const PRAISE_RETRY = ['Получилось со второй попытки. Так и учатся.', 'Ты не сдалась и нашла.', 'Да! Ошибка помогла найти правильный путь.'];
  const PRAISE_HINT = ['Подсказка помогла, и ты справилась.', 'Разобрались по шагам. Получилось.'];
  const WRONG = ['Почти. Давай посмотрим ещё раз.', 'Не совсем. Прочитай ещё раз, медленно.', 'Хм, не то. Попробуй другой вариант.'];

  function wrong(err) {
    const ts = P.ts; ts.wrongs++; P.wrongs++;
    if (err) ts.errs.push(err);
    const same = ts.errs.length >= 2 && ts.errs[ts.errs.length - 1] === ts.errs[ts.errs.length - 2];
    const auto = ts.wrongs >= 2 && ts.hints === 0 && !same;
    if (auto) ts.hints = 1, P.hints++;
    if (same) { ts.react = react('same_error_twice'); ts.menu = true; }
    renderPlayer(`<div class="feedback soft"><div class="in">${Chars.html('nika', 'support', 'sm')}<div class="msg">${esc(pick(WRONG))}${auto ? '<div class="why">Я открыла подсказку ниже.</div>' : ''}</div></div></div>`);
    const fb = document.querySelector('.feedback'); setTimeout(() => fb && fb.remove(), 1700);
  }
  function solved() {
    const t = P.steps[P.i], ts = P.ts; ts.solved = true;
    P.results.push({ t: Date.now(), lesson: P.lesson.id, skill: P.mode === 'lesson' || P.mode === 'practice' ? P.lesson.skill : t.reviewSkill || null, word: t.wordRef || t.reviewWord || null, step: P.i,
      wrongs: ts.wrongs, hints: ts.hints, revealed: ts.revealed, cond: ts.listenedAfterWrong, errs: ts.errs, review: P.mode === 'review', help: ts.help, audio: ts.audioOn,
      d: t.d || P.diff || 1, fmt: t.type, ms: Date.now() - (ts.t0 || Date.now()), gen: !!t.gen, ...readStat(t, ts) });
    const hardAlone = !ts.wrongs && !ts.hints && !ts.help.length && (t.d || P.diff || 1) >= 2;
    const rr = hardAlone ? react('hard_solved_alone') : ts.wrongs && !ts.hints && !ts.help.length ? react('fixed_after_error') : null;
    const msg = rr ? rr.text : ts.revealed || ts.hints ? pick(PRAISE_HINT) : ts.wrongs ? pick(PRAISE_RETRY) : pick(PRAISE_CLEAN);
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
    const r = P.results; const dy0 = day();
    const ms = dy0 && dy0.active != null && P.a0 != null ? Math.max(0, dy0.active - P.a0) : Math.min(Date.now() - P.t0, 20 * 60000); // активное время занятия
    const before = P.lesson.skill ? lvl(P.lesson.skill) : 0;
    S.log.push(...r); if (S.log.length > 3000) S.log = S.log.slice(-3000);
    MCACHE = new Map();
    S.sessions.push({ d: today(), id: P.lesson.id, ms });
    let lines = '';
    if (P.mode === 'lesson' || P.mode === 'practice') {
      const id = P.lesson.skill, s = sk(id);
      if (P.mode === 'lesson') {
        const l = P.lesson, prev = S.lessons[l.id] || { times: 0 };
        S.lessons[l.id] = { done: true, at: today(), times: prev.times + 1, wrongs: P.wrongs, hints: P.hints };
        for (const st of l.steps) if (st.type === 'words') for (const w of st.ids) if (!S.words[w]) S.words[w] = { box: 1, due: addDays(1) };
      }
      const after = lvl(id);
      if (after >= 3 && before < 3) { const m = mastery(id); if (m.n <= 8) logAdapt(`«${C.skillById[id].title}» освоена быстрее плана`, `верно ${pct(m.acc)} за ${m.n} заданий, без подсказок ${pct(m.indep)}`); }
      if (after >= 1 && after < 2 && mastery(id).enough && mastery(id).acc < 0.5) logAdapt(`По «${C.skillById[id].title}» добавлена практика полегче`, `верно только ${pct(mastery(id).acc)} заданий`);
      if (after >= 3 && !s.box) { s.box = 1; s.due = addDays(BOX_DAYS[1]); } // получается: ставим в повторение
      lines = `<div class="lvchange">${esc(C.skillById[id].title)}: <span class="big">${LV[Math.max(1, before)]}</span> ➜ <span class="big">${LV[Math.max(1, after)]}</span></div>
        <p class="sub">${esc(LVT[Math.max(1, after)])}${s.box ? ` · вспомним ${fmtDay(s.due)}` : ''}</p>`;
    } else {
      const bySkill = {};
      for (const x of r) {
        if (x.word) { const w = S.words[x.word]; const ok = !x.wrongs && !x.hints; w.box = ok ? Math.min(4, w.box + 1) : 1; w.due = addDays(BOX_DAYS[w.box]); }
        if (x.skill) bySkill[x.skill] = (bySkill[x.skill] !== false) && !x.wrongs && !x.hints;
      }
      for (const [id, ok] of Object.entries(bySkill)) {
        const s = sk(id);
        if (ok) { s.box = Math.min(4, s.box + 1); s.clean = (s.clean || 0) + 1; } // устойчивость: чистые повторения
        else s.box = 1;
        s.due = addDays(BOX_DAYS[s.box]);
      }
      lines = `<p class="sub">Повторение помогает помнить долго. Следующее будет, когда придёт время.</p>`;
    }
    save();
    if (P.mode === 'lesson') markStepDone('lesson', P.lesson.id);
    if (P.mode === 'review') markStepDone('review');
    if (P.mode === 'practice') markStepDone('practice', P.lesson.skill);
    if (P.mode === 'mini') { // «не хочу»: самое лёгкое сделано, день закрыт без упрёка
      const d = today(), dy = S.days[d] || (S.days[d] = { mode: modeFor(d), started: Date.now(), by: 'kira' });
      dy.refused = { reason: dy.refuseReason || null, choice: P.lesson.id.replace('mini-', '') };
      dy.started = dy.started || Date.now(); dy.by = dy.by || 'kira'; dy.active = dy.active || 0;
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
    if (!ts.tFirst && !['syll', 'helpmenu', 'exit'].includes(el.dataset.act) && el.dataset.say == null) ts.tFirst = Date.now(); // момент, когда закончила читать и начала отвечать
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
        let k = 0; while (k < ts.ans.length && ts.ans[k].x === t.items[k]) k++;
        if (k === t.items.length) solved();
        else { ts.fixed = k; ts.pool.push(...ts.ans.splice(k)); ts.pool = shuffle(ts.pool); wrong(t.err || 'order'); }
      }
      return;
    }
    if (act === 'helpmenu') { ts.menu = !ts.menu; renderPlayer(); return; }
    if (act === 'tutsend') { const i = document.getElementById('tutin'); tutorSend(i ? i.value : ''); return; }
    if (el.dataset.tutq) { tutorSend(el.dataset.tutq); return; }
    if (el.dataset.help) {
      const h = el.dataset.help; ts.menu = false; if (!ts.help.includes(h)) ts.help.push(h);
      if (h === 'reading') { ts.audioOn = true; ts.syllOn = true; ts.react = react('read_help'); }
      if (h === 'instruction') ts.instr = t.simple || INSTR[t.type] || INSTR.choice;
      if (h === 'word') {
        const hay = [t.q, t.text, ...(t.options || []).map((o) => o.t)].filter(Boolean).join(' ').toLowerCase();
        ts.wordHelp = C.words.filter((w) => hay.includes(w.word.toLowerCase().slice(0, Math.max(4, w.word.length - 2)))).slice(0, 2);
      }
      if (h === 'solve' && tutorReady && !ts.revealed) { openTutor(); return; }
      if (h === 'solve') {
        ts.react = react('asked_hint');
        const hints = t.hints && t.hints.length ? t.hints : GENERIC_HINTS;
        if (ts.hints < hints.length) { ts.hints++; P.hints++; } else ts.revealed = true;
        if (ts.hints < hints.length || !ts.revealed) ts.menu = false;
      }
      renderPlayer(); return;
    }
    if (act === 'next') { nextStep(); return; }
    if (act === 'skip') {
      P.results.push({ t: Date.now(), lesson: P.lesson.id, skill: P.mode === 'lesson' ? P.lesson.skill : t.reviewSkill || null, step: P.i,
        wrongs: ts.wrongs, hints: ts.hints, revealed: true, skipped: true, errs: ts.errs, help: ts.help, audio: ts.audioOn, d: t.d || P.diff || 1, fmt: t.type });
      nextStep(); return;
    }
    if (act === 'exit') { if (confirm('Выйти из урока? Прогресс этого урока не сохранится.')) { P = null; location.hash = '#/today'; } return; }
  }

  // ---------- родительский режим ----------
  // ---------- журнал адаптации: что система изменила и почему (виден маме) ----------
  function logAdapt(text, why) {
    S.adapt = S.adapt || []; const d = today();
    if (S.adapt.some((x) => x.d === d && x.text === text)) return;
    S.adapt.push({ d, text, why }); if (S.adapt.length > 120) S.adapt = S.adapt.slice(-120); save();
  }
  // нагрузка: подстраивается под последние 5 занятых дней
  function loadFactor() {
    const ds = Object.entries(S.days).filter(([d, x]) => d < today() && x.started).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5).map(([, x]) => x);
    if (ds.length < 3) return { delta: 0 };
    const refused = ds.filter((x) => x.refused).length, timeUps = ds.filter((x) => x.timeUp).length, tired = ds.filter((x) => x.energy === 'tired').length;
    const quick = ds.filter((x) => x.end && !x.timeUp && !x.refused && x.steps && x.steps.length && x.steps.every((st) => st.done) && activeMin(x) <= 0.7 * (C.modes.modes[x.mode] || { minutes: 15 }).minutes).length;
    const hard = refused + timeUps + tired;
    if (hard >= 2) return { delta: -1, why: `в последние дни трудно: «время вышло» ${timeUps}, отказы ${refused}, усталость ${tired}` };
    if (quick >= 3 && refused === 0) return { delta: 1, why: `за последние дни Кира легко и быстро закончила ${quick} раз(а)` };
    return { delta: 0 };
  }
  // фокус недели: сначала ваш ручной, потом из недельного разбора
  const focusManual = () => (S.parent.focus && S.parent.focus.length ? S.parent.focus : null);
  // предложение фокуса по данным (то же правило, что в недельном разборе)
  function suggestFocus() {
    const red = C.skills.filter((s) => s.priority === 'red' && s.track !== 'homework');
    const hard = red.filter((s) => { const m = mastery(s.id); return m.n >= 4 && m.acc < 0.8; }); // трудные берём даже если навык «закрыт»: Кира его уже начала
    const open = red.filter((s) => skillOpen(s) && !hard.includes(s));
    const going = open.filter((s) => mastery(s.id).n && mastery(s.id).lvl < 3);
    const fresh = open.filter((s) => !mastery(s.id).n);
    return [...hard.map((s) => ({ id: s.id, why: `трудно: умение ${pct(mastery(s.id).acc)} в последних заданиях` })),
      ...going.map((s) => ({ id: s.id, why: mastery(s.id).enough ? `начато, умение ${pct(mastery(s.id).acc)}, нужна практика посложнее` : 'начато, данных пока мало' })),
      ...fresh.map((s) => ({ id: s.id, why: 'обязательный навык, ещё не начинали' }))].slice(0, 3);
  }
  // что нужно от мамы: только по фактам, с причиной
  function momFlags() {
    const out = [], since7 = addDays(-6);
    const atts = S.log.filter((x) => !x.info && dstr(new Date(x.t)) >= since7);
    for (const s of C.skills) {
      const xs = atts.filter((x) => x.skill === s.id), cnt = {}; xs.flatMap((x) => x.errs || []).forEach((e) => (cnt[e] = (cnt[e] || 0) + 1));
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 3) out.push({ text: `5 минут вместе: «${s.title}»`, why: `за неделю одна и та же ошибка «${C.errors[top[0]] || top[0]}» ${top[1]} раза` });
    }
    const ref = Object.entries(S.days).filter(([d, x]) => d >= since7 && x.refused).length;
    if (ref >= 2) out.push({ text: 'Спокойно поговорите, что мешает', why: `за неделю ${ref} раза Кира выбирала «не хочу»` });
    const rh = atts.filter((x) => (x.help || []).includes('reading')).length;
    if (atts.length >= 8 && rh / atts.length > 0.3) out.push({ text: '5 минут чтения вслух вместе', why: `в ${rh} из ${atts.length} заданий Кира просила прочитать за неё` });
    const sk = atts.filter((x) => x.skipped).length;
    if (sk >= 2) out.push({ text: 'Разберите вместе пропущенные задачи', why: `за неделю ${sk} задачи Кира пропустила после всех подсказок` });
    const schoolDays = [1, 2, 3].map((k) => addDays(-k)).filter((d) => { const m = modeFor(d); return m === 'school' || m === 'full'; });
    const missed = schoolDays.filter((d) => !(S.days[d] && S.days[d].started)).length;
    if (schoolDays.length >= 2 && missed >= 2 && Object.keys(S.days).length) out.push({ text: 'Кира несколько дней не открывала рабочее время', why: `${missed} из последних ${schoolDays.length} школьных дней без занятий` });
    return out;
  }
  // не отстаём ли от плана месяца: честно, с оговоркой про малое число данных
  function monthStatus() {
    const R = C.roadmap, now = new Date();
    const m = R.months.find((x) => { const t = x.period.toLowerCase(); return (now.getMonth() === 9 && t.includes('октябр')) || (now.getMonth() === 10 && t.includes('ноябр')) || (now.getMonth() === 11 && t.includes('декабр')); }) || R.months[0];
    const done = m.skills.filter((id) => lvl(id) >= m.target).length;
    const started = m.skills.filter((id) => mastery(id).n).length;
    const frac = Math.min(1, now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    const expected = Math.round(frac * m.skills.length);
    const data = Object.keys(S.days).length >= 4;
    const state = !data ? 'мало данных (занятий меньше 4)' : done >= expected ? 'идёт по плану или лучше' : started >= expected ? 'начато достаточно, осваивается' : 'немного отстаёт';
    return { m, done, started, expected, state, data };
  }
  function momSummary() {
    const d = today(), dy = S.days[d], mode = modeFor(d), M = modeInfo(mode), ms = monthStatus(), ss = selfStats(), L = [];
    L.push(['📍 Где Кира', dy && dy.started ? `${M.emoji} ${M.title}. Сегодня активно ${activeMin(dy)} мин из ${M.minutes}, шагов выполнено ${(dy.steps || []).filter((x) => x.done && x.kind !== 'break').length} из ${(dy.steps || []).filter((x) => x.kind !== 'break').length}.` : `${M.emoji} ${M.title}. Рабочее время сегодня ещё не начато.`]);
    const good = C.skills.filter((s) => lvl(s.id) >= 3 && mastery(s.id).enough);
    L.push(['✔ Освоено', good.length ? good.slice(0, 5).map((s) => `${LV[lvl(s.id)]} ${s.title}`).join(', ') + (good.length > 5 ? ` и ещё ${good.length - 5}` : '') + `. Основание: умение не ниже 80% на нужной сложности.` : 'Пока ничего не закрыто на уровне «получается»: данных мало.']);
    const hard = C.skills.filter((s) => { const m = mastery(s.id); return m.n >= 4 && m.acc < 0.8; });
    L.push(['⚠ Трудно', hard.length ? hard.slice(0, 4).map((s) => `${s.title} (умение ${pct(mastery(s.id).acc)}, сама ${pct(mastery(s.id).indep)})`).join('; ') : 'Явных трудностей нет, либо данных пока недостаточно (нужно хотя бы 4 задания по навыку).']);
    const steps = dy && dy.steps ? dy.steps.filter((x) => x.kind !== 'break') : [];
    L.push(['📅 Сегодня', steps.length ? steps.map((x) => `${x.done ? '✅' : '·'} ${x.title}${x.why && x.why !== 'новая тема' ? ` (${x.why})` : ''}`).join('; ') : mode === 'off' || mode === 'weekend' ? 'Ничего обязательного.' : 'План появится, когда Кира начнёт рабочее время.']);
    const fm = focusManual() || ((C.week && C.week.focus) || []);
    L.push(['🎯 На этой неделе', fm.length ? 'Фокус: ' + fm.map((id) => (C.skillById[id] || { title: id }).title).join('; ') + (focusManual() ? ' (выбран вами)' : ' (из недельного разбора)') : 'Фокус не выбран: система идёт по программе. Можно выбрать на вкладке «Неделя».']);
    L.push(['🗓 Не отстаём ли', `${ms.m.title}: на уровне «получается» ${ms.done} из ${ms.m.skills.length}, начато ${ms.started}, к этой дате ожидается около ${ms.expected}. Вывод: ${ms.state}.`]);
    const fast = C.skills.filter((s) => lvl(s.id) >= 4 && mastery(s.id).indep >= 0.7);
    L.push(['⏩ Где ускориться', fast.length ? fast.slice(0, 3).map((s) => s.title).join(', ') + ': освоено, дальше идём вперёд.' : 'Пока нет навыков, которые уверенно освоены сама.']);
    const lf = loadFactor();
    L.push(['✋ Где остановиться', lf.delta < 0 ? 'Нагрузка снижена: ' + lf.why + '.' : hard.length ? 'Новое по трудным темам не добавляем, пока не получится: ' + hard.slice(0, 2).map((s) => s.title).join(', ') + '.' : 'Пока всё в порядке.']);
    L.push(['🧒 Самостоятельность (14 дней)', ss.days ? `начала сама ${ss.started_self} из ${ss.days}, довела до конца ${ss.finished}, «не хочу» ${ss.refused}.` : 'Данных пока нет.']);
    const fl = momFlags();
    return { L, fl };
  }
  function viewParentSummary() {
    const { L, fl } = momSummary();
    let h = `<h2>За 1 минуту</h2><div class="card">${L.map(([a, b]) => `<div style="margin:8px 0"><b>${a}.</b> ${esc(b)}</div>`).join('')}</div>`;
    h += `<h2>${fl.length ? '🙋 Нужна ваша помощь' : '🙋 От мамы'}</h2><div class="card">${fl.length ? fl.map((f) => `<div style="margin:10px 0"><b>${esc(f.text)}</b><div class="muted small">Почему: ${esc(f.why)}</div></div>`).join('') : 'От мамы ничего не требуется.'}</div>`;
    return h;
  }
  function viewParentWeek() {
    let h = `<h2>Фокус недели</h2><div class="card"><p class="small">Что система даёт Кире в первую очередь. Выберите до 3 навыков или нажмите «Предложить» (по данным: сначала то, что трудно, потом начатое, потом обязательное). Выбранное вами важнее недельного разбора.</p>`;
    const cur = focusManual() || [];
    h += `<div class="row">${C.skills.filter((s) => s.track !== 'homework' && s.priority !== 'green' && (skillOpen(s) || mastery(s.id).n)).map((s) => `<label class="tag ${cur.includes(s.id) ? 'green' : ''}" style="cursor:pointer;padding:6px 12px"><input type="checkbox" data-focus="${s.id}" ${cur.includes(s.id) ? 'checked' : ''}> ${esc(s.title)}</label>`).join('')}</div>
      <div class="row" style="margin-top:10px"><button class="btn small" data-act="suggestfocus">🎯 Предложить по данным</button><button class="btn soft small" data-act="clearfocus">Сбросить мой выбор</button></div>
      <p class="small">${cur.length ? 'Сейчас: ' + cur.map((id) => esc(C.skillById[id].title)).join('; ') : (C.week.focus && C.week.focus.length ? 'Сейчас из недельного разбора: ' + C.week.focus.map((id) => esc((C.skillById[id] || { title: id }).title)).join('; ') : 'Сейчас фокус не выбран.')}</p>
      ${S.parent.focusWhy ? `<div class="muted small">Почему: ${Object.entries(S.parent.focusWhy).map(([id, w]) => esc((C.skillById[id] || { title: id }).title) + ': ' + esc(w)).join('; ')}</div>` : ''}</div>`;
    const lf = loadFactor();
    h += `<h2>Нагрузка</h2><div class="card"><p>${lf.delta < 0 ? '⬇ Система снижает нагрузку на 1 шаг: ' + esc(lf.why) + '.' : lf.delta > 0 ? '⬆ Система добавляет 1 шаг: ' + esc(lf.why) + '.' : 'Нагрузка обычная. Менять не нужно.'}</p>
      <p class="muted small">Считается по последним занятым дням: если Кира несколько раз легко закончила, добавляется шаг; если было «время вышло», отказы или усталость, шаг убирается.</p></div>`;
    h += `<h2>Что система изменила и почему</h2><div class="card">${(S.adapt || []).length ? (S.adapt || []).slice(-15).reverse().map((x) => `<div style="margin:8px 0"><span class="tag">${x.d.slice(8)}.${x.d.slice(5, 7)}</span> <b>${esc(x.text)}</b><div class="muted small">Почему: ${esc(x.why)}</div></div>`).join('') : '<p class="small">Пока изменений не было. Они появятся, когда накопятся данные: если тема закроется раньше срока, добавится практика, снизится нагрузка и так далее.</p>'}</div>`;
    return h;
  }

  const momLinks = () => (S.parent.links || []).map((l) => `<a class="task-card" href="${esc(l.url)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><div class="pic" style="background:var(--sky-l)">🔗</div><div><span class="tag">От мамы</span><div class="t">${esc(l.title)}</div><div class="m">${esc(l.note || '')}</div></div><div class="go">➜</div></a>`).join('');
  function parentTools() {
    const links = S.parent.links || [];
    return `<h2>Ссылка или задание для Киры</h2><div class="card"><p class="small">Видео, мастер-класс, упражнение на другом сайте. Появится у Киры в выходной и в конце учебного дня как «От мамы». Отметка «сделала» у внешних ресурсов системой не проверяется.</p>
      <div class="row"><input class="field" id="lktitle" style="flex:1;min-width:180px" placeholder="Название"><input class="field" id="lkurl" style="flex:2;min-width:240px" placeholder="Ссылка (https://…)"></div>
      <div class="row" style="margin-top:8px"><input class="field" id="lknote" style="flex:1" placeholder="Подпись для Киры (необязательно)"><button class="btn small" data-act="addlink">Добавить</button></div>
      ${links.length ? links.map((l, i) => `<div class="row small" style="margin-top:8px"><b>${esc(l.title)}</b><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url.slice(0, 50))}</a><button class="btn soft small" data-dellink="${i}">Убрать</button></div>`).join('') : ''}</div>
      <h2>Домашка</h2><div class="card"><p class="small">Кира фотографирует задание на вкладке «Домашка». Фото приходит вам в Telegram, вы передаёте его Claude, разбор появляется у Киры на том же сайте. Отправка фото работает после подключения ящика отчётов (${C.config.reports ? 'подключён' : 'ещё не подключён'}).</p></div>`;
  }
  let pinBuf = '', parentOk = false, ptab = 'now';
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
    const sec = { now: '', week: '', skills: '', tools: '', set: '' }; let cur = 'now', h = '';
    const flush = () => { sec[cur] += h; h = ''; };
    flush(); cur = 'set';
    const tset = tutorSet();
    h += `<h2>AI-учитель на этом компьютере</h2><div class="card"><p class="small">Работает через Ollama на этом же ноутбуке, без интернета и без оплаты. Включается, когда Кира выбирает «Мне трудно» → «Не знаю, как решить».</p>
      <div class="row"><input class="field" id="turl" style="width:280px" value="${esc(tset.url)}"><input class="field" id="tmodel" style="width:180px" value="${esc(tset.model)}">
      <button class="btn small" data-act="tutsave">Сохранить и проверить</button></div><p class="small" id="tstat">${tutorReady ? '✅ Учитель на связи' : '○ Учитель не найден: подсказки работают как обычно'}</p></div>`;
    flush(); cur = 'now';
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
      <div class="row" style="margin-top:8px"><button class="btn soft small" data-act="resetday">↺ Начать сегодняшний день заново</button></div>
      <div class="row" style="margin-top:8px"><button class="btn small" data-act="sendreport">📤 Отправить отчёт за сегодня</button><button class="btn soft small" data-act="savereport">💾 Сохранить отчёт файлом</button></div>
      <p class="muted small">В очереди: ${S.outbox.length}. Последняя отправка: ${S.lastSend ? new Date(S.lastSend).toLocaleString('ru-RU') : 'ещё не было'}. ${C.config.reports ? '' : 'Почтовый ящик пока не подключён: отчёты копятся здесь и уйдут, когда подключим.'}</p></div>`;

    flush(); cur = 'set';
    // программа: Россия или международная
    h += `<h2>Программа</h2><div class="card"><div class="row"><b>Сейчас учимся по:</b>
      <select data-program><option value="ru" ${!intl() ? 'selected' : ''}>Российская программа (школьные дни + выходные)</option><option value="intl" ${intl() ? 'selected' : ''}>Международная (после переезда: полная учёба в будни, английский вдвое больше)</option></select></div>
      <p class="muted small">Переключение меняет расписание недели и порядок предметов. Навыки Киры и её прогресс сохраняются.</p></div>`;

    flush(); cur = 'skills';
    // покрытие карт программ
    h += '<h2>Покрытие программ</h2><div class="cards">';
    for (const cur of C.curricula) {
      const cv = coverage(cur), ok = cv.filter((x) => x.state === 'ok').length, part = cv.filter((x) => x.state === 'partial').length, none = cv.filter((x) => x.state === 'none').length;
      h += `<div class="card"><div class="tag">${esc(cur.title)}</div><div style="font-size:30px;font-weight:900">${ok} из ${cv.length} закрыто</div>
        <div class="bar" style="margin:8px 0"><i style="width:${Math.round(ok / cv.length * 100)}%"></i></div>
        <div class="muted small">в работе: ${part} · пока без уроков: ${none}</div>
        <details style="margin-top:8px"><summary class="small">Что именно</summary>${cv.map((x) => `<div class="small" style="margin:4px 0">${{ ok: '✅', partial: '🌿', todo: '○', none: '·' }[x.state]} <b>${esc(x.grade)}</b> ${esc(x.text)}</div>`).join('')}</details>
        ${cur.note ? `<p class="muted small">${esc(cur.note)}</p>` : ''}</div>`;
    }
    h += '</div>';

    flush(); cur = 'skills';
    // чтение: скорость и контрольные истории
    const rs1 = readSpeed(addDays(-6), today()), rs2 = readSpeed(addDays(-13), addDays(-7)), runs = controlRuns();
    h += `<h2>Чтение: динамика</h2><div class="card"><div class="row"><div><div class="tag">За 7 дней</div><div style="font-size:34px;font-weight:900">${rs1.wpm == null ? 'мало данных' : '≈' + rs1.wpm + ' слов/мин'}</div></div>
      <div><div class="tag">Неделей раньше</div><div style="font-size:34px;font-weight:900">${rs2.wpm == null ? 'мало данных' : '≈' + rs2.wpm}</div></div></div>
      <p class="muted small">Скорость считается по времени до первого ответа на задании с текстом (читала сама, без озвучки), поэтому это ориентир, а не замер. Цель по программе: не меньше 40 слов в минуту к концу 2 класса, но главное, чтобы внимание освобождалось для понимания. Нужно хотя бы 3 задания с текстом.</p>
      ${runs.length ? `<table class="ptable"><tr><th>Контрольная история</th><th>Дата</th><th>Верно</th><th>Сама</th><th>Помощь</th><th>Слов/мин</th></tr>${runs.map((r) => `<tr><td>${esc((C.lessons.find((l) => l.id === r.lesson) || {}).title || r.lesson)}</td><td>${r.date}</td><td>${r.ok} из ${r.n}</td><td>${r.indep}</td><td>${r.help}</td><td>${r.wpm || '—'}</td></tr>`).join('')}</table>` : '<p class="small">Контрольная история появится в плане дня примерно через 3 дня занятий, потом раз в две недели.</p>'}</div>`;

    flush(); cur = 'week';
    // самостоятельность: главная цель первых трёх месяцев
    const ss = selfStats();
    h += `<h2>Самостоятельность (14 дней)</h2><div class="cards">
      <div class="card"><div class="tag green">Начала сама</div><div style="font-size:34px;font-weight:900">${ss.started_self} из ${ss.days}</div><div class="muted small">дней с рабочим временем</div></div>
      <div class="card"><div class="tag">Довела до конца</div><div style="font-size:34px;font-weight:900">${ss.finished}</div><div class="muted small">без отказа и без «время вышло»</div></div>
      <div class="card"><div class="tag yellow">Просила помощь</div><div style="font-size:34px;font-weight:900">${ss.help_asked}</div><div class="muted small">раз через «Мне трудно» (это хорошо: не отказ)</div></div>
      <div class="card"><div class="tag">Отказы · сверху</div><div style="font-size:34px;font-weight:900">${ss.refused} · ${ss.extra}</div><div class="muted small">«не хочу» и «ещё одна» по желанию</div></div></div>`;

    flush(); cur = 'skills';
    // освоение навыков: 4 измерения и вывод
    h += `<h2>Навыки: где Кира сейчас</h2><div class="card"><table class="ptable"><tr><th>Навык</th><th>Попыток</th><th>Умение</th><th>Сама</th><th>Сложность</th><th>Повторения</th><th>Вывод</th><th>Частые ошибки</th></tr>`;
    for (const sk2 of C.skills) {
      const m = mastery(sk2.id); if (!m.n) continue;
      const cnt = {}; attemptsOf(sk2.id).slice(-12).flatMap((x) => x.errs || []).forEach((e) => (cnt[e] = (cnt[e] || 0) + 1));
      const top = Object.entries(cnt).filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([e2, n]) => `${errName(e2)} ×${n}`).join('; ');
      h += `<tr><td>${LV[Math.max(1, lvl(sk2.id))]} ${esc(sk2.title)}</td><td>${m.n}</td><td>${pct(m.acc)}</td><td>${pct(m.indep)}</td><td>${m.diff || 0} из ${maxDiff(sk2.id)}</td><td>${m.stab}</td><td>${esc(masteryVerdict(sk2.id))}</td><td class="small">${esc(top || 'нет')}</td></tr>`;
    }
    h += `</table><p class="muted small">Умение: верные ответы в последних 6 заданиях. Сама: без подсказок, озвучки и ошибок. Сложность: самый трудный уровень, где получается 80%. Повторения: сколько раз чисто вспомнила через несколько дней. Меньше 4 попыток: выводов не делаем.</p></div>`;

    flush(); cur = 'skills';
    // покрытие карты навыков
    h += '<h2>Карта навыков: что уже есть в программе</h2><div class="card">';
    for (const ar of C.catalog.areas) {
      const items = ar.items.map(([code, title, cov]) => { const has = cov.some((c) => c === 'self' || c === 'help' || lessonsOf(c).length || GEN[c]); return `<span class="tag ${has ? 'green' : ''}" title="${esc(title)}">${has ? '✓' : '○'} ${esc(code)} ${esc(title)}</span>`; }).join(' ');
      h += `<div style="margin-bottom:12px"><b>${esc(ar.area)}</b><div>${items}</div></div>`;
    }
    h += '<p class="muted small">✓ есть задания, ○ пока нет. Недостающее добавляет Claude пачками заданий.</p></div>';

    flush(); cur = 'skills';
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

    flush(); cur = 'tools';
    h += `<h2>Записка на главный экран</h2><div class="card"><textarea class="field" id="pcomment" placeholder="Её покажет Ника на главном экране">${esc(S.parent.comment)}</textarea>
      <div class="row" style="margin-top:10px"><button class="btn small" data-act="savecomment">Сохранить</button><button class="btn soft small" data-act="clearcomment">Убрать</button></div></div>
      <h2>Заметки для себя</h2><div class="card"><textarea class="field" id="pnotes">${esc(S.parent.notes)}</textarea>
      <div class="row" style="margin-top:10px"><button class="btn small" data-act="savenotes">Сохранить</button><button class="btn soft small" data-act="voice" data-target="pnotes">🎤 Надиктовать</button></div></div>
`;
    flush(); cur = 'set';
    h += `<h2>Данные</h2><div class="card"><div class="row">
      <button class="btn small" data-act="export">⬇️ Выгрузить прогресс</button>
      <label class="btn soft small">⬆️ Загрузить<input type="file" accept=".json" data-act="import" hidden></label>
      <button class="btn soft small" data-act="newpin">Сменить PIN</button>
      <button class="btn soft small" data-act="forgetkey">Забыть пароль школы на этом компьютере</button>
      <button class="btn soft small" data-act="reset">Сбросить всё</button></div>
      <p class="muted small">Прогресс хранится только в этом браузере. Выгрузку можно передать в Claude: он разберёт ошибки и добавит уроки.</p></div>`;
    flush();
    // добавки к вкладкам
    sec.tools = parentTools() + sec.tools;
    const tabs = [['now', '🙋 Сегодня'], ['week', '📅 Неделя'], ['skills', '🌳 Навыки и программы'], ['tools', '🧰 Для Киры'], ['set', '⚙️ Настройки']];
    const top = `<div class="row" style="justify-content:space-between"><h1>Кабинет мамы</h1><button class="btn soft small" data-go="#/path">🗺 Путь Киры</button></div>
      <p class="sub">${esc(S.name)} · миры: ${S.worlds.map((w) => (C.worlds.find((x) => x.id === w) || {}).title).filter(Boolean).join(', ') || 'не выбраны'}</p>
      <div class="tabs">${tabs.map(([k, t]) => `<button data-ptab="${k}" class="${ptab === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    const first = { now: viewParentSummary() + sec.now, week: viewParentWeek() + sec.week };
    return shell('', top + (first[ptab] || sec[ptab]));
  }

  // ---------- путь Киры (для мамы): сейчас → месяц → 3 месяца → конец 2 класса → дальше ----------
  function viewPath() {
    if (!parentOk) { location.hash = '#/parent'; return ''; }
    const R = C.roadmap, ss = selfStats();
    const areas = {};
    for (const s of C.skills) { if (s.track === 'homework') continue; const a = areas[s.track] = areas[s.track] || { t: track(s.track), n: 0, started: 0, ok: 0 }; a.n++; if (mastery(s.id).n) a.started++; if (lvl(s.id) >= 3) a.ok++; }
    let h = `<div class="row" style="justify-content:space-between"><h1>Путь Киры</h1><button class="btn soft small" data-go="#/parent">← Кабинет</button></div>
      <h2>Сейчас</h2><div class="cards">${Object.values(areas).map((a) => `<div class="card"><div class="tag">${a.t.emoji} ${esc(a.t.title)}</div>
        <div style="font-size:28px;font-weight:900">${a.ok} из ${a.n} получается</div><div class="muted small">начато: ${a.started}</div></div>`).join('')}</div>
      <p class="sub">Самостоятельность за 14 дней: начала сама ${ss.started_self} из ${ss.days}, довела до конца ${ss.finished}, отказов ${ss.refused}.</p>`;
    for (const m of R.months) {
      const done = m.skills.filter((id) => lvl(id) >= m.target).length;
      const share = ss.days ? ss.started_self / ss.days : 0;
      h += `<h2>${esc(m.title)}</h2><div class="card"><div class="muted small">${esc(m.period)}</div><p>${esc(m.goal)}</p>
        <div class="bar" style="margin:10px 0"><i style="width:${Math.round((done / m.skills.length) * 100)}%"></i></div>
        <p class="small">Навыков на уровне 🌳 и выше: ${done} из ${m.skills.length}. Цель по самостоятельности: начинать сама в ${Math.round(m.self.started_self_share * 100)}% дней (сейчас ${Math.round(share * 100)}%).</p>
        <div>${m.skills.map((id) => C.skillById[id] ? `<span class="tag ${lvl(id) >= m.target ? 'green' : ''}">${lvl(id) ? LV[lvl(id)] : '○'} ${esc(C.skillById[id].title)}</span>` : '').join(' ')}</div></div>`;
    }
    h += `<h2>${esc(R.grade2_end.title)}</h2><div class="card"><ul>${R.grade2_end.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <p class="muted small">Что из этого уже есть в программе, видно в кабинете: «Карта навыков».</p></div>`;
    h += `<h2>Дальше</h2><div class="cards">${R.later.map((x) => `<div class="card"><div class="tag">${esc(x.title)}</div><p>${esc(x.text)}</p></div>`).join('')}</div>`;
    return shell('', h);
  }

  // ---------- AI-учитель (локальная модель через Ollama на этом компьютере) ----------
  let tutorReady = false;
  const tutorSet = () => Object.assign({ url: C.tutorCfg.default_url, model: C.tutorCfg.default_model }, S.set.tutor || {});
  async function checkTutor() {
    try {
      const r = await fetch(tutorSet().url + '/api/tags', { signal: AbortSignal.timeout(2500) });
      const j = await r.json(); tutorReady = (j.models || []).some((m) => m.name.startsWith(tutorSet().model.split(':')[0]));
      return j.models || [];
    } catch (e) { tutorReady = false; return null; }
  }
  const answerOf = (t) => t.type === 'choice' ? t.options.find((o) => o.ok).t : t.type === 'input' ? String([].concat(t.answer)[0]) : t.type === 'order' ? t.items.join(', ') : t.type === 'match' ? t.pairs.map((p) => p.join(' = ')).join('; ') : '';
  function tutorSystem(t) {
    const strong = C.skills.filter((s) => lvl(s.id) >= 3).map((s) => s.title).join(', ') || 'логика, творчество';
    const working = C.skills.filter((s) => mastery(s.id).n && lvl(s.id) < 3).map((s) => s.title).join(', ') || 'пока мало данных';
    const sid = P.lesson.skill || t.reviewSkill;
    const cnt = {}; (sid ? attemptsOf(sid) : []).flatMap((x) => x.errs || []).forEach((e) => (cnt[e] = (cnt[e] || 0) + 1));
    const errs = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => C.errors[e] || e).join(', ') || 'нет данных';
    const task = [t.text ? 'Текст: ' + t.text : '', 'Вопрос: ' + (t.q || ''), t.options ? 'Варианты: ' + t.options.map((o) => o.t).join(' / ') : '', t.items ? 'Карточки: ' + t.items.join(' / ') : ''].filter(Boolean).join('\n');
    return C.tutorCfg.system.replace('{strong}', strong).replace('{working}', working).replace('{errors}', errs)
      .replace('{topic}', sid && C.skillById[sid] ? C.skillById[sid].title : P.lesson.title).replace('{task}', task).replace('{answer}', answerOf(t));
  }
  // предохранители: маленькой модели не доверяем
  function guard(text, t) {
    let x = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
    // Кира девочка: маленькая модель путает род
    x = x.replace(/(^|[^а-яё])(сказал|понял|нашёл|нашел|написал|сделал|выбрал|подумал|решил|ответил|заметил|посчитал|прочитал|догадался|справился)(?![а-яё])/gi,
      (m0, pre, w) => pre + (/ся$/i.test(w) ? w.slice(0, -2) + 'ась' : w + 'а')).replace(/нашёла|нашела/gi, 'нашла');
    const sents = x.match(/[^.!?]+[.!?]+/g) || [x];
    if (sents.length > 2) x = (sents[0] + ' ' + sents[sents.length - 1]).trim(); // первое предложение и вопрос в конце
    const ans = answerOf(t).toLowerCase().trim();
    const leak = ans && (/^\d+$/.test(ans) ? new RegExp('(^|[^\\d])' + ans + '([^\\d]|$)').test(x) : ans.length > 2 && x.toLowerCase().includes(ans));
    if (leak || !x) {
      const hints = t.hints && t.hints.length ? t.hints : GENERIC_HINTS;
      return { text: hints[Math.min(P.ts.tutor.leaks++, hints.length - 1)] + ' Как думаешь?', leak: true };
    }
    return { text: x, leak: false };
  }
  // если Кира написала ответ, код сам проверяет его и говорит модели, верно ли (модель не путает похвалу)
  function verdictNote(text, t) {
    const ans = answerOf(t).toLowerCase().trim(), k = text.toLowerCase().trim();
    if (!ans) return [];
    const num = /^\d+$/.test(ans), kn = (k.match(/\d+/) || [])[0];
    if (num && kn) return [{ role: 'system', content: kn === ans ? C.tutorCfg.right_note : C.tutorCfg.wrong_note }];
    const hit = !num && t.options && t.options.find((o) => { const ot = o.t.toLowerCase(); return k.includes(ot) || (k.length >= 2 && ot.startsWith(k)); });
    if (hit) return [{ role: 'system', content: hit.ok ? C.tutorCfg.right_note : C.tutorCfg.wrong_note }];
    return [];
  }
  function openTutor() {
    const ts = P.ts; ts.menu = false; if (!ts.help.includes('tutor')) ts.help.push('tutor');
    ts.tutor = { id: Date.now(), msgs: [{ role: 'assistant', content: C.tutorCfg.opener }], busy: false, turns: 0, leaks: 0 };
    renderPlayer();
  }
  async function tutorSend(text) {
    const ts = P.ts, tu = ts.tutor, t = P.steps[P.i];
    if (!text.trim() || tu.busy) return;
    tu.msgs.push({ role: 'user', content: text.trim() }); tu.turns++; tu.busy = true; renderPlayer();
    let reply;
    const vn = verdictNote(text, t);
    const stuck = /не\s*(по)?ним|не\s*знаю|не\s*получ|не\s*могу/i.test(text);
    if (vn.length && vn[0].content === C.tutorCfg.right_note) reply = { text: C.tutorCfg.right_done, leak: false }; // верно: подтверждает код, не модель
    else if (stuck && !tu.stuckOnce) { tu.stuckOnce = true; reply = { text: C.tutorCfg.stuck_intro + ' ' + ((t.hints && t.hints[0]) || C.tutorCfg.stuck_fallback), leak: false }; } // самый важный момент: методическая подсказка из урока
    else if (tu.turns > C.tutorCfg.max_turns) reply = { text: 'Мы долго разбираем эту задачу. Позови маму, вы разберёте её вместе. Или пропусти пока.', leak: false };
    else {
      try {
        const r = await fetch(tutorSet().url + '/api/chat', { method: 'POST', body: JSON.stringify({ model: tutorSet().model, stream: false, think: false,
          options: { temperature: 0.4, num_predict: 160 }, messages: [{ role: 'system', content: tutorSystem(t) }, ...tu.msgs, ...vn] }) });
        const j = await r.json(); reply = guard(j.message && j.message.content, t);
      } catch (e) { reply = { text: 'Связь с помощником пропала. Давай дальше с подсказками.', leak: false }; tutorReady = false; }
    }
    if (P && P.ts === ts) { tu.msgs.push({ role: 'assistant', content: reply.text, leak: reply.leak }); tu.busy = false;
      S.tutor = (S.tutor || []).filter((x) => x.id !== tu.id).concat([{ id: tu.id, t: Date.now(), lesson: P.lesson.id, q: t.q, msgs: tu.msgs }]).slice(-200); save(); renderPlayer();
      const inp = document.getElementById('tutin'); if (inp) inp.focus(); }
  }
  function tutorHtml() {
    const tu = P.ts.tutor; if (!tu) return '';
    return `<div class="card" style="margin-top:16px"><div class="tag">Разбираем вместе с Никой</div>
      ${tu.msgs.map((m) => `<div style="display:flex;justify-content:${m.role === 'user' ? 'flex-end' : 'flex-start'};margin:8px 0">
        <div style="max-width:80%;padding:10px 14px;border-radius:16px;background:${m.role === 'user' ? 'var(--violet-l)' : 'var(--sun-l)'}">${m.role === 'user' ? '' : '🦉 '}${esc(m.content)}</div></div>`).join('')}
      ${tu.busy ? '<p class="muted small">Ника думает…</p>' : ''}
      <div class="row" style="margin-top:10px"><input class="field" id="tutin" style="flex:1;min-width:200px" placeholder="Напиши или скажи" autocomplete="off">
        <button class="btn soft small" data-act="voice" data-target="tutin">🎤 Сказать</button><button class="btn small" data-act="tutsend">Отправить</button></div>
      <div class="row" style="margin-top:8px"><button class="btn soft small" data-tutq="Не понимаю">Не понимаю</button><button class="btn soft small" data-tutq="Можно ещё подсказку?">Ещё подсказку</button></div></div>`;
  }

  // ---------- голос: Whisper в браузере (на видеокарте), запасной вариант: распознавание браузера ----------
  let asr = null, asrLoading = null;
  async function loadWhisper() {
    if (asr) return asr;
    if (!asrLoading) asrLoading = (async () => {
      const tf = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1');
      // модель лежит на нашем же сайте (сайт моделей из России открывается ненадёжно); после первой загрузки она в кэше и работает офлайн
      tf.env.allowRemoteModels = false; tf.env.allowLocalModels = true; tf.env.localModelPath = new URL('models/', location.href).href;
      asr = await tf.pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', { device: 'wasm', dtype: 'q8' });
      return asr;
    })();
    return asrLoading;
  }
  async function transcribe(blob) {
    const pipe = await loadWhisper();
    const ctx = new AudioContext({ sampleRate: 16000 });
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const out = await pipe(buf.getChannelData(0), { language: 'russian', task: 'transcribe' });
    return (out.text || '').trim();
  }
  let rec = null;
  async function toggleVoice(btn) {
    const target = document.getElementById(btn.dataset.target);
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = []; rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); rec = null;
        btn.textContent = '⏳ Распознаю…'; btn.disabled = true;
        try { const txt = await transcribe(new Blob(chunks, { type: 'audio/webm' })); if (target) { target.value = (target.value ? target.value + ' ' : '') + txt; target.dispatchEvent(new Event('input')); } }
        catch (e) { btn.textContent = 'Не вышло, напиши'; return; }
        btn.textContent = '🎤 Сказать'; btn.disabled = false; if (target) target.focus();
      };
      rec.start(); btn.textContent = '⏹ Готово'; loadWhisper().catch(() => {});
    } catch (e) { btn.textContent = 'Нет микрофона'; }
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
    if (page !== 'parent' && page !== 'path') parentOk = false;
    if (page === 'lesson') { startLesson(arg); return; }
    if (page === 'review') { startReview(); return; }
    if (page === 'practice') { startPractice(arg); return; }
    P = null;
    const views = { path: viewPath, today: viewToday, nowant: viewNoWant, map: () => viewMap(arg), skills: viewSkills, homework: viewHomework, parent: viewParent };
    app.innerHTML = (views[page] || viewToday)();
    window.scrollTo(0, 0);
    if (!views[page] || page === 'today') { const iv = setInterval(() => { if (!P) app.innerHTML = viewToday(); }, 60000); cleanup = () => clearInterval(iv); }
    if (page === 'map') requestAnimationFrame(drawPath);
  }

  // ---------- события ----------
  app.addEventListener('click', (e) => {
    const el = e.target.closest('button, a, [data-go]'); if (!el) return;
    if (el.dataset.say != null) { speak(el.dataset.say, el.dataset.lang); return; }
    if (el.dataset.act === 'voice') { toggleVoice(el); return; }
    if (el.dataset.go) { location.hash = el.dataset.go; return; }
    if (el.dataset.act === 'syll') { S.set.syll = !S.set.syll; save(); P ? renderPlayer() : route(); return; }
    if (P) { onPlayerClick(el); return; }
    if (el.dataset.tab) { location.hash = '#/map/' + el.dataset.tab; return; }
    if (el.dataset.ptab) { ptab = el.dataset.ptab; app.innerHTML = viewParent(); window.scrollTo(0, 0); return; }
    if (el.dataset.dellink != null) { S.parent.links.splice(+el.dataset.dellink, 1); save(); app.innerHTML = viewParent(); return; }
    const d = today();
    if (el.dataset.act === 'startday') {
      S.days[d] = Object.assign(S.days[d] || {}, { mode: modeFor(d), started: Date.now(), active: 0, lastAct: Date.now(), by: S.parent.remindOn === d ? 'mom' : 'kira' });
      save(); route(); return;
    }
    if (el.dataset.energy) {
      const dy = S.days[d]; dy.energy = el.dataset.energy;
      const b = buildDay(dy.mode, dy.energy); dy.steps = b.steps; dy.missing = b.missing; dy.notes = b.notes; save(); route(); return;
    }
    if (el.dataset.act === 'nextstep') {
      const nx = nextStepOf(S.days[d]); if (!nx) { route(); return; }
      location.hash = nx.kind === 'review' ? '#/review' : nx.kind === 'practice' ? '#/practice/' + nx.skill : '#/lesson/' + nx.lesson; return;
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
    if (act === 'addlink') {
      const t = document.getElementById('lktitle').value.trim(), u = document.getElementById('lkurl').value.trim(), n = document.getElementById('lknote').value.trim();
      if (!t || !/^https?:\/\//.test(u)) { alert('Нужны название и ссылка, которая начинается с https://'); return; }
      (S.parent.links = S.parent.links || []).push({ title: t, url: u, note: n }); save(); app.innerHTML = viewParent(); return;
    }
    if (act === 'suggestfocus') { const sg = suggestFocus(); S.parent.focus = sg.map((x) => x.id); S.parent.focusWhy = Object.fromEntries(sg.map((x) => [x.id, x.why])); save(); logAdapt('Предложен фокус недели: ' + sg.map((x) => C.skillById[x.id].title).join('; '), sg.map((x) => x.why).join('; ')); app.innerHTML = viewParent(); return; }
    if (act === 'clearfocus') { S.parent.focus = []; S.parent.focusWhy = null; save(); app.innerHTML = viewParent(); return; }
    if (act === 'tutsave') {
      S.set.tutor = { url: document.getElementById('turl').value.trim().replace(/\/$/, ''), model: document.getElementById('tmodel').value.trim() }; save();
      const st = document.getElementById('tstat'); st.textContent = 'Проверяю…';
      checkTutor().then((ms) => { st.textContent = ms === null ? '❌ Не отвечает. Запущен ли Ollama и разрешён ли адрес сайта (OLLAMA_ORIGINS)?' : tutorReady ? `✅ На связи, модель ${tutorSet().model}` : `⚠️ Ollama отвечает, но модели ${tutorSet().model} нет. Есть: ${ms.map((m) => m.name).join(', ') || 'ничего'}`; });
      return;
    }
    if (act === 'setrange') {
      const a = document.getElementById('rfrom').value, b = document.getElementById('rto').value, m = document.getElementById('rmode').value;
      if (!a || !b || a > b) { alert('Выберите даты «с» и «по».'); return; }
      for (let x = new Date(a + 'T12:00'); dstr(x) <= b; x.setDate(x.getDate() + 1)) S.calendar[dstr(x)] = m;
      save(); app.innerHTML = viewParent(); return;
    }
    if (act === 'clearrange') { S.calendar = {}; save(); app.innerHTML = viewParent(); return; }
    if (act === 'resetday') { if (confirm('Стереть сегодняшний план и время? Пройденные уроки останутся в прогрессе.')) { delete S.days[today()]; save(); route(); } return; }
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
    if (el.dataset.focus) {
      const f = new Set(S.parent.focus || []); el.checked ? f.add(el.dataset.focus) : f.delete(el.dataset.focus);
      if (f.size > 3) { alert('В фокус можно взять до 3 навыков: так Кире проще.'); el.checked = false; f.delete(el.dataset.focus); }
      S.parent.focus = [...f]; S.parent.focusWhy = null; save(); app.innerHTML = viewParent(); return;
    }
    if (el.dataset.program != null) { S.set.program = el.value; save(); route(); return; }
    if (el.dataset.daymode) { const d = el.dataset.daymode; S.calendar[d] = el.value; const dy = S.days[d]; if (dy && !dy.started) dy.mode = el.value; save(); app.innerHTML = viewParent(); return; }
    if (el.dataset.act === 'reminded') { const d = today(); S.parent.remindOn = el.checked ? d : ''; if (S.days[d]) S.days[d].by = el.checked ? 'mom' : 'kira'; save(); return; }
    if (el.dataset.act === 'file' && el.files[0]) { showShot(el.files[0]); return; }
    if (el.dataset.act === 'import' && el.files[0]) {
      el.files[0].text().then((txt) => { const s = JSON.parse(txt); if (s.v !== 1) throw 0; S = Object.assign(blankState(), s); save(); alert('Прогресс загружен.'); route(); })
        .catch(() => alert('Это не файл прогресса.'));
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'tutin' && e.key === 'Enter') { tutorSend(e.target.value); return; }
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
  for (const dy of Object.values(S.days || {})) {
    if (dy && dy.started && dy.active == null) { dy.active = 0; dy.lastAct = Date.now(); if (dy.timeUp) { delete dy.end; delete dy.timeUp; } }
  }
  document.body.classList.toggle('syll', S.set.syll);
  unlock().then(loadContent).then((c) => { C = c; pickedWorlds = S.worlds.slice(); route(); flushOutbox(); checkTutor(); })
    .catch((e) => { app.innerHTML = `<div class="boot">Не получилось загрузить уроки. Проверь интернет и обнови страницу.<br><small>${esc(e.message)}</small></div>`; });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
