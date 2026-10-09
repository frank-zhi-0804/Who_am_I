# 来处 · 对话驱动的家族历史地图

本地预览：`node serve.cjs`，打开 http://127.0.0.1:4173 。要求 Node.js 22+，不要直接双击 index.html。

## 本轮完成

- 改善桌面阅读空间、输入区、来源卡片和地图浮层。
- 手机提供“对话 / 历史地图”切换，点选地点自动切换到可见地图。
- 示例与真实溯源分开；示例不用于判断查询者的个人关系。
- 输入校验、中文输入法、Enter 发送 / Shift+Enter 换行、停止、重试、迟到响应丢弃。
- 正文来源编号可点击；旧线索卡可以回看原来的地点。
- 服务端真实 Agent 的搜索、网页阅读、来源提取、结构化线索与追问已接入。
- 全国输入通用处理；地图只能展示带出处的地点，未知位置留空或明确标为省域示意。

## 稍后配置真实检索

将 `.env.example` 复制为 `.env`，仅在 `.env` 填写 `OPENAI_API_KEY`。重启本地服务。线上版本使用服务端秘密设置，不能上传本地 .env 或把密钥写入 dist。默认模型、限制与 API 协议见 [backend/API.md](backend/API.md)。

当前未配置密钥，真实查询不会执行；示例模式正常可用。available=true 只表示有配置，不代表凭据已验证。

## 部署

本项目已由静态站升级为 Worker；`.openai/hosting.json` 保留原 project_id，不含 static。
`node build-hosted.cjs` 生成 `dist/server/index.js` 与纯前端资产模块。只嵌入预先列出的公开文件，服务端秘密从环境读取。

## 验证与范围

后端：`node --test backend/agent.test.mjs backend/server.test.cjs`。
界面：`node qa/check-ui.cjs`（需要 Chrome，自动后台测试，不使用现有用户浏览器资料）。
界面检查与截图见 [qa/UI-REVIEW.md](qa/UI-REVIEW.md)。

所有 API 验证均使用 mock 或无凭据路径，未调用真实模型，尚未验证实际历史查询质量。公开资料入库、谱页 OCR、完整个人世系属于后续阶段。

基础地理数据：DataV GeoAtlas；地图库：MapLibre GL JS 5.6.0；底图：OpenStreetMap；可选高程：AWS Terrain Tiles。
