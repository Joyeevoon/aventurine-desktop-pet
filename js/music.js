/* 音乐库：本地两首曲子，随机播放；支持点播、暂停、切歌
 * 触发：对话框输入「唱歌」/「唱首歌」/「来一首」等，或点工具栏 🎵 音乐
 */
window.Music = (function () {

  const TRACKS = [
    { id: 'bang', title: 'Bang Bang Bang', file: 'assets/music/bang-bang-bang.mp3', mood: '热意 · 午后' },
    { id: 'falling', title: 'Falling U', file: 'assets/music/falling-u.mp3', mood: '心动 · 傲晚' },
    { id: 'fengyue', title: '风月吻眉梢', file: 'assets/music/fengyue-wen-meishao.mp3', mood: '松弛 · 夜晚' }
  ];

  const BASE_VOL = 0.62;
  let audio = null;
  let idx = -1;
  let playing = false;
  let onState = null;
  let ducked = false;

  function emit() {
    onState && onState({ playing, index: idx, track: idx >= 0 ? TRACKS[idx] : null, tracks: TRACKS });
  }

  function ensure() {
    if (!audio) {
      audio = new Audio();
      audio.loop = false;                 // 放完一遍就停，不循环
      audio.volume = 0.62;
      const onEnd = () => { playing = false; emit(); };
      audio.addEventListener('play', () => { playing = true; emit(); });
      audio.addEventListener('pause', () => { playing = false; emit(); });
      audio.addEventListener('ended', onEnd);
      // 兜底：Chrome 偶发丢失 ended 事件，用 timeupdate 判定真正播完
      audio.addEventListener('timeupdate', () => {
        if (playing && audio.duration > 0 && audio.currentTime >= audio.duration - 0.06) onEnd();
      });
    }
    return audio;
  }

  function playIndex(i) {
    const a = ensure();
    idx = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    a.src = TRACKS[idx].file;
    a.currentTime = 0;
    a.play().catch(() => { playing = false; emit(); });
    emit();
  }

  /* 随机选一首（尽量不重复上一首） */
  function playRandom() {
    let next = Math.floor(Math.random() * TRACKS.length);
    if (TRACKS.length > 1 && next === idx) next = (next + 1) % TRACKS.length;
    playIndex(next);
    return TRACKS[next];
  }

  function toggle() {
    const a = ensure();
    if (playing) { a.pause(); return false; }
    if (idx < 0) { playRandom(); return true; }
    a.play().catch(() => {});
    return true;
  }

  function next() { playIndex(idx < 0 ? 0 : idx + 1); return TRACKS[idx]; }
  function prev() { playIndex(idx < 0 ? 0 : idx - 1); return TRACKS[idx]; }

  function stop() {
    if (audio) { try { audio.pause(); } catch (e) {} }
    playing = false; emit();
  }

  function setVolume(v) { ensure().volume = ducked ? Math.min(v, 0.22) : v; }

  function init(opts) { onState = (opts && opts.onState) || null; emit(); }

  /* 朗读时把音乐压低，读完恢复 */
  function duck(on) {
    ducked = !!on;
    if (!audio) return;
    audio.volume = on ? 0.16 : BASE_VOL;
  }

  return { TRACKS, init, playRandom, playIndex, toggle, next, prev, stop, setVolume, duck,
           isPlaying: () => playing, _audio: () => audio };
})();
