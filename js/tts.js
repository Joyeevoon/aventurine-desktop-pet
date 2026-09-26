/* 语音输出：直连 ElevenLabs（浏览器内直接调用，无需任何本地服务）
 * CORS 已实测放行（access-control-allow-origin: *）。
 * Key 由用户在首次设置/设置面板里填写，存本机 localStorage。
 * 默认音色：Will（年轻男声，松弛温柔）；模型 eleven_multilingual_v2，中文自然。
 * 多句对话时：合成完成后才会顶掉上一句，避免空窗；
 *          单次合成失败自动重试一次，仍失败则静默（嘴型照常）。
 */
window.TTS = (function () {

  const API = 'https://api.elevenlabs.io/v1/text-to-speech/';
  const VOICE_ID = 'bIHbv24MWmeRgasZH58o';           // Will - Relaxed Optimist
  const MODEL_ID = 'eleven_multilingual_v2';

  let cfg = null;
  let currentAudio = null;
  let speakSeq = 0;              // 请求序号：只有最新一次请求才有资格播放

  function init(config) { cfg = config; }

  function stop() {
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
  }

  async function synthesize(text, signal) {
    const r = await fetch(API + VOICE_ID + '?output_format=mp3_44100_128', {
      method: 'POST',
      headers: {
        'xi-api-key': cfg.elevenKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true
        }
      }),
      signal
    });
    if (!r.ok) throw new Error('ElevenLabs ' + r.status);
    return await r.blob();
  }

  /* 合成 + 播放；返回 Promise，播放结束（或失败）时 resolve */
  function speak(text, onEnd) {
    if (!cfg || !text || !cfg.elevenKey) { onEnd && onEnd(); return; }
    const clean = String(text).replace(/[*_`#>\[\]()]/g, '').trim();
    if (!clean) { onEnd && onEnd(); return; }

    const mySeq = ++speakSeq;

    (async () => {
      let blob = null;
      try {
        blob = await synthesize(clean);
      } catch (e1) {
        try { blob = await synthesize(clean); }        // 失败重试一次
        catch (e2) { onEnd && onEnd(); return; }       // 彻底失败：静默
      }
      if (mySeq !== speakSeq) { onEnd && onEnd(); return; }   // 已有更新的一句话

      stop();                                            // 停掉上一句，再播本句
      const audio = new Audio(URL.createObjectURL(blob));
      currentAudio = audio;
      audio.onended = () => { if (currentAudio === audio) currentAudio = null; onEnd && onEnd(); };
      audio.onerror = () => { if (currentAudio === audio) currentAudio = null; onEnd && onEnd(); };
      audio.play().catch(() => { if (currentAudio === audio) currentAudio = null; onEnd && onEnd(); });
    })();
  }

  return { init, speak, stop };
})();
