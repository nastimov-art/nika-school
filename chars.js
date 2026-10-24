// Ника (котёнок) и Луна (лисичка): простые круглые персонажи, эмоции только глазами и ртом (легко анимировать CSS).
// moods: happy, proud, wow, think, support
(function () {
  const INK = '#2B2350';

  function eyes(mood, lx, rx, y, r, pupil) {
    if (mood === 'proud') {
      return `<g class="eyes"><path d="M${lx - r} ${y + 2} Q${lx} ${y - r} ${lx + r} ${y + 2}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
        `<path d="M${rx - r} ${y + 2} Q${rx} ${y - r} ${rx + r} ${y + 2}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/></g>`;
    }
    const dx = mood === 'think' ? 3 : 0, dy = mood === 'think' ? -4 : mood === 'wow' ? -1 : 1;
    const big = mood === 'wow' ? 1.12 : 1;
    const one = (x) => (pupil
      ? `<ellipse cx="${x}" cy="${y}" rx="${r * big}" ry="${(r + 1) * big}" fill="#fff"/><circle cx="${x + dx}" cy="${y + dy}" r="${pupil}" fill="${INK}"/><circle cx="${x + dx + 2.2}" cy="${y + dy - 2.4}" r="2.1" fill="#fff"/>`
      : `<ellipse cx="${x + dx / 2}" cy="${y + dy / 2}" rx="${r * big}" ry="${(r + 1.5) * big}" fill="${INK}"/><circle cx="${x + dx / 2 + 1.8}" cy="${y + dy / 2 - 2.4}" r="1.8" fill="#fff"/>`);
    return `<g class="eyes">${one(lx)}${one(rx)}</g>`;
  }

  function mouth(mood, cx, y, w) {
    const s = `stroke="${INK}" stroke-width="3.6" fill="none" stroke-linecap="round"`;
    if (mood === 'wow') return `<ellipse cx="${cx}" cy="${y + 3}" rx="4.6" ry="5.6" fill="${INK}"/>`;
    if (mood === 'think') return `<path d="M${cx - 5} ${y + 4} L${cx + 6} ${y + 2}" ${s}/>`;
    if (mood === 'proud') return `<path d="M${cx - w} ${y} Q${cx} ${y + 13} ${cx + w} ${y} Z" fill="${INK}"/><path d="M${cx - w / 2} ${y + 6} Q${cx} ${y + 10} ${cx + w / 2} ${y + 6}" fill="#FF8FB1"/>`;
    if (mood === 'support') return `<path d="M${cx - w * 0.7} ${y + 2} Q${cx} ${y + 8} ${cx + w * 0.7} ${y + 2}" ${s}/>`;
    return `<path d="M${cx - w} ${y} Q${cx} ${y + 11} ${cx + w} ${y}" ${s}/>`;
  }

  function brows(mood, lx, rx, y) {
    const s = `stroke="${INK}" stroke-width="3" stroke-linecap="round"`;
    if (mood === 'support') return `<path d="M${lx - 7} ${y + 3} L${lx + 6} ${y}" ${s}/><path d="M${rx + 7} ${y + 3} L${rx - 6} ${y}" ${s}/>`;
    if (mood === 'wow') return `<path d="M${lx - 7} ${y - 2} Q${lx} ${y - 7} ${lx + 7} ${y - 2}" ${s} fill="none"/><path d="M${rx - 7} ${y - 2} Q${rx} ${y - 7} ${rx + 7} ${y - 2}" ${s} fill="none"/>`;
    if (mood === 'think') return `<path d="M${rx - 7} ${y - 1} L${rx + 7} ${y - 4}" ${s}/>`;
    return '';
  }

  // Ника: совёнок (выбрала Кира 08.10.2026). Настроение: глаза, брови, клюв.
  // Ника-котёнок (выбрана Настей 24.10 вместо совы, без звёздочки). Эмоции глазами, ртом, бровями и позой лап.
  function kEyes(m, lx, rx, y, r) {
    if (m === 'proud') return `<g class="eyes"><path d="M${lx - r} ${y + 3} Q${lx} ${y - r - 2} ${lx + r} ${y + 3}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M${rx - r} ${y + 3} Q${rx} ${y - r - 2} ${rx + r} ${y + 3}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/></g>`;
    const big = m === 'wow' ? 1.18 : 1, dx = m === 'think' ? 3 : 0, dy = m === 'think' ? -3 : 0;
    const one = (x) => `<ellipse cx="${x + dx}" cy="${y + dy}" rx="${r * big}" ry="${r * 1.25 * big}" fill="${INK}"/><circle cx="${x + dx + r * 0.35}" cy="${y + dy - r * 0.45}" r="${r * 0.38}" fill="#fff"/><circle cx="${x + dx - r * 0.3}" cy="${y + dy + r * 0.45}" r="${r * 0.16}" fill="#fff"/>`;
    return `<g class="eyes">${one(lx)}${one(rx)}</g>`;
  }
  function kMouth(m, cx, y) {
    const s = `stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    if (m === 'wow') return `<ellipse cx="${cx}" cy="${y + 5}" rx="6" ry="7.5" fill="${INK}"/><ellipse cx="${cx}" cy="${y + 8}" rx="3.5" ry="3" fill="#FF8FB1"/>`;
    if (m === 'think') return `<path d="M${cx - 7} ${y + 5} Q${cx} ${y + 2} ${cx + 8} ${y + 4}" ${s}/>`;
    if (m === 'support') return `<path d="M${cx - 9} ${y + 2} Q${cx - 4.5} ${y + 8} ${cx} ${y + 2} Q${cx + 4.5} ${y + 8} ${cx + 9} ${y + 2}" ${s}/>`;
    return `<path d="M${cx - 11} ${y} Q${cx} ${y + 16} ${cx + 11} ${y} Z" fill="${INK}"/><path d="M${cx - 6} ${y + 8} Q${cx} ${y + 13} ${cx + 6} ${y + 8}" fill="#FF8FB1"/>`;
  }
  function kBrows(m, lx, rx, y) {
    const s = `stroke="${INK}" stroke-width="3.5" stroke-linecap="round" fill="none"`;
    if (m === 'support') return `<path d="M${lx - 8} ${y + 4} L${lx + 7} ${y}" ${s}/><path d="M${rx + 8} ${y + 4} L${rx - 7} ${y}" ${s}/>`;
    if (m === 'wow') return `<path d="M${lx - 8} ${y - 3} Q${lx} ${y - 9} ${lx + 8} ${y - 3}" ${s}/><path d="M${rx - 8} ${y - 3} Q${rx} ${y - 9} ${rx + 8} ${y - 3}" ${s}/>`;
    if (m === 'think') return `<path d="M${lx - 8} ${y} L${lx + 7} ${y - 2}" ${s}/><path d="M${rx - 7} ${y - 6} Q${rx} ${y - 10} ${rx + 8} ${y - 5}" ${s}/>`;
    return '';
  }
  function kExtras(m) {
    if (m === 'wow') return `<path class="spark" d="M28 52 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="#FFC64A"/><path class="spark" d="M170 40 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#FF8FB1"/><path class="spark" d="M178 104 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#7B61FF"/>`;
    if (m === 'proud') return `<g class="floaty"><path d="M24 40 l5 11 12 2 -9 8 2 12 -10 -6 -10 6 2 -12 -9 -8 12 -2z" fill="#FFC64A"/><path d="M168 30 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1z" fill="#FFC64A"/></g>`;
    if (m === 'think') return `<g class="floaty"><circle cx="170" cy="44" r="20" fill="#fff" stroke="#E2DCFB" stroke-width="3"/><text x="170" y="53" font-family="Nunito, sans-serif" font-weight="900" font-size="26" text-anchor="middle" fill="#7B61FF">?</text><circle cx="150" cy="70" r="5" fill="#fff" stroke="#E2DCFB" stroke-width="2"/></g>`;
    if (m === 'support') return `<path class="heart" d="M170 58 c-6 -10 -20 -6 -18 5 c2 9 18 18 18 18 s16 -9 18 -18 c2 -11 -12 -15 -18 -5z" fill="#FF6B8B"/>`;
    return '';
  }
  function kArms(m, col) {
    const a = (x, y, rot) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="17" fill="${col}" transform="rotate(${rot} ${x} ${y})"/>`;
    if (m === 'happy' || m === 'proud') return a(54, 134, 40) + a(146, 134, -40);
    if (m === 'support') return a(70, 158, -50) + a(130, 158, 50);
    if (m === 'think') return a(60, 156, 20) + a(126, 130, -150);
    return a(60, 156, 25) + a(140, 156, -25);
  }
  function nika(m) {
    const B = '#FFF1E2', SH = '#F5D9BE', IN = '#FFB3C7', ST = '#C9B8FF';
    return `<svg viewBox="0 0 200 200" aria-hidden="true"><ellipse cx="100" cy="193" rx="52" ry="7" fill="rgba(60,40,160,.12)"/>
      <path class="tail" d="M138 172 C176 170 178 128 160 112" stroke="${SH}" stroke-width="15" fill="none" stroke-linecap="round"/>
      <ellipse cx="100" cy="158" rx="45" ry="36" fill="${B}"/><ellipse cx="100" cy="166" rx="27" ry="22" fill="#fff"/>
      <ellipse cx="80" cy="190" rx="15" ry="8" fill="${SH}"/><ellipse cx="120" cy="190" rx="15" ry="8" fill="${SH}"/>
      ${kArms(m, SH)}
      <g class="head">
        <g class="ear-l"><path d="M50 74 L44 24 L88 50 Z" fill="${B}" stroke="${B}" stroke-width="10" stroke-linejoin="round"/><path d="M55 64 L52 36 L76 52 Z" fill="${IN}" stroke="${IN}" stroke-width="4" stroke-linejoin="round"/></g>
        <g class="ear-r"><path d="M150 74 L156 24 L112 50 Z" fill="${B}" stroke="${B}" stroke-width="10" stroke-linejoin="round"/><path d="M145 64 L148 36 L124 52 Z" fill="${IN}" stroke="${IN}" stroke-width="4" stroke-linejoin="round"/></g>
        <ellipse cx="100" cy="94" rx="62" ry="52" fill="${B}"/>
        <path d="M90 46 Q92 56 90 62 M100 44 L100 60 M110 46 Q108 56 110 62" stroke="${ST}" stroke-width="5" stroke-linecap="round" fill="none"/>
        <ellipse cx="66" cy="112" rx="11" ry="7" fill="${IN}" opacity=".7"/><ellipse cx="134" cy="112" rx="11" ry="7" fill="${IN}" opacity=".7"/>
        ${kBrows(m, 77, 123, 78)}${kEyes(m, 77, 123, 96, 10)}
        <path d="M96 107 h8 l-4 5z" fill="#FF8FB1" stroke="#FF8FB1" stroke-width="3" stroke-linejoin="round"/>
        ${kMouth(m, 100, m === 'support' ? 111 : 113)}
        <path d="M44 104 L22 100 M44 112 L24 116 M156 104 L178 100 M156 112 L176 116" stroke="${SH}" stroke-width="3" stroke-linecap="round"/>
      </g>${kExtras(m)}
    </svg>`;
  }

  function luna(mood) {
    return `<svg viewBox="0 0 120 124" aria-hidden="true">
      <ellipse cx="60" cy="117" rx="28" ry="5" fill="rgba(43,35,80,.10)"/>
      <g class="tail"><ellipse cx="99" cy="86" rx="13" ry="25" transform="rotate(38 99 86)" fill="#FF8A3D"/>
      <ellipse cx="110" cy="70" rx="7" ry="10" transform="rotate(38 110 70)" fill="#FFF3E6"/></g>
      <path d="M28 52 L34 12 L58 36Z" fill="#FF8A3D"/><path d="M92 52 L86 12 L62 36Z" fill="#FF8A3D"/>
      <path d="M34 42 L37 22 L50 36Z" fill="#FFD3B5"/><path d="M86 42 L83 22 L70 36Z" fill="#FFD3B5"/>
      <ellipse cx="60" cy="72" rx="41" ry="39" fill="#FF8A3D"/>
      <path d="M26 82 Q60 66 94 82 Q90 108 60 110 Q30 108 26 82Z" fill="#FFF3E6"/>
      ${brows(mood, 46, 74, 52)}
      ${eyes(mood, 46, 74, 66, 5.2, 0)}
      <ellipse cx="60" cy="80" rx="5.4" ry="3.8" fill="${INK}"/>
      <ellipse cx="34" cy="80" rx="5" ry="3" fill="#FF6F91" opacity=".55"/><ellipse cx="86" cy="80" rx="5" ry="3" fill="#FF6F91" opacity=".55"/>
      ${mouth(mood, 60, 86, 6)}
    </svg>`;
  }

  window.Chars = {
    html(who, mood, cls) {
      const m = mood || 'happy';
      return `<div class="char char-${who} ${cls || ''}" data-mood="${m}">${who === 'luna' ? luna(m) : nika(m)}</div>`;
    }
  };
})();
