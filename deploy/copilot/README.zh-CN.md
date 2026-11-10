# Copilot 独立上游

复用 Sub2API 现有 OpenAI API Key 上游能力，无需替换正在运行的 Sub2API。这里只部署两个独立容器：Copilot 适配器和带认证的网关。不会执行数据库迁移，不会操作原 Sub2API 的 compose 项目。

## 来源与协议边界

适配器来源：[ericc-ch/copilot-api](https://github.com/ericc-ch/copilot-api)，锁定提交 `0ea08febdd7e3e055b03dd298bf57e669500b5c1`（0.7.0），源码归档 SHA-256 固定在 Dockerfile 中。它是非官方协议适配器，不是官方 Copilot SDK，兼容性可能随上游变化。它按 Copilot 自身规则消耗账号额度；本集成不绕过限流，也不保证订阅中的所有模型都有 Chat Completions 接口。

选择这个实现是为了保留普通模型转发、流式及外部工具调用语义，避免将官方 SDK 的 Agent 执行循环误作普通聊天接口。该锁定源码较旧；必须用真实账号验证后才可认为接通。不得以源码审查替代在线兼容验证。

本地 `harden.mjs` 删除 `/token` 路由、统一返回不含原始上游正文的错误，并将断连取消传给上游请求。认证网关只开放 `/v1/models`、`/v1/chat/completions`、`/v1/messages` 及 `/v1/messages/count_tokens`。`/v1/responses` 返回明确的 501，`/token`、`/usage` 等路径返回 404。不提供工具执行、文件读写或 shell 能力；外部工具调用仍由客户端执行。

## 初始化和构建

需要 Docker Compose v2、Python 3.9+。在 Mac mini 独立开发副本中执行：

```sh
cd ~/Documents/sub2api-copilot/deploy/copilot
python3 manage.py init
python3 manage.py build
python3 manage.py gateway
python3 manage.py verify
```

`init` 复制 `.env.example` 中普通配置，并用系统随机源生成 `runtime/gateway.key`，不会显示其值。端口默认绑定宿主机 `127.0.0.1:18991`。`gateway` 仅启动网关，未授权时 `/healthz` 为 200，`/readyz` 为 503；这不代表 Copilot 模型已可用。

`runtime/`、`.env` 均被忽略。密钥、生成的认证配置和 GitHub token 文件权限为 0600，runtime/auth 目录权限为 0700。不要提交、输出或截图这些文件，也不要执行会展开秘密的配置预览。容器未配置环境变量 token，运行日志关闭。

## 登录 Copilot

```sh
python3 manage.py auth
```

程序只显示 GitHub 设备授权页面和用户验证码。用户在自己的浏览器完成授权，GitHub token 由程序直接保存到 `runtime/auth/github_token`。不要把 token 粘贴到聊天或命令参数中。设备授权会过期，可重新运行；程序不会将 gh CLI 的登录凭据当作 Copilot 凭据使用。

```sh
python3 manage.py start
python3 manage.py status
python3 manage.py verify
```

`start` 仅启动本目录的两个容器，缺少 token 时拒绝启动适配器。令牌续期由适配器处理；失败时可能触发该独立容器重启，不影响 Sub2API。仅保存 GitHub 凭据不代表账号拥有 Copilot 权限，须确认 `/readyz` 和已认证 `/v1/models` 均成功。

## 接入正在运行的 Sub2API

本次交付遵守已确认的“原数据库不修改”边界：只生成私密账号模板，不向线上管理 API 写入账号或分组。以下为后续接入操作说明；新增线上账号本身会写数据库，应在用户允许该写入后执行。它不需要停止或重启中转站。

先在现有 Sub2API 容器里确认宿主机可达（无需传入密钥）：

```sh
docker exec sub2api-snapshot wget -q -O - http://host.docker.internal:18991/healthz
```

只有该探测成功才使用此地址。宿主机上的 `127.0.0.1` 与容器内的 `127.0.0.1` 不同；其他 Docker 实现可能无法经 host.docker.internal 到达回环端口，不能据此改绑公网地址。

在 Sub2API 管理端新增独立账号，保留原账号配置：

- 平台 OpenAI，类型 API Key，自定义 Base URL `http://host.docker.internal:18991`。
- API Key 从本机 `runtime/gateway.key` 经本机程序填入，勿输出到聊天。
- Responses 支持模式设置为强制 Chat Completions：`extra.openai_responses_mode = "force_chat_completions"`，同时记录 `openai_responses_supported = false`。
- 并发 1，仅加入专用 Copilot 分组；模型使用实际 `/v1/models` 返回的 ID，不凭名称猜测。
- 先使用 Chat Completions 客户端。新源码会将不支持 Responses 的账号排除在 Responses 调度之外，不承诺 Codex Responses 客户端能使用此账号。

可执行 `python3 manage.py account-template` 在 `runtime/account.json` 生成含真实本地网关密钥的私密管理 API 请求模板，不显示内容，也不自动创建账号。上传或调用管理 API时只能由本机程序读取此文件；不要 cat 或提交。分组 ID 按实际管理端填写。该模板不是批量账号导入文件。

管理 API 在线新增账号不需要重启 Sub2API。创建成功后，还需经 Sub2API 专用分组验证普通请求、SSE、工具调用及限流错误，才可声称端到端接通。当前登录状态和实际完成项见 `VALIDATION.zh-CN.md`。

## 状态、资源与回滚

独立 Compose 项目固定为 `sub2api-copilot`。网关 CPU 上限 0.25/64 MiB，适配器 0.5/512 MiB；限制并发和调用间隔。构建和完整测试同样应控制并行度，不要与线上容器争抢内存。

```sh
python3 manage.py stop
```

只停止这两个独立服务，保留登录数据；不调用原项目的 `down`、`restart`、`up` 或删除数据库。若已新增 Sub2API 账号，先禁用该账号，再停止适配服务。撤销 GitHub 设备登录可在 GitHub 的 Applications 设置中处理。不要撤销其他应用凭据。

如需更新适配器，必须重新审查源码并同时更新提交、归档摘要、本地补丁和版本标签；补丁源码不匹配时构建会失败，不能跳过校验。当前版本不支持在线旋转网关密钥，旋转应仅停止独立侧车后完成，并同步更新新增账号。

## 本次真实可用模型

已实测 gpt-4.1 的普通请求、SSE、工具调用及 Messages 转换均成功。Haiku 5.5/4.5 虽在模型目录中出现，但实际返回 400；不要将目录中的所有模型直接加入可用白名单。
