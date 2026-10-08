// Ника и Луна: простые круглые персонажи, эмоции только глазами и ртом (легко анимировать CSS).
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
  function nika(mood) {
    const beak = mood === 'wow' || mood === 'proud'
      ? `<path d="M54 74 L66 74 L60 79Z" fill="#FFB547"/><path d="M55.5 79 L64.5 79 L60 85Z" fill="#F29B2E"/>`
      : `<path d="M54 74 L66 74 L60 83Z" fill="#FFB547"/>`;
    return `<svg viewBox="0 0 120 124" aria-hidden="true">
      <ellipse cx="60" cy="117" rx="30" ry="5" fill="rgba(43,35,80,.10)"/>
      <path d="M28 44 L24 14 L48 32Z" fill="#6B4FD8"/><path d="M92 44 L96 14 L72 32Z" fill="#6B4FD8"/>
      <path d="M94 6 l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="#FFC93C"/>
      <ellipse cx="60" cy="72" rx="42" ry="41" fill="#7C5CFF"/>
      <ellipse cx="60" cy="98" rx="24" ry="15" fill="#C9B8FF"/>
      <path d="M50 96 l3 3 3-3 M58 102 l3 3 3-3 M66 96 l3 3 3-3" stroke="#8F74FF" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="44" cy="62" r="15" fill="#fff"/><circle cx="76" cy="62" r="15" fill="#fff"/>
      ${brows(mood, 44, 76, 44)}
      ${eyes(mood, 44, 76, mood === 'proud' ? 64 : 63, mood === 'proud' ? 8 : 5.6, 0)}
      ${beak}
      <ellipse cx="29" cy="80" rx="6" ry="3.5" fill="#FF8FB1" opacity=".75"/><ellipse cx="91" cy="80" rx="6" ry="3.5" fill="#FF8FB1" opacity=".75"/>
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
