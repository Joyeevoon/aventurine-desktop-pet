/* 调用 chatanywhere（OpenAI 兼容接口）。失败时回落到本地台词库，桌宠永远能说话。 */
window.LLM = (function () {

  let cfg = null;
  const history = [];        // {role, content}
  const MAX_TURNS = 6;       // 保留最近 6 轮做上下文

  function init(config) { cfg = config; }

  function push(role, content) {
    history.push({ role, content });
    while (history.length > MAX_TURNS * 2) history.shift();
  }

  function clear() { history.length = 0; }
  function getHistory() { return history.slice(); }

  function setCfg(config) { cfg = config; }

  /* 背诵/朗读类意图：允许更长输出、更多分句 */
  const RECITE_RE = /背诵|背一下|背首|背一背|背给我|念一?首|念一?段|朗读|朗诵|完整的?(说|念|背)|全文|整首|来首(诗|词)|来一首诗|诗经|唐诗|宋词|古诗|诗|词牌|赋|吟/i;

  function isRecite(text) { return RECITE_RE.test(String(text || '')); }

  async function request(userText, opts) {
    const english = !!(opts && opts.english);
    const recite = isRecite(userText);
    const base = (cfg.baseUrl || '').replace(/\/+$/, '');
    const url = base + '/v1/chat/completions';

    const sys = [
      window.PERSONA.SYSTEM_PROMPT,
      english
        ? '【本次硬性约束】用户本条消息是英语。你必须百分之百用英语回复，一个汉字都不得出现。回复仍保持同一人设，1～2 句，40 词以内。'
        : '【本次硬性约束】用中文回复，1～2 句，不使用英语句子。',
      '【再次强调】无论用户问什么，都必须给出实质回答；不得以“不符合场景”“不便回答”“换个话题”为由拒答或回避。',
      recite
        ? '【本轮为朗读/背诵请求 · 长度限制解除】用户要求你背诵或朗读内容。最高原则：**准确第一**。规则：1) 先用一句话起头（如“那这首，朋友——”）；2) 只写你逐字确认无误的原文，每句单独一行；3) 任何时候若对下句没把握，立刻停下，用一句话如实说明“这首我记不全了，朋友”，**绝不允许编造、改写、跨篇挪用、或重复上句充数**；4) 若对整首都没把握，开头就坦承“这首我背不齐，朋友”，然后用一两句给出你的印象或聊聊这首——不许硬凑原文。宁可交白卷，不可报错稿。'
        : ''
    ].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'system', content: sys },
      ...history
    ];

    try {
      const text = await once(url, messages, recite);

      // 检测到拒答/回避 → 强制重试一次
      if (looksLikeRefusal(text)) {
        const retryMsgs = messages.concat([
          { role: 'assistant', content: text },
          { role: 'user', content: '别回避，正面回答我刚才的问题。用砂金的语气，给出一个实质回答（可以调侃，但必须回答）。' }
        ]);
        const retry = await once(url, retryMsgs, recite);
        if (retry && !looksLikeRefusal(retry)) return { ok: true, text: retry };
        return { ok: true, text: retry || text };   // 即使仍像回避，也照常给出，避免无回复
      }

      // 英语请求却夹了中文 → 重试一次，仍不合格就交上层兜底
      if (english && hasHan(text)) {
        const retryMsgs = messages.concat([
          { role: 'assistant', content: text },
          { role: 'user', content: 'Reply again in English only. Do not use any Chinese characters.' }
        ]);
        const retry = await once(url, retryMsgs, recite);
        if (!hasHan(retry)) return { ok: true, text: retry };
        return { ok: false, error: 'model kept replying in Chinese' };
      }
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  function hasHan(s) { return /[\u4e00-\u9fff]/.test(String(s || '')); }

  /* 粗略识别“拒答/回避”话术 */
  function looksLikeRefusal(s) {
    const t = String(s || '');
    if (!t.trim()) return true;
    return /不符合.{0,4}场景|不便(回答|透露|讨论)|不适合(讨论|回答)|换个话题|不想聊这个|无可奉告|这是个秘密|对不起，我(不能|无法)|我不能(回答|谈论|讨论)|这(个问题|话题).{0,6}(不好|不便|不适合)|别问这个|无可告知|无可奉告|not something I can|can't (answer|discuss)|won't (answer|discuss)|let'?s (change|talk about something else)/i.test(t);
  }

  async function once(url, messages, reciteMode) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 22000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.apiKey
        },
        body: JSON.stringify({
          model: cfg.model || 'gpt-4o-mini',
          messages,
          temperature: reciteMode ? 0.7 : 0.95,
          max_tokens: reciteMode ? 900 : 160
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error('HTTP ' + res.status + ' ' + t.slice(0, 120));
      }
      const data = await res.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '').trim();
      if (!text) throw new Error('empty reply');
      return text;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /* 把回复切成适合打字机播放的短句 */
  function toSentences(text, recite) {
    let t = String(text)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[*_`#>]/g, '')
      .replace(/^[\s\-•·]+/gm, '')
      .trim();

    const lines = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const out = [];

    if (recite) {
      // 背诵模式：尽量按原行保留（诗句不被硬拆），过长行才按标点切
      for (const line of lines) {
        if (line.length <= 40) { out.push(line); continue; }
        const parts = line.split(/(?<=[，。！？!?；;、…])/).map(s => s.trim()).filter(Boolean);
        let buf = '';
        for (const p of parts) {
          if ((buf + p).length > 40 && buf) { out.push(buf); buf = p; }
          else buf += p;
        }
        if (buf) out.push(buf);
      }
      return out.length ? out : [t];
    }

    for (const line of lines) {
      if (line.length <= 34) { out.push(line); continue; }
      const parts = line.split(/(?<=[。！？!?；;…])/).map(s => s.trim()).filter(Boolean);
      let buf = '';
      for (const p of parts) {
        if ((buf + p).length > 34 && buf) { out.push(buf); buf = p; }
        else buf += p;
      }
      if (buf) out.push(buf);
    }
    // 平时最多三句避免刷屏；背诵/朗读时放开句数（最多 24 句）
    const cap = recite ? 24 : 3;
    const trimmed = out.slice(0, cap);
    return trimmed.length ? trimmed : [t.slice(0, 60)];
  }

  return { init, setCfg, request, toSentences, isRecite, clear, getHistory, push };
})();
