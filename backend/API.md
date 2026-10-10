# 真实溯源 Agent 接入

本地：Node.js 22+，`node serve.cjs`。服务在 `127.0.0.1:4173` 同时提供静态网站和同源 API。

将根目录 `.env.example` 复制为 `.env`，填写服务端 `OPENAI_API_KEY`，重启服务。浏览器不输入或保存 API 密钥。研究模型 `OPENAI_MODEL` 默认 `gpt-5.5`，需支持 Responses 和 web_search。可选 `OPENAI_EXTRACTION_MODEL` 设置支持严格结构化输出的整理模型；留空时沿用研究模型。模型可用性取决于 API 账户权限。

`OPENAI_BASE_URL` 默认使用 `https://api.openai.com/v1`。本项目支持授权的第三方地址 `https://api.shuaiapi.com/v1`；服务端接受 HTTPS 根地址、`/v1` 或完整 `/v1/responses`，统一为 Responses 请求地址。不接受 URL 用户名/密码、query、hash 或异常路径。此项仅从服务端环境读取，不透出浏览器，用户请求不能覆盖它。上游重定向已禁用；配置错误不会回退其他服务商。

本项目部署：运行 `node build-hosted.cjs`，入口 `dist/server/index.js` 包装共享 Worker 后端并内置公开静态资产，无需另外配置 `ASSETS`。将 `OPENAI_API_KEY` 设置为服务端 secret。也可以单独使用 `backend/worker.mjs` 并绑定静态文件为 `ASSETS`。其他 `.env.example` 选项可作为服务端环境变量。纯静态托管不能运行这个后端；需支持 Worker 的部署配置。

## 接口

`GET /api/agent/status` 返回 `available`、`mode`、`reason`、研究模型 `model`、整理模型 `extractionModel` 和 `limits`。`available=true` 仅表示有凭据且服务端地址配置格式正确，不表示已验证凭据、账户余额或工具兼容性。未配置或地址配置错误时返回正常 200，`available=false`；地址错误的 mode 为 `configuration_error`。

`POST /api/agent/query`，Content-Type 为 application/json：

```json
{"question":"湖北通山阮氏有哪些公开族谱线索？","history":[{"role":"user","content":"祖籍在湖北通山"}]}
```

可选 `profile:{name,ancestralPlace}`。姓名不需要填写完整；不要输入证件、电话号码或在世者住址。服务端仅保留请求期间的内容，不写入公开地图或持久化对话。`store:false` 不等于服务商无日志，服务商数据保留政策需单独评估。

结果：

```json
{
  "answer":"来源中的具体说法与局限。[S1]",
  "sources":[{"id":"S1","title":"实际网页标题","url":"https://example.org/document","cited":true}],
  "clues":[{"id":"C1","title":"候选支系","summary":"有依据的概括","kind":"candidate","confidence":"candidate","sourceIds":["S1"],"evidence":"检索正文中的依据[S1]","location":{"name":"湖北省通山县","lng":null,"lat":null,"precision":"unknown"}}],
  "followup":{"question":"还记得具体村名吗？","options":["不知道"]},
  "gaps":["尚未找到原谱页"],
  "mapNodes":[{"id":"C1","name":"湖北省通山县","lng":null,"lat":null,"precision":"unknown","summary":"有依据的概括","kind":"candidate","sourceIds":["S1"]}],
  "routes":[],
  "warnings":[],
  "usage":{"inputTokens":0,"outputTokens":0,"searchCalls":0,"toolCalls":0,"elapsedMs":0}
}
```

这是协议示例，不是实际查询结果。前端必须将正文 `[S1]` 和线索的 sourceIds 渲染为可点击的来源链接。`cited=false` 是搜索过程中检索过但正文未引用的来源，不作为结构化线索依据。

`routes` 使用 `{fromId,toId,label,sourceIds,evidence,confidence}`，对应 clues/mapNodes 的 ID，只呈现原文支持的候选迁徙关系；经纬度未知时不画精准路线。节点未定位仍可展示卡片，前端可用本地省级区域示意并明确标识，不能冒充祖居坐标。

错误格式 `{error:{code,message}}`：503 AGENT_NOT_CONFIGURED / PROVIDER_CONFIG_ERROR / PROVIDER_AUTH_ERROR、429 RATE_LIMIT / HOURLY_LIMIT / PROVIDER_RATE_LIMIT、504 RESEARCH_TIMEOUT、400 INVALID_QUESTION、502 UPSTREAM_ERROR 等。PROVIDER_CONFIG_ERROR 表示服务端 API 地址不符合要求，返回内容不包含原始地址或凭据。若检索已完成而结构化步骤超时，会先交付200正文与来源并标记缺口。取消请求会尝试中止上游 fetch，但服务商已开始的计算可能仍计费。

## 处理过程与边界

一次查询最多两次模型请求：第一步使用官方 `web_search` 进行有限检索与原网页阅读；第二步只从研究正文和已引用的来源中提取 JSON，不调用工具，可使用独立的整理模型。第二步不会收到未被正文引用的搜索来源。来源 URL 来自服务商原生引用和搜索元数据，不接受模型自行编出的 URL。缺失引用、重复 ID、无研究依据的结构记录和缺少依据的路线会被去掉。坐标只接受正文中明确出现并带来源引用的区域/城市/县级坐标，否则为空。

研究提示词限制推断个人血缘、同名合并、字辈作父子关系、文化名人作直系祖先及转载作独立互证。以上是约束与基本校验，**不等同人工核实或完整研究**。没有实现大规模谱页 OCR、跨来源实体核对、公共资料库自动入库或完整个人世系。

默认90秒超时、4次内置工具调用、4500+3000输出 token 上限、单客户端每分钟4次、整个进程/Worker isolate每小时30次和最多2个并发。输入正文最多600字，对话取最后12条，每条1200字，总对话8000字。请求体最多32 KiB。

当前第三方部署采用研究与整理均为 `gpt-6-luna`、`WHOAMI_TIMEOUT_MS=180000`、`WHOAMI_MAX_TOOL_CALLS=2`；其他 token 和速率默认值保持不变。出站请求使用 `redirect:manual` 并显式拒绝所有3xx，兼容部署的 Worker 运行时且不把凭据转发到跳转目标。管理员可临时设置 `WHOAMI_DIAGNOSTICS=1` 记录经过凭据和 URL 过滤的连接错误；默认关闭。

网站允许公开访问和匿名提问，不要求注册或登录。这些限制控制单次工作量，不能承诺精确费用。速率和小时额度仅在当前 Node 进程或 Worker isolate 中有效，重启会重置，多个 isolate 不共享；当前没有持久化部署全局配额，不把这个 limiter 视为全局账单上限。

## 验证

运行 `node --test backend/agent.test.mjs backend/server.test.cjs`，26项测试覆盖凭据缺失、服务端地址规范化与错误配置、目标不可被客户端覆盖、独立整理模型与来源过滤、跳转拒绝与日志秘密过滤、输入与来源校验、跨域、速率、超时/取消、上游失败、两阶段提取、无引用降级、静态访问及秘密文件不可访问。自动测试使用明确的 mock，不调用真实 API。

2026-10-10，已通过公开网站的 `/api/agent/query` 完成用户授权的真实端到端验证：使用 `api.shuaiapi.com/v1` 和 `gpt-6-luna` 查询湖北通山阮氏宗谱公开目录，HTTP 200，客户端耗时约28秒、服务端约24.5秒；产生1次搜索和2次工具调用，正文引用3个来源，严格结构化输出通过解析和依据校验，保留3条线索和3个地图节点，无依据路线被过滤。此测试证明一次实际连接与查询成功，不代表历史结论已经人工核实，也不保证每次查询都能找到完整资料。

官方依据：[网页搜索](https://developers.openai.com/api/docs/guides/tools-web-search)、[Responses 创建参数](https://developers.openai.com/api/reference/resources/responses/methods/create)、[结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)、[GPT-5.5 模型能力](https://developers.openai.com/api/docs/models/gpt-5.5)。
