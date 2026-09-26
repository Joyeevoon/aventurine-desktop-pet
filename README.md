# 砂金·戏浪 桌宠 · 网页版

崩坏：星穹铁道「夏日度假」版砂金的网页桌宠。可拖动、说话时嘴型动画、galgame 式打字机对白、
AI 对话、英语语音、音乐库、猫糕牌小游戏、诗词背诵。

本目录是**纯静态站点**，可直接部署到 GitHub Pages / Vercel / Netlify 等任意静态托管。

---

## 一、部署到 GitHub Pages

```bash
# 1. 在 GitHub 新建一个仓库（例如 golden-deskmate）
# 2. 把本目录内容放到仓库根目录后推送
git init
git add .
git commit -m "init: 砂金·戏浪 桌宠"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main

# 3. 仓库 Settings → Pages → Source 选 "Deploy from a branch"
#    Branch 选 main，目录选 /(root)，保存
# 4. 等 1~2 分钟，访问 https://<你的用户名>.github.io/<仓库名>/
```

目录内已包含 `.nojekyll`，避免 GitHub Pages 的 Jekyll 处理干扰静态资源。

> 也可以把本目录内容直接拖到 Vercel / Netlify 的部署面板，无需任何构建配置。

---

## 二、首次使用：填入 API Key（重要）

**代码里不含任何密钥**，Key 由使用者自己在页面上填写，只保存在**本机浏览器 localStorage**：

1. 打开页面 → 自动弹出「首次设置 · 填入你的 Key」
2. **LLM API Key**（必填）：用于 AI 对话，填 chatanywhere 的 `sk-` 开头密钥
3. **TTS API Key**（可选）：用于英语语音，填 ElevenLabs 的 `sk_` 开头密钥
4. 点「保存并开始」即可

补充说明：

- 每台设备 / 每个浏览器**各填一次**；换浏览器或清缓存后需重填
- 想换 Key：页内「设置」面板填入新 Key（界面不回显已存的 Key）
- **语音只在你说英语时触发**：你发英语 → 模型用英语回复 → 逐句朗读；中文对话不出声
- Key 无效或断网时：对话自动回落到内置话术库，不会白屏或报错

---

## 三、目录结构

```
index.html              页面入口
css/style.css           全部样式
js/config.js            配置读取（不含密钥，Key 存本机）
js/persona.js           人设 system prompt + 全部台词库
js/recite.js            诗词原文库（16 篇，离线直出）
js/dialogue.js          打字机 + 点击规则引擎
js/pet.js               拖动与姿态（站立 / 说话 / 被拎起 / 唱歌 / 举杯）
js/music.js             音乐库（本地 mp3）
js/llm.js               调用 chatanywhere（浏览器直连）
js/tts.js               调用 ElevenLabs（浏览器直连，仅英语）
js/catgame.js           猫糕牌翻牌配对
js/app.js               主控：热意、待机、问候、菜单、设置
assets/                 人物立绘、姿态图、猫糕牌面、音乐
.env.example            仅为可选的本地转发服务预留（静态部署无需理会）
```

---

## 四、可选：本地转发服务

仓库里另有一份 `server.js`（留在开发仓库，不在本部署目录内）：
它可用 Node 托管页面并转发语音请求，适合本地开发。纯静态托管**不需要**它。

---

## 五、注意事项

- **不要**把你的 Key 写进任何前端文件后上传——前端代码对访问者完全可见
- 浏览器直连第三方 API 需要对方允许跨域（chatanywhere 与 ElevenLabs 均已验证放行）
- 语音首次出声需用户先与页面交互一次（浏览器自动播放策略）
