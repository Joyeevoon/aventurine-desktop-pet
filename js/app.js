/* 主控：把桌宠、对话引擎、语音、LLM、小游戏与各项功能接起来 */
(function () {

  const STATE_KEY = 'golden-deskmate:state';
  const MEMORY_THRESHOLDS = [15, 35, 55, 75, 95]; // 好感解锁内心独白
  const IDLE_MS = 55000;                          // 待机自言自语
  const AFF_MAX = 100;

  let cfg = CONFIG.load();
  let state = loadState();
  let idleTimer = null;
  let pending = false;

  const $ = s => document.querySelector(s);

  /* ---------- state ---------- */
  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) return Object.assign({ affection: 0, unlocked: [], turns: 0 }, JSON.parse(raw));
    } catch (e) {}
    return { affection: 0, unlocked: [], turns: 0 };
  }
  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg, ms = 1800) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  /* ---------- affection ---------- */
  function affLevel() {
    let lv = 0;
    MEMORY_THRESHOLDS.forEach(th => { if (state.affection >= th) lv++; });
    return lv; // 0..5
  }
  function renderAffection() {
    const lv = affLevel();
    $('#affLabel').textContent = `好感 ${state.affection}`;
    const hearts = $('#hearts');
    hearts.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const i2 = document.createElement('i');
      if (i < lv) i2.className = 'on';
      hearts.appendChild(i2);
    }
    // 解锁新的内心独白：一次只处理“本次新跨过的最高档”，避免重复弹/重复念
    let newly = null;
    for (let i = 0; i < MEMORY_THRESHOLDS.length; i++) {
      const key = 'm' + (i + 1);
      if (state.affection >= MEMORY_THRESHOLDS[i] && !state.unlocked.includes(key)) {
        state.unlocked.push(key);
        newly = i;                       // 记住最高档（循环继续会覆盖为更大 i）
      }
    }
    if (newly !== null) {
      saveState();
      // 会话内去重：同一档独白本次打开页面只播一次
      playMemoryOnce(newly);
    }
  }

  const _playedMemories = new Set();
  function playMemoryOnce(i) {
    if (_playedMemories.has(i)) return;
    _playedMemories.add(i);
    const m = PERSONA.MEMORIES[i];
    toast(`✨ 解锁内心独白：${m.tag}`);
    setTimeout(() => {
      Dialogue.sayImmediate([m.text]);
    }, 900);
  }
  function addAffection(n) {
    state.affection = Math.max(0, Math.min(AFF_MAX, state.affection + n));
    saveState();
    renderAffection();
  }

  /* ---------- time ---------- */
  function renderTime() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const slot = PERSONA.greetingSlot(now);
    $('#timeLabel').textContent = `${hh}:${mm} · ${PERSONA.TIME_CHIP[slot].label}`;
  }

  /* ---------- idle ---------- */
  function armIdle() {
    clearTimeout(idleTimer);
    if (!cfg.idleOn) return;
    idleTimer = setTimeout(() => {
      if (Dialogue.isBusy()) { armIdle(); return; }
      Dialogue.say([PERSONA.idleLine()]);
      quipLast = Date.now();
      armIdle();
    }, IDLE_MS);
  }

  /* ---------- speaking pipeline ---------- */
  let voiceThisTurn = false;   // 仅「英语输入 → 英语回复」为 true，其余状态不调用 TTS
  let quipLast = 0;            // 小台词节流（摸头/拖动/待机等）

  function speakSentences(lines) {
    const arr = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
    if (!arr.length) return;
    Dialogue.say(arr);
  }

  /* 小台词：4 秒内不重复播，防止连点造成重复观感 */
  function quip(lines) {
    const now = Date.now();
    if (now - quipLast < 4000) return false;
    quipLast = now;
    speakSentences(lines);
    return true;
  }

  /* 唱歌口令：「换一首/下一首」切歌，其余随机 */
  const SING_RE = /唱歌|唱首|唱一个|唱一句|来一首|来首歌|放首歌|放一首|换一首|换首歌|下一首|切歌|换歌|sing|music/i;
  const NEXT_RE = /换一首|换首歌|下一首|切歌|换歌/;

  function handleSing(v) {
    let t;
    if (NEXT_RE.test(v)) {
      t = Music.next();
    } else {
      t = Music.playRandom();
    }
    syncMusicUI(Music.TRACKS.indexOf(t));
    Pet.setPose(Music.isPlaying() ? 'sing' : null);   // 音乐在播才挂唱歌姿态
    const line = NEXT_RE.test(v)
      ? '换一首——这首《' + t.title + '》，接着听。'
      : '好，那这首《' + t.title + '》——敬这个不用勾心斗角的下午。';
    Dialogue.say([line]);
    armIdle();
  }

  /* 判断文本是否主要是英语（拉丁字母占比 ≥ 60%） */
  function isEnglishText(t) {
    const s = String(t).replace(/[\s\d\p{P}\p{S}]+/gu, '');
    if (!s) return false;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    return latin / s.length >= 0.6;
  }

  async function askLLM(userText) {
    if (pending) return;
    if (!cfg.apiKey) { openSetup(); return; }   // 没填 Key 先引导
    pending = true;
    $('#sendBtn').disabled = true;

    const isEnglish = isEnglishText(userText);
    if (isEnglish) voiceThisTurn = true;   // 整轮（含后续气泡）都允许朗读，播完自动复位

    try {
      // 先看是否命中本地诵读库：命中则原文直出，完全不经过模型（绝不编造/重复）
      const poem = (isEnglish ? null : window.RECITE ? RECITE.match(userText) : null);
      if (poem) {
        LLM.push('user', userText);
        const lines = RECITE.recite(poem);
        LLM.push('assistant', RECITE.asText(poem));
        speakSentences(lines);
        return;
      }

      LLM.push('user', userText);
      const res = await LLM.request(userText, { english: isEnglish });

      if (res.ok) {
        LLM.push('assistant', res.text);
        speakSentences(LLM.toSentences(res.text, LLM.isRecite(userText)));
      } else {
        const fb = localReply(userText);
        speakSentences(fb);
        if (!isEnglish) toast('API 未连通，先用本地话术陪你');
      }
    } catch (e) {
      // 任何意外都要恢复状态，避免卡死后续发送
      speakSentences(localReply(userText));
    } finally {
      if (!isEnglish) voiceThisTurn = false;
      pending = false;
      $('#sendBtn').disabled = false;
      armIdle();
    }
  }

  /* 本地兜底话术：关键词 + 随机 */
  function localReply(text) {
    const t = String(text);
    const isEn = isEnglishText(t);
    const now = new Date();
    if (isEn) {
      if (/^\s*(hi|hello|hey)\b/i.test(t)) return ['Oh, hello there, friend. The tide just turned perfect for company.'];
      if (/name|who are you/i.test(t)) return ['Aventurine—just Aventurine, while the holiday lasts.'];
      if (/sad|tired|stressed/i.test(t)) return ['Then put it all down for a while, friend. Sit with me—the sea will handle the rest.'];
      if (/sea|beach|ocean/i.test(t)) return ['The water suits you, friend. Shall we stay till the sun dips?'];
      return [PERSONA.pick(PERSONA.LOCAL_EN)];
    }
    if (/你好|您好|在吗|嗨/i.test(t)) return [PERSONA.opening(now)];
    if (/名字|你是谁|谁啊/.test(t)) return ['砂金。度假期间不用加头衔，朋友。'];
    if (/累|难过|烦|不开心|压力/.test(t)) return ['那就把工作先放一放。坐会儿，海风会替你处理。'];
    if (/喜欢|爱|想你/.test(t)) return ['这句话的热意有点高，朋友。我先收下了。'];
    if (/晚安|睡|困/.test(t)) return ['晚安，朋友。夜里的海我替你看着。'];
    if (/谢谢|谢了/.test(t)) return ['不必客气，度假搭档之间不算账。'];
    if (/海|天气|沙滩/.test(t)) return ['海风今天很配合，适合什么都不做。'];
    return [PERSONA.pick(PERSONA.LOCAL_ZH)];
  }

  /* ---------- menus / panels ---------- */
  function closeAllPanels() {
    ['#memoryPanel', '#settingsPanel', '#musicPanel', '#setupPanel'].forEach(s => {
      const el = $(s); if (el) el.hidden = true;
    });
  }
  function openPanel(sel) { closeAllPanels(); $(sel).hidden = false; }

  function buildCtx(x, y) {
    const m = $('#ctxMenu');
    m.innerHTML = '';
    const items = [
      ['catgame', '🐱', '猫糕牌 · 翻牌配对'],
      ['idle', '🌊', '让他随便聊聊'],
      ['greet', '🌅', '按时段问候'],
      ['drink', '🍸', '请他喝一杯'],
      ['memory', '✨', '内心独白'],
      ['sep'],
      ['reset', '🎯', '让他站回原位'],
      ['voice', cfg.voiceOn ? '🔊' : '🔇', cfg.voiceOn ? '语音：开（英语时出声）' : '语音：关'],
      ['settings', '⚙', '设置']
    ];
    items.forEach(it => {
      if (it[0] === 'sep') { const d = document.createElement('div'); d.className = 'sep'; m.appendChild(d); return; }
      const b = document.createElement('button');
      b.dataset.act = it[0];
      b.innerHTML = `<span style="font-size:14px">${it[1]}</span><span>${it[2]}</span>`;
      m.appendChild(b);
    });
    m.hidden = false;
    const r = m.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth - r.width - 10);
    const py = Math.min(y, window.innerHeight - r.height - 10);
    m.style.left = px + 'px';
    m.style.top = py + 'px';
  }
  function hideCtx() { $('#ctxMenu').hidden = true; }

  function handleAction(act) {
    hideCtx();
    switch (act) {
      case 'idle':
        quip([PERSONA.pick(PERSONA.QUICK.idle)]);
        break;
      case 'greet': {
        const g = PERSONA.greeting();
        quip([g.text]);
        break;
      }
      case 'drink': {
        addAffection(3);
        playDrinkPose();
        // 节流：8 秒内重复请酒不重复念台词，只加好感+姿态
        const now = Date.now();
        if (!handleAction._lastDrink || now - handleAction._lastDrink > 8000) {
          handleAction._lastDrink = now;
          quip([PERSONA.pick(PERSONA.QUICK.drink)]);
        } else {
          handleAction._lastDrink = now;
          toast('🍸 他抿了一口，冲你笑了笑（好感 +3）');
        }
        break;
      }
      case 'catgame':
        openPanel('#catPanel');
        CatGame.newRound();
        break;
      case 'memory':
        openPanel('#memoryPanel');
        renderMemories();
        break;
      case 'music':
        openPanel('#musicPanel');
        syncMusicUI(Music.TRACKS.findIndex(t => t.title === ($('#npTitle').textContent || '')));
        break;
      case 'reset':
        Pet.reset();
        quip(['挪回来站正。这个位置，看海最舒服。']);
        break;
      case 'voice':
        cfg.voiceOn = !cfg.voiceOn;
        CONFIG.save(cfg);
        TTS.init(cfg);
        $('#voiceBtn').classList.toggle('off', !cfg.voiceOn);
        $('#voiceBtn').querySelector('use').setAttribute('href', cfg.voiceOn ? '#i-volume' : '#i-mute');
        if (!cfg.voiceOn) TTS.stop();
        toast(cfg.voiceOn ? '🔊 语音已开启' : '🔇 语音已关闭');
        break;
      case 'settings':
        openPanel('#settingsPanel');
        fillSettings();
        break;
    }
    armIdle();
  }

  /* ---------- 气泡定位 ----------
   * 窄屏：把气泡移出 .pet-stage（父级 transform 会干扰 fixed 定位），
   *       再由 JS 按人物实时坐标摆放 —— 视觉上仍是“跟着人物”。
   * 宽屏：留在 .pet-stage 内，沿用原来的 CSS 定位。
   */
  function layoutBubble() {
    const bubble = $('#bubble');
    const stage = $('#petStage');
    if (!bubble || !stage) return;
    const narrow = window.innerWidth <= 640 || window.innerHeight <= 560;
    const inApp = bubble.parentElement === document.getElementById('app');

    if (narrow && !inApp) {
      document.getElementById('app').appendChild(bubble);
      bubble.classList.add('bubble-pinned');
      positionBubble();
    } else if (!narrow && inApp) {
      stage.appendChild(bubble);
      bubble.classList.remove('bubble-pinned');
      bubble.style.left = '';
      bubble.style.top = '';
    }
  }

  /* 按人物位置摆放气泡：优先在上方，放不下就挪到下方 */
  function positionBubble() {
    const bubble = $('#bubble');
    if (!bubble || !bubble.classList.contains('bubble-pinned')) return;
    const pet = $('#petImg').getBoundingClientRect();
    const bw = bubble.offsetWidth || 200;
    const bh = bubble.offsetHeight || 80;
    const vw = window.innerWidth, vh = window.innerHeight;

    // 窄屏：气泡仍以人物为锚水平摆放，右侧留出按钮列的宽度
    let left = pet.left + pet.width / 2 - bw / 2;
    left = Math.max(8, Math.min(vw - bw - 52, left));

    const TOP_LIMIT = 58;                 // 不压顶部状态栏
    let top = pet.top - bh - 10;
    if (top < TOP_LIMIT) {
      const below = pet.bottom + 10;
      top = (below + bh <= vh - 8) ? below : Math.max(TOP_LIMIT, vh - bh - 8);
    }
    bubble.style.left = Math.round(left) + 'px';
    bubble.style.top = Math.round(top) + 'px';
  }

  /* ---------- music UI ---------- */
  function renderTracks() {
    const wrap = $('#trackList');
    wrap.innerHTML = '';
    Music.TRACKS.forEach((t, i) => {
      const d = document.createElement('div');
      d.className = 'track';
      d.dataset.idx = i;
      d.innerHTML = `<span class="t-idx">${i + 1}</span>` +
        `<span class="t-title">${t.title}</span>` +
        `<span class="t-mood">${t.mood}</span>`;
      d.addEventListener('click', () => {
        Music.playIndex(i);
        Dialogue.say([`《${t.title}》——这首适合现在。`]);
      });
      wrap.appendChild(d);
    });
  }

  function onMusicState(st) {
    syncMusicUI(st.index, st);
    // 唱歌姿态的唯一裁决点：音乐在播 → 挂姿态；暂停/播完 → 立刻收回
    Pet.setPose(st.playing ? 'sing' : null);
  }

  function syncMusicUI(index, st) {
    document.querySelectorAll('.track').forEach((el, i) => el.classList.toggle('active', i === index));
    const playing = st ? st.playing : Music.isPlaying();
    const title = $('#npTitle'), mood = $('#npMood'), disc = $('#npDisc');
    if (index >= 0 && Music.TRACKS[index]) {
      title.textContent = Music.TRACKS[index].title;
      mood.textContent = playing ? '正在播放' : '已暂停';
    } else {
      title.textContent = '还没放歌';
      mood.textContent = '挑一首，或者对他说「唱歌」';
    }
    disc.classList.toggle('spin', !!playing);
    const ico = $('#mPlay').querySelector('use');
    if (ico) ico.setAttribute('href', playing ? '#i-pause' : '#i-play');
    // 音乐按钮保持常亮（仅作入口，不代表播放状态）
  }

  /* 请一杯的姿态小剧场：举杯(图3) → 喝一口(图4) → 回站姿 */
  let drinkTimer = null;
  function playDrinkPose() {
    clearTimeout(drinkTimer);
    Pet.setPose('drink');
    Pet.setSpeaking(true);        // 用 drink 姿态的两帧做举杯/饮酒的微动
    drinkTimer = setTimeout(() => {
      Pet.setSpeaking(false);
      Pet.setPose(null);
    }, 2600);
  }

  function renderMemories() {
    const list = $('#memoryList');
    list.innerHTML = '';
    $('#memoryHint').textContent = `好感越高，越能听到他没打算说出口的话。（当前好感 ${state.affection}）`;
    PERSONA.MEMORIES.forEach((m, i) => {
      const unlocked = state.unlocked.includes('m' + (i + 1));
      const d = document.createElement('div');
      d.className = 'memory-card' + (unlocked ? '' : ' locked');
      d.innerHTML = `<span class="tag">${m.tag}</span>` +
        (unlocked ? m.text : `好感达到 ${MEMORY_THRESHOLDS[i]} 后解锁`);
      list.appendChild(d);
    });
  }

  function fillSettings() {
    $('#setKey').value = '';
    $('#setElevenKey').value = '';
    $('#setVoiceOn').checked = cfg.voiceOn;
    $('#setIdleOn').checked = cfg.idleOn;
    // 只提示“存了没有”，绝不回显内容
    const kl = $('#setKey').closest('.field').querySelector('span');
    const el2 = $('#setElevenKey').closest('.field').querySelector('span');
    kl.textContent = (cfg.apiKey ? '更换 LLM API Key（已保存 · 留空即不变）' : '填入 LLM API Key（必填）');
    el2.textContent = (cfg.elevenKey ? '更换 TTS API Key（已保存 · 留空即不变）' : '填入 TTS API Key（可选 · 英语语音用）');
  }

  /* ---------- 首次设置 ---------- */
  function openSetup() {
    $('#setupLlm').value = cfg.apiKey || '';
    $('#setupEleven').value = cfg.elevenKey || '';
    closeAllPanels();
    $('#setupPanel').hidden = false;
  }

  function applyKeys(cfgObj) {
    LLM.setCfg(cfgObj);
    TTS.init(cfgObj);
    Dialogue.setCfg(cfgObj);
  }

  /* ---------- events ---------- */
  function bind() {
    // 发送
    const input = $('#userInput');
    function send() {
      const v = input.value.trim();
      if (!v || pending) return;
      input.value = '';
      state.turns++; saveState();
      addAffection(1);
      // 唱歌口令：「唱歌」随机放，「换一首歌」切下一首
      if (SING_RE.test(v)) { handleSing(v); return; }
      askLLM(v);
      armIdle();
    }
    $('#sendBtn').addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    input.addEventListener('focus', () => { armIdle(); });

    // 工具栏
    document.querySelectorAll('.tool').forEach(b => {
      b.addEventListener('click', () => handleAction(b.dataset.act));
    });

    // 关闭面板
    document.querySelectorAll('.modal-wrap').forEach(w => {
      w.addEventListener('click', e => { if (e.target === w) w.hidden = true; });
    });
    document.querySelectorAll('[data-close]').forEach(b => {
      b.addEventListener('click', () => { b.closest('.modal-wrap').hidden = true; });
    });

    // 右键菜单
    document.addEventListener('contextmenu', e => {
      if (e.target.closest('.modal')) return;
      e.preventDefault();
      buildCtx(e.clientX, e.clientY);
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('#ctxMenu')) hideCtx();
      if (!e.target.closest('.tool')) armIdle();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { hideCtx(); closeAllPanels(); }
    });
    $('#ctxMenu').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) handleAction(b.dataset.act);
    });

    // 摸头
    document.addEventListener('pet:tap', () => {
      quip([PERSONA.pick(PERSONA.QUICK.pet)]);
      addAffection(1);
      armIdle();
    });
    // 拖动时的一句吐槽（每次拖动只触发一次，由 Pet 保证 moved）
    document.addEventListener('pet:drag', () => {
      quip([PERSONA.pick(PERSONA.QUICK.drag)]);
      armIdle();
    });

    // 设置面板
    $('#setSave').addEventListener('click', () => {
      const newKey = $('#setKey').value.trim();
      const newEleven = $('#setElevenKey').value.trim();
      if (newKey) cfg.apiKey = newKey;             // 只有填了才换，平时不显示不覆盖
      if (newEleven) cfg.elevenKey = newEleven;
      cfg.voiceOn = $('#setVoiceOn').checked;
      cfg.idleOn = $('#setIdleOn').checked;
      CONFIG.save(cfg);
      applyKeys(cfg);
      $('#voiceBtn').classList.toggle('off', !cfg.voiceOn);
      $('#voiceBtn').querySelector('use').setAttribute('href', cfg.voiceOn ? '#i-volume' : '#i-mute');
      armIdle();
      closeAllPanels();
      toast('设置已保存');
    });

    // 首次设置窗
    $('#setupSave').addEventListener('click', () => {
      const k = $('#setupLlm').value.trim();
      const e = $('#setupEleven').value.trim();
      if (!k) { toast('先填上 LLM Key 才能聊天'); return; }
      cfg.apiKey = k;
      if (e) cfg.elevenKey = e;
      CONFIG.save(cfg);
      applyKeys(cfg);
      $('#setupPanel').hidden = true;
      toast('设置完成，他已经在等你了');
      setTimeout(() => speakSentences([PERSONA.opening()]), 500);
    });
    $('#setupSkip').addEventListener('click', () => {
      $('#setupPanel').hidden = true;
      Dialogue.say(['朋友，要先给我一把钥匙——点设置，填上你的 LLM Key，我们才能聊得下去。']);
    });
    $('#setReset').addEventListener('click', () => {
      localStorage.removeItem(STATE_KEY);
      state = { affection: 0, unlocked: [], turns: 0 };
      saveState();
      renderAffection();
      LLM.clear();
      closeAllPanels();
      Dialogue.stopAll();
      Dialogue.say(['账清了。从头开始，朋友——这次我押你先开口。']);
      toast('已清空对话与进度');
    });

    // 时间刷新
    setInterval(renderTime, 30000);
  }

  /* ---------- boot ---------- */
  function boot() {
    LLM.init(cfg);
    TTS.init(cfg);
    Dialogue.init({
      bubble: $('#bubble'), text: $('#bubbleText'), hint: $('#bubbleHint'),
      dots: $('#bubbleDots'), stage: $('#petStage'), petImg: $('#petImg')
    }, cfg, (talking) => Pet.setSpeaking(talking));
    Dialogue.setOnSentence((line) => {
      if (!voiceThisTurn) return;               // 仅英语链路才朗读，其余状态一律不调用 TTS
      if (!isEnglishText(line)) return;         // 回复中夹中文的句子也不读
      Music.duck(true);
      TTS.speak(line, () => Music.duck(false));
    });
    // 英语轮次播完（气泡淡出）后复位，回到“平时不朗读”的默认状态
    document.addEventListener('dialogue:idle', () => { voiceThisTurn = false; });

    Pet.init($('#petStage'), $('#petImg'), {
      onDragStart: () => document.dispatchEvent(new CustomEvent('pet:drag')),
      onMove: () => positionBubble()
    });

    // 猫糕牌
    CatGame.init({
      grid: $('#catGrid'), flips: $('#catFlips'),
      pairs: $('#catPairs'), best: $('#catBest')
    }, { say: (line) => speakSentences([line]) });

    // 音乐库
    Music.init({ onState: onMusicState });
    renderTracks();
    $('#mPlay').addEventListener('click', () => Music.toggle());
    $('#mNext').addEventListener('click', () => Music.next());
    $('#mPrev').addEventListener('click', () => Music.prev());
    $('#mShuffle').addEventListener('click', () => Music.playRandom());
    $('#mVol').addEventListener('input', (e) => Music.setVolume(e.target.value / 100));

    Pet.reset();   // 默认水平 + 垂直居中
    layoutBubble();
    window.addEventListener('resize', layoutBubble);
    window.addEventListener('orientationchange', () => setTimeout(layoutBubble, 200));
    // 打字时气泡会变高变宽，实时跟随
    if (window.ResizeObserver) {
      new ResizeObserver(() => positionBubble()).observe($('#bubble'));
    }
    setInterval(positionBubble, 400);   // 兜底：人物移动/尺寸变化时同步

    renderTime();
    renderAffection();
    $('#voiceBtn').classList.toggle('off', !cfg.voiceOn);
    $('#voiceBtn').querySelector('use').setAttribute('href', cfg.voiceOn ? '#i-volume' : '#i-mute');

    bind();
    armIdle();

    // 浏览器自动播放策略：首次点击/按键后才能出声，顺手预热一次静音播放
    const unlock = () => {
      try {
        const a = new Audio(); a.muted = true; a.play().catch(() => {});
      } catch (e) {}
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    // 调试钩子：?qa=settings 自动打开设置面板
    try {
      const qa = new URLSearchParams(location.search).get('qa');
      if (qa === 'settings') setTimeout(() => openPanel('#settingsPanel') || fillSettings(), 300);
      if (qa === 'music') setTimeout(() => { openPanel('#musicPanel'); renderTracks(); syncMusicUI(-1); }, 300);
    } catch (e) {}

    // 开场：先是一句时段问候；若还没填 Key，先引导设置
    if (CONFIG.needsSetup(cfg)) {
      setTimeout(() => openSetup(), 600);
    } else {
      setTimeout(() => speakSentences([PERSONA.opening()]), 700);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
