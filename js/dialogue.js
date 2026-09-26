/* 对话播放引擎
 * 规则：
 *  - 打字机逐字显示（galgame 手感）
 *  - 播放中点击 → 立刻显示整句
 *  - 已显完后 0.5s 内点击无效（防手滑）；0.5s 后点击 → 显示下一句
 *  - 每句显完停留 2s 自动进下一句；若没有下一句，则停留 3s 后淡出
 */
window.Dialogue = (function () {

  const TYPE_MS = 42;        // 每字间隔
  const HOLD_MS = 2000;      // 每句停留
  const FINAL_HOLD_MS = 3000;// 末句停留（无下一句时）
  const LOCK_MS = 500;       // 防手滑锁

  let el = { bubble: null, text: null, hint: null, dots: null, stage: null, petImg: null };
  let cfg = null;
  let onMouth = null;        // (isTalking) => void  嘴部动画回调
  let onSentence = null;     // (text) => void       每句开始时触发（接 TTS）

  let queue = [];            // 待播句子
  let current = '';
  let typing = false;
  let shown = false;         // 当前句是否已完整显示
  let lockUntil = 0;
  let holdTimer = null;
  let typeTimer = null;
  let fadeTimer = null;
  let hideTimer = null;
  let active = false;

  function init(elements, config, mouthCb) {
    el = elements; cfg = config; onMouth = mouthCb;
    el.bubble.addEventListener('click', onBubbleClick);
  }

  function setOnSentence(cb) { onSentence = cb; }

  function setCfg(config) { cfg = config; }

  function clearTimers() {
    clearTimeout(holdTimer); holdTimer = null;
    clearTimeout(typeTimer); typeTimer = null;
    clearTimeout(fadeTimer); fadeTimer = null;
    clearTimeout(hideTimer); hideTimer = null;
  }

  /* 播放一组句子（进入队列，若正在说话则排队） */
  function say(lines) {
    const arr = (Array.isArray(lines) ? lines : [lines])
      .filter(x => x && String(x).trim())
      .map(x => String(x).trim());
    if (!arr.length) return;
    const wasIdle = !active && !queue.length;
    queue = queue.concat(arr);
    if (wasIdle) {
      active = true;
      showBubble();
      next();
    } else if (el.bubble.classList.contains('hide')) {
      // 正在淡出时来了新台词：取消淡出，接着播
      clearTimers();
      el.bubble.classList.remove('hide');
      next();
    }
  }

  function showBubble() {
    clearTimers();
    el.bubble.hidden = false;
    el.bubble.classList.remove('hide');
    el.dots.style.display = 'inline-flex';
    el.hint.style.visibility = 'hidden';
  }

  function hideBubble() {
    el.bubble.classList.add('hide');
    hideTimer = setTimeout(() => {
      el.bubble.hidden = true;
      el.bubble.classList.remove('hide');
      el.text.innerHTML = '';
      active = false;
      onMouth && onMouth(false);
      document.dispatchEvent(new CustomEvent('dialogue:idle'));
    }, 380);
  }

  function next() {
    clearTimers();
    if (!queue.length) {
      // 队列空 → 末句停留 3 秒后淡出
      const text = current;
      holdTimer = setTimeout(() => { hideBubble(); }, FINAL_HOLD_MS);
      return;
    }
    current = queue.shift();
    typeSentence();
  }

  function typeSentence() {
    typing = true; shown = false;
    el.text.innerHTML = '';
    el.hint.style.visibility = 'hidden';
    el.dots.style.display = 'inline-flex';
    el.stage && el.stage.classList.add('speaking');
    onMouth && onMouth(true);
    onSentence && onSentence(current);   // 同步朗读这句话

    let i = 0;
    const full = current;
    const caret = '<span class="caret"></span>';

    const step = () => {
      if (!typing) return;
      if (i >= full.length) {
        finishSentence();
        return;
      }
      i++;
      el.text.innerHTML = escapeHtml(full.slice(0, i)) + caret;
      typeTimer = setTimeout(step, TYPE_MS);
    };
    step();
  }

  function finishSentence() {
    typing = false; shown = true;
    lockUntil = Date.now() + LOCK_MS;
    el.text.innerHTML = escapeHtml(current);
    el.dots.style.display = 'none';
    el.hint.style.visibility = 'visible';
    el.stage && el.stage.classList.remove('speaking');
    onMouth && onMouth(false);
    // 已显完：有下一句 → 2 秒后进；没有下一句 → 停 3 秒后淡出
    holdTimer = setTimeout(() => {
      if (!active) return;
      if (queue.length) next();
      else hideBubble();
    }, queue.length ? HOLD_MS : FINAL_HOLD_MS);
  }

  function onBubbleClick() {
    if (!active) return;
    // 正在打字 → 立刻显示整句
    if (typing) {
      typing = false;
      clearTimeout(typeTimer);
      finishSentence();
      return;
    }
    // 已显完 → 0.5 秒内点击无效
    if (shown) {
      if (Date.now() < lockUntil) return;
      clearTimers();
      next();
    }
  }

  function sayImmediate(line) {
    // 用于按钮/菜单触发的即时台词：清空队列后播
    queue = [];
    clearTimers();
    const prev = current;
    active = true;
    el.bubble.hidden = false;
    el.bubble.classList.remove('hide');
    queue = [String(line).trim()];
    current = prev;
    next();
  }

  function stopAll() {
    clearTimers();
    typing = false; shown = false; active = false;
    queue = [];
    el.bubble.hidden = true;
    el.text.innerHTML = '';
    el.stage && el.stage.classList.remove('speaking');
    onMouth && onMouth(false);
    onSentence = onSentence; // 保留回调
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function isBusy() { return active; }

  return { init, setCfg, say, sayImmediate, stopAll, isBusy, setOnSentence };
})();
