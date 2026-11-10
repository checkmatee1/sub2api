# 验证记录

以下区分离线套件、独立适配器真实调用和经线上 Sub2API 的端到端链路；不能将独立适配器成功等同于线上接入完成。

## 线上基线

- 原容器：sub2api-snapshot。
- 镜像：sub2api-source-runtime:0.2.18-20261104。
- 启动时间：2026-11-05T13:11:00.001051073Z；重启次数：1。
- 原服务健康：`http://127.0.0.1:18989/health`，起始响应 status=ok。
- 原运行目录不复制、不提交；原服务不参与本次构建或测试。

## Git 基线

- 原运行目录源码提交：d851a38477597157e78450d30af2d8504764d085。
- fork/main 开发基线：ee58c0013c76ccd3f36439881bc848d342ec1c9d，已确认包含原提交。
- 分支：feat/copilot-upstream。

## 实际结果

- 独立适配器镜像构建成功，源码摘要验证及 harden.mjs 应用成功；镜像保留上游许可证。
- 适配器原有完整套件：26 passed，0 failed；限 1 CPU、768 MiB、禁用测试容器网络。
- Sub2API 后端完整套件：`GOMAXPROCS=2 GOMEMLIMIT=768MiB go test -p 2 ./...`，退出码 0。
- 前端完整套件：`vitest run --maxWorkers=2 --minWorkers=1`，384 个文件、3095 项测试全部通过。限制 worker 的临时 package.json 改动已恢复。
- ESLint 通过。类型检查初次受 768 MiB 堆上限影响退出 134；核实宿主机 16 GiB 后，以 2048 MiB 上限重试通过。
- golangci-lint 未安装，未完成该静态检查；不能将此项描述为通过。
- 网关 `/healthz`=200；未认证 `/v1/models`=401；`/token`、`/usage`=404；未认证 Responses=401，认证后 Responses=501。
- Bearer、x-api-key 认证请求均可到达适配器入口；未登录时模型接口=502，`/readyz`=503，符合未就绪状态，不是模型可用证明。
- 在现有 sub2api-snapshot 容器内访问 `host.docker.internal:18991/healthz` 成功。
- 网关首次启动因 Nginx 默认 map 哈希桶过小失败；设置 map_hash_bucket_size=128 并增加启动健康等待后通过。
- 独立审查发现线上新增账号会违反本轮不修改原数据库边界；文档已明确只生成私密模板，不进行线上写入。
- GitHub 设备授权轮询遇到瞬时网络错误，已增加截至设备码到期的网络重试。真实账号授权、模型推理、在线 SSE/工具调用/取消、令牌续期及经 Sub2API 的端到端验证仍待完成。
- 全程未停止或重启原服务。核对原容器仍 running，启动时间及重启次数与以上基线一致，`/health` 持续返回 status=ok。

运行日志保存在独立开发副本 `.work-copilot/`，不提交日志、真实配置、密钥和授权数据。

## 设备授权后的真实验证（2026-11-10）

- GitHub 设备授权已保存，独立 adapter/gateway 均健康；Bearer 和 x-api-key 查询模型列表均 HTTP 200。
- gpt-4.1 普通 Chat Completions 请求 HTTP 200，有有效 choices。
- gpt-4.1 SSE HTTP 200，收到完整 [DONE] 结束事件。
- gpt-4.1 强制 get_weather 工具调用 HTTP 200，返回正确 tool_calls；未执行任何外部工具。
- gpt-4.1 经 /v1/messages 转换 HTTP 200，返回有效 Anthropic message/content。
- claude-haiku-5.5 和 claude-haiku-4.5 目录中可见但实际请求 HTTP 400；直接核实前者上游错误为 model_not_supported。模型目录不构成可用性证明，本轮仅确认 gpt-4.1 可用。
- 尚未验证长时间令牌续期、在线断连取消及经线上 Sub2API 的端到端链路。
- 线上数据库及账号未写入；新增专用账号/分组属于下一步，遵守已确认设计中的数据库隔离边界。

## 专用 private 分组接入（2026-11-10）

用户随后明确授权新增线上账号，并明确要求另建独立 private 分组；此授权取代前一阶段“不写线上账号/数据库”的限制，原服务不得停止的约束保持有效。

- 使用已有管理员浏览器会话创建 `GitHub Copilot (private)`（账号 ID 5）及 `Copilot_private`（分组 ID 7）。分组为 OpenAI、专属、0.5 倍率，未复制其他分组账号。
- 账号仅绑定分组 7；从最初误选的既有 ChatGPT_private（分组 5）移出。旧账号和既有 API Key 归属保持原样。当前管理员获准使用新专属分组。
- 新账号并发及负载因子均为 1，强制 Chat Completions，禁用 Compact/WS/Embeddings。
- 网关凭证通过 Mac mini 本机程序直接安装到新账号；未将生成的凭证明文交给模型或浏览器。浏览器创建时使用非秘密占位值，安装完成前暂停新账号调度。
- 后台创建完成后页面渲染异常；仅对新账号执行有前置校验的局部数据库更新，并通过原生 scheduler_outbox 的 account_groups_changed 事件刷新账号及新旧分组缓存，无需重启服务。
- 已验证模型映射：copilot-gpt-4.1 → gpt-4.1；copilot-gpt-4o → gpt-4o；copilot-gpt-4o-mini → gpt-4o-mini。
- 三个别名分别经线上 18989 /v1/chat/completions 返回 HTTP 200 且包含有效 choices；usage_logs 确认 account_id=5。
- 验证使用本机生成的十分钟临时调用 Key，调用后已禁用并软删除，真实值未输出；未创建或索要临时管理员 API Key。
- 抽查 gpt-5.3-codex、gpt-6.1-sol、claude-sonnet-5.5、claude-opus-5.5、gemini-3.8-flash、gemini-4-argon、kimi-k3：当前适配器 Chat Completions 路径均返回 HTTP 400，故未开放。不能据此断言订阅在官方客户端完全不支持这些模型。
- 首轮并发探测触发 adapter 的 2 秒请求间隔限制（429）；改为逐次间隔超过 2 秒后重测，以上结果来自重测。
- 最终原 sub2api-snapshot 仍 running，StartedAt=2026-11-05T13:11:00.001051073Z，RestartCount=1；/health 返回 status=ok。
- 本轮仅补充部署配置和验证记录，没有修改应用源码，先前完整测试结果仍列于上文；长期续期及在线断连取消仍未验证。
