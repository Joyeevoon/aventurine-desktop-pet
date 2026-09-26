/* 全局配置：不内置任何密钥。
 * 首次打开会弹出设置窗，由用户填入 Key；保存后只存在本机 localStorage，并随页面更新保留。
 * 页面源码里没有任何 Key，公开分享不会泄露。
 */
window.CONFIG = (function () {
  const KEY = 'golden-deskmate:config';

  const DEFAULTS = {
    baseUrl: 'https://api.chatanywhere.tech',   // LLM 接口地址（如需换服务商可改这里）
    model: 'gpt-4o-mini',                        // 模型（内置，界面不显示）
    apiKey: '',                                  // LLM Key：运行时由用户填写
    elevenKey: '',                               // TTS API Key：运行时由用户填写
    voiceOn: true,
    idleOn: true
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }

  function save(cfg) {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  function needsSetup(cfg) {
    return !cfg.apiKey;   // 没有 LLM Key 就没法对话，先引导用户填
  }

  return { DEFAULTS, load, save, reset, needsSetup, KEY };
})();
