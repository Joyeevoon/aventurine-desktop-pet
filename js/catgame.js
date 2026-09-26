/* 🐱 猫糕牌 —— 翻牌配对小游戏
 * 规则：一堆卡牌背面朝上，每次翻开 2 张：
 *   - 两张一样 → 配对成功（保持翻开）
 *   - 不一样 → 翻回去
 * 目标：全部配对完成。记录「翻开次数」。
 */
window.CatGame = (function () {

  /* 10 种猫糕牌面，每局随机抽 8 种使用 */
  const CATS = Array.from({ length: 10 }, (_, i) => 'assets/cats/cat' + (i + 1) + '.webp');

  let grid, flipsEl, pairsEl, bestEl;
  let deck = [];            // {cat, matched, el}
  let firstPick = null;     // 第一张翻开的牌索引
  let lock = false;         // 两张比对期间锁操作
  let flipCount = 0;        // 翻开次数
  let matchedPairs = 0;
  let say = null;
  let onFlip = null;

  function init(elements, opts) {
    grid = elements.grid;
    flipsEl = elements.flips;
    pairsEl = elements.pairs;
    bestEl = elements.best;
    say = opts.say;
    onFlip = opts.onFlip;
    newRound(true);
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function newRound(silent) {
    deck = [];
    matchedPairs = 0;
    flipCount = 0;
    firstPick = null;
    lock = false;
    grid.innerHTML = '';

    const cats = shuffle(CATS.slice()).slice(0, 8);
    const cards = shuffle(cats.concat(cats));
    cards.forEach((cat, i) => {
      const el = document.createElement('button');
      el.className = 'cat-card';
      el.innerHTML = '<span class="cc-back">🐾</span><span class="cc-face"><img src="' + cat + '" alt="猫糕" draggable="false"></span>';
      el.addEventListener('click', () => tap(i));
      grid.appendChild(el);
      deck.push({ cat, matched: false, el });
    });
    updateHud();
    if (!silent) say && say(['新一局。翻开两张，一样的就能配成对——比的就是记性，朋友。']);
  }

  function updateHud() {
    flipsEl.textContent = flipCount;
    pairsEl.textContent = matchedPairs + ' / 8';
    const best = parseInt(localStorage.getItem('golden-deskmate:catBest') || '0', 10);
    if (matchedPairs === 8 && flipCount > 0 && (best === 0 || flipCount < best)) {
      localStorage.setItem('golden-deskmate:catBest', String(flipCount));
    }
    const b = parseInt(localStorage.getItem('golden-deskmate:catBest') || '0', 10);
    bestEl.textContent = b > 0 ? b + ' 次' : '—';
  }

  function tap(i) {
    const card = deck[i];
    if (lock || card.matched || card.el.classList.contains('open')) return;

    flipCount++;
    card.el.classList.add('open');
    updateHud();

    if (firstPick === null) { firstPick = i; return; }
    if (firstPick === i) return;

    const a = deck[firstPick], b = card;
    lock = true;

    if (a.cat === b.cat) {
      // 配对成功
      setTimeout(() => {
        a.matched = b.matched = true;
        a.el.classList.add('matched');
        b.el.classList.add('matched');
        firstPick = null;
        lock = false;
        matchedPairs++;
        updateHud();
        if (matchedPairs === 8) {
          say && say(['全配对了！' + flipCount + ' 次翻完，记性不错嘛，朋友。', '敬猫糕，敬这个下午。']);
        } else if (matchedPairs % 3 === 0) {
          say && say(['配上一对。手感来了，朋友。']);
        }
      }, 450);
    } else {
      // 不一样 → 翻回去
      setTimeout(() => {
        a.el.classList.remove('open');
        b.el.classList.remove('open');
        firstPick = null;
        lock = false;
        if (flipCount % 8 === 0) {
          say && say(['不急，翻回去也算多看一眼牌面。']);
        }
      }, 750);
    }
  }

  return { init, newRound };
})();
