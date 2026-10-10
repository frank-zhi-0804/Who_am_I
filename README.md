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

## 服务端检索配置

将 `.env.example` 复制为 `.env`，在服务端设置 `OPENAI_API_KEY`。`OPENAI_BASE_URL` 默认为 `https://api.openai.com/v1`，也支持用户授权的 `https://api.shuaiapi.com/v1`。本地配置后重启服务；线上版本使用服务端秘密设置，不能上传本地 .env 或把密钥写入 dist。默认模型、限制与 API 协议见 [backend/API.md](backend/API.md)。

`OPENAI_MODEL` 控制研究模型，可选 `OPENAI_EXTRACTION_MODEL` 单独配置整理模型；留空时两阶段使用同一模型。本轮计划研究使用 `gpt-5.5`、整理使用 `gpt-6-luna`，部署超时180秒、工具调用上限2次，其他 token 默认值不变。

服务端已实现服务商地址配置、HTTPS校验和禁用上游重定向。是否启用以 `/api/agent/status` 为准；`available=true` 只表示配置存在且地址格式正确，不代表凭据已验证。配置缺失或错误时显示真实状态，示例模式仍可用。网站公开访问、匿名提问，无需注册登录。

## 部署

本项目已由静态站升级为 Worker；`.openai/hosting.json` 保留原 project_id，不含 static。
`node build-hosted.cjs` 生成 `dist/server/index.js` 与纯前端资产模块。只嵌入预先列出的公开文件，服务端秘密从环境读取。

## 验证与范围

后端：`node --test backend/agent.test.mjs backend/server.test.cjs`。
界面：`node qa/check-ui.cjs`（需要 Chrome，自动后台测试，不使用现有用户浏览器资料）。
界面检查与截图见 [qa/UI-REVIEW.md](qa/UI-REVIEW.md)。

自动后端测试34项通过，使用 mock 或无凭据路径。2026-10-10 已在公开网站完成用户授权的真实端到端验证：通山阮氏宗谱目录查询约28秒返回 HTTP 200，包含3个正文引用来源、3条线索和3个地图节点。研究和整理均配置为第三方接口的 `gpt-6-luna`，计划最多2次工具调用、180秒时间上限（第三方接口不支持硬性工具次数参数）。Worker 请求使用手动重定向并拒绝所有3xx，避免把凭据发送到跳转地址。历史结论仍需来源抽查；公开资料入库、谱页 OCR、完整个人世系属于后续阶段。

查询限额目前仅在单进程或单 Worker isolate 生效，重启会重置，不构成部署全局费用配额。

基础地理数据：DataV GeoAtlas；地图库：MapLibre GL JS 5.6.0；底图：OpenStreetMap；可选高程：AWS Terrain Tiles。

本轮修复：初次问候直接引导填写姓氏、祖籍；适配第三方接口拒绝 max_tool_calls 的情况；临时上游故障最多重试一次。前端已区分永久配置错误、限流与临时故障，浏览器错误处理 mock 11项通过。详见 backend/API.md 的接口兼容说明。
