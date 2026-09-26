/* 角色：可自由拖动；拖动时换成“被拎起”的图 3，松手回到图 1；
 * 说话时切成图 2（张嘴）做嘴部动画。 */
window.Pet = (function () {

  const IMG = { idle: 'assets/idle.webp', talk: 'assets/talk.webp', grab: 'assets/grab.webp' };
  /* 姿态图集：唱歌（麦克风）、喝酒（举杯）——各自一对闭嘴/张嘴帧 */
  const POSES = {
    sing: { idle: 'assets/poses/sing-idle.webp', talk: 'assets/poses/sing-talk.webp' },
    drink: { idle: 'assets/poses/drink-idle.webp', talk: 'assets/poses/drink-sip.webp' }
  };

  let stage, img;
  let dragging = false;
  let speaking = false;
  let pose = null;            // 'sing' | 'drink' | null
  let onDragStart = null;
  let onMoveCb = null;

  function init(stageEl, imgEl, hooks) {
    stage = stageEl; img = imgEl;
    onDragStart = (hooks && hooks.onDragStart) || null;
    onMoveCb = (hooks && hooks.onMove) || null;

    // 用 pointer 事件统一鼠标 / 触摸
    stage.addEventListener('pointerdown', onDown);
    // 右键菜单在 app.js 里接管
    img.addEventListener('dragstart', e => e.preventDefault());
    img.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* 当前姿态下的“闭嘴帧/张嘴帧” */
  function frames() {
    if (pose && POSES[pose]) return POSES[pose];
    return IMG;
  }

  function base() {
    if (dragging) return IMG.grab;
    const f = frames();
    if (speaking) return f.talk;
    return f.idle;
  }

  function apply() {
    const src = base();
    if (!img.src.endsWith(src)) img.src = src;
  }

  let flapTimer = null;
  let flapOn = false;

  /* 姿态循环播放器：挂着姿态期间，闭嘴帧/张嘴帧持续交替（直到姿态收回） */
  let poseTimer = null;
  let poseOn = false;

  function stopPoseCycle() {
    if (poseTimer) { clearInterval(poseTimer); poseTimer = null; }
  }

  function startPoseCycle() {
    stopPoseCycle();
    if (!pose || !POSES[pose]) return;
    poseOn = false;
    const speed = (pose === 'drink') ? 700 : 520;   // 唱歌轻快，饮酒稍缓
    poseTimer = setInterval(() => {
      if (!pose || dragging || speaking) return;    // 说话翻帧优先，拖动时不刷
      poseOn = !poseOn;
      const f = frames();
      img.src = poseOn ? f.talk : f.idle;
    }, speed);
  }

  function setPose(p) {
    if (pose === p) return;
    pose = p;
    stopPoseCycle();
    if (pose && POSES[pose]) {
      img.src = frames().idle;
      if (!dragging && !speaking) startPoseCycle();
    } else {
      apply();
    }
  }

  function setSpeaking(v) {
    if (speaking === v) return;
    speaking = v;
    stopPoseCycle();                      // 朗读翻帧优先接管
    if (flapTimer) { clearInterval(flapTimer); flapTimer = null; }
    if (v && !dragging) {
      // 当前姿态的两帧交替，做出嘴巴开合动画
      flapOn = false;
      flapTimer = setInterval(() => {
        if (!speaking) { clearInterval(flapTimer); flapTimer = null; return; }
        flapOn = !flapOn;
        if (!dragging) {
          const f = frames();
          img.src = flapOn ? f.talk : f.idle;
        }
      }, 170);
      img.src = frames().talk;
    } else {
      apply();
      if (pose && POSES[pose] && !dragging) startPoseCycle();   // 读完继续跟着音乐循环
    }
  }

  let startX = 0, startY = 0, originX = 0, originY = 0, moved = false;

  function onDown(e) {
    if (e.button !== 0) return;              // 仅左键拖动
    if (e.target.closest('.bubble')) return; // 气泡上的点击交给对话引擎
    dragging = true; moved = false;
    startX = e.clientX; startY = e.clientY;

    const r = stage.getBoundingClientRect();
    const parent = stage.offsetParent || document.body;
    const pr = parent.getBoundingClientRect();
    originX = r.left - pr.left;
    originY = r.top - pr.top;

    stage.style.left = originX + 'px';
    stage.style.top = originY + 'px';
    stage.style.bottom = 'auto';
    stage.style.transform = 'none';

    img.classList.add('grabbing');
    stopPoseCycle();
    apply();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      if (!moved) { moved = true; onDragStart && onDragStart(); }
    }
    const parent = stage.offsetParent || document.body;
    const pr = parent.getBoundingClientRect();
    const r = stage.getBoundingClientRect();
    let nx = originX + dx, ny = originY + dy;
    nx = Math.max(8, Math.min(pr.width - r.width - 8, nx));
    ny = Math.max(8, Math.min(pr.height - r.height - 8, ny));
    stage.style.left = nx + 'px';
    stage.style.top = ny + 'px';
    onMoveCb && onMoveCb();
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    img.classList.remove('grabbing');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    apply();
    if (speaking && flapTimer) { img.src = frames().talk; }
    if (!speaking && pose && POSES[pose]) startPoseCycle();
    if (!moved) {
      // 只是点了一下 → 触发“摸头”
      document.dispatchEvent(new CustomEvent('pet:tap'));
    }
  }

  function reset() {
    stage.style.left = '50%';
    stage.style.top = '50%';
    stage.style.bottom = 'auto';
    stage.style.transform = 'translate(-50%,-50%)';
    apply();
  }

  return { init, setSpeaking, setPose, reset, IMG };
})();
