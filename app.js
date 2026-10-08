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
  const GENERIC_HINTS = ['Прочитай задание ещё раз. Можно нажать 🔊, и я прочитаю.', 'Ответ прячется в тексте или на картинке. Найди нужное место пальцем.'];

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
      parent: { pin: '', comment: '', notes: '', unlockAll: false }, set: { syll: false } };
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return Object.assign(blankState(), s); } catch (e) { /* пусто */ }
    return blankState();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* хранилище недоступно */ } }

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
    if (!S.set.syll || lang === 'en') return t;
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
    const [program, words, errors, ...files] = await Promise.all([get(idx.program), get(idx.words), get(idx.errors), ...idx.lessons.map(get)]);
    const lessons = files.flatMap((f) => f.lessons);
    const skills = program.skills;
    const skillById = Object.fromEntries(skills.map((s) => [s.id, s]));
    const wordById = Object.fromEntries(words.words.map((w) => [w.id, w]));
    return { program, tracks: program.tracks, worlds: program.worlds, skills, skillById, lessons, words: words.words, wordById, errors };
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
    const ds = dueSkills(), dw = dueWords();
    const main = mainPick();
    const msg = S.parent.comment ? S.parent.comment : pick([
      'Сегодня немного, но по-настоящему. Выбирай, с чего начнём.',
      'Если станет трудно, нажимай 💡. Это не стыдно, так учатся.',
      'Луна принесла новые задания. Посмотрим?'
    ]);
    let h = `<div class="hello"><div class="duo">${Chars.html('nika', 'happy')}${Chars.html('luna', 'happy', 'md')}</div>
      <div class="bubble"><div class="tag">${S.parent.comment ? 'Записка от мамы' : 'Ника'}</div><div>Привет, ${esc(S.name || 'друг')}! ${rich(msg)}</div></div></div>`;
    h += '<div class="cards">';
    if (ds.length || dw.length) {
      const what = [...ds.map((s) => s.title), dw.length ? `слова (${dw.length})` : ''].filter(Boolean).join(', ');
      h += `<button class="task-card" data-go="#/review"><div class="pic" style="background:var(--sun-l)">🔁</div>
        <div><span class="tag yellow">3 минуты</span><div class="t">Вспомним</div><div class="m">${esc(what)}</div></div><div class="go">➜</div></button>`;
    }
    if (main) h += lessonCard(main, 'Главное сегодня');
    h += '</div>';
    h += '<h2>Что хочется?</h2><div class="tiles">';
    const tiles = [['reading', '📖', 'История'], ['math', '🔢', 'Числа'], ['words', '🔤', 'Слова'], ['english', '🌍', 'English'], ['logic', '🧩', 'Загадка'], ['create', '🎨', 'Создать'], ['book', '📚', 'Моя книга']];
    for (const [tid, e, t] of tiles) {
      const tr = track(tid === 'book' ? 'reading' : tid);
      h += `<button class="tile" style="background:${tr.color}" data-tile="${tid}"><span class="e">${e}</span>${t}</button>`;
    }
    h += '</div>';
    return shell('today', h);
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
  function showShot(blob) {
    const url = URL.createObjectURL(blob);
    const d = new Date(), name = `домашка_${dstr(d)}_${z(d.getHours())}-${z(d.getMinutes())}.${blob.type === 'application/pdf' ? 'pdf' : 'jpg'}`;
    document.getElementById('camwrap').innerHTML = `${blob.type.startsWith('image') ? `<img class="shot" src="${url}" alt="Фото задания">` : '<p>Файл выбран.</p>'}
      <div class="pfoot"><a class="btn green" href="${url}" download="${name}">💾 Сохранить для мамы</a><button class="btn soft" data-go="#/homework">Переснять</button></div>
      <p class="sub">Файл сохранится в папку «Загрузки». Скажи маме, что там новое задание.</p>`;
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
    P.ts = { wrongs: 0, hints: 0, revealed: false, solved: false, errs: [], listenedAfterWrong: false, input: '', wrongOpts: [], ans: [], pool: [], fixed: 0, matched: [], sel: null };
    if (t.type === 'order') P.ts.pool = shuffle(t.items.map((x, i) => ({ x, i })));
    if (t.type === 'choice') P.ts.opts = t.keepOrder ? t.options : shuffle(t.options);
    if (t.type === 'match') { P.ts.left = shuffle(t.pairs.map((p, i) => ({ x: p[0], i }))); P.ts.right = shuffle(t.pairs.map((p, i) => ({ x: p[1], i }))); }
    renderPlayer();
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
        <div class="w">${rich(w.word)} ${sayBtn(w.word)}</div><div class="d">${rich(w.simple)}</div>
        <div class="ex">${rich(w.example)} ${sayBtn(w.example)}</div></div>`;
    } else {
      if (t.q) body += `<p class="q">${rich(t.q, t.qLang)} ${sayBtn(t.q, t.qLang || 'ru')}</p>`;
      if (t.text) body += `<div class="reading">${sayBtn(t.text, lang, 'say')}${rich(t.text, lang)}</div>`;
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
    if (ts.revealed) body += `<div class="hintbox"><b>👀 Ответ:</b><span>${rich(answerText(t))}. Теперь сделай это сама.</span></div>`;

    let foot = '';
    if (t.type === 'info' || t.type === 'word') foot = `<button class="btn" data-act="next">Дальше</button>`;
    else if (t.type === 'say') foot = `<button class="btn green" data-act="next">${esc(t.done || 'Готово')}</button>`;
    else if (!ts.solved) {
      const canHint = !ts.revealed;
      if (canHint) foot += `<button class="btn yellow" data-act="hint">💡 Мне трудно</button>`;
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
  const WRONG = ['Почти. Давай посмотрим ещё раз.', 'Не совсем. Прочитай ещё раз, можно нажать 🔊.', 'Хм, не то. Попробуй другой вариант.'];

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
      wrongs: ts.wrongs, hints: ts.hints, revealed: ts.revealed, cond: ts.listenedAfterWrong, errs: ts.errs, review: P.mode === 'review' });
    const msg = ts.revealed || ts.hints ? pick(PRAISE_HINT) : ts.wrongs ? pick(PRAISE_RETRY) : pick(PRAISE_CLEAN);
    renderPlayer(`<div class="feedback"><div class="in">${Chars.html('nika', 'proud', 'sm')}<div class="msg">${esc(msg)}${t.why ? `<div class="why">${rich(t.why)}</div>` : ''}</div>
      <button class="btn green" data-act="next" autofocus>Дальше</button></div></div>`);
    const b = document.querySelector('.feedback .btn'); if (b) b.focus();
  }
  function nextStep() {
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
    const nxt = P.mode === 'lesson' ? nextInTrack(skillOf(P.lesson).track) : null;
    P = null;
    app.innerHTML = `<main class="player done-screen"><div class="duo">${Chars.html('nika', 'proud', 'jump')}${Chars.html('luna', 'happy', 'md jump')}</div>
      <h1>Готово!</h1>${lines}
      <div class="pfoot"><button class="btn" data-go="#/today">На главную</button>${nxt ? `<button class="btn soft" data-go="#/lesson/${nxt.id}">Ещё: ${esc(nxt.title)}</button>` : ''}</div></main>`;
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
    if (act === 'hint') {
      const hints = t.hints && t.hints.length ? t.hints : GENERIC_HINTS;
      if (ts.hints < hints.length) { ts.hints++; P.hints++; } else ts.revealed = true;
      renderPlayer(); return;
    }
    if (act === 'next') { nextStep(); return; }
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
    const views = { today: viewToday, map: () => viewMap(arg), skills: viewSkills, homework: viewHomework, parent: viewParent };
    app.innerHTML = (views[page] || viewToday)();
    window.scrollTo(0, 0);
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
    if (el.dataset.tile) {
      const tid = el.dataset.tile;
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
    if (act === 'forgetkey') { localStorage.removeItem(KEYSTORE); location.reload(); return; }
    if (act === 'newpin') { S.parent.pin = ''; save(); parentOk = false; route(); return; }
    if (act === 'reset') { if (confirm('Стереть весь прогресс? Сначала лучше выгрузить его.')) { localStorage.removeItem(KEY); S = blankState(); parentOk = false; location.hash = '#/onboarding/1'; } return; }
  });
  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.manual) { const s = sk(el.dataset.manual); s.manual = el.value === '' ? undefined : +el.value; save(); app.innerHTML = viewParent(); return; }
    if (el.dataset.act === 'unlock') { S.parent.unlockAll = el.checked; save(); return; }
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
  unlock().then(loadContent).then((c) => { C = c; pickedWorlds = S.worlds.slice(); route(); })
    .catch((e) => { app.innerHTML = `<div class="boot">Не получилось загрузить уроки. Проверь интернет и обнови страницу.<br><small>${esc(e.message)}</small></div>`; });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
