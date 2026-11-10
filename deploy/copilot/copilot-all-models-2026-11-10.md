# Copilot 全模型验证（2026-11-10）

当前目录共 47 个模型 ID，均已发起真实请求。

- 13 个 ID 通过适配器，包含旧名称和日期别名。
- 1 个 ID 仅通过上游 Responses 接口。
- 28 个 ID 被上游明确拒绝，错误为 model_not_supported。
- 5 个特殊端点未取得有效结果，不能直接判定为账号无权限。

gpt-5.4-nano 经上游 /responses 返回 200 和有效 output。
当前适配器尚未实现 Responses，不能通过当前中转调用它。

## 完整结果

| 模型 ID | 类型 | 上游接口 | 上游 HTTP | 适配器 HTTP | 返回模型 | 结论 |
|---|---|---|---|---|---|---|
| claude-fable-5.1 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| claude-fable-5.2 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| claude-fable-5 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| claude-haiku-5.5 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| claude-opus-4.8-fast | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| claude-opus-4.8 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| claude-opus-5.5 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| claude-opus-5 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| claude-sonnet-5.5 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| claude-sonnet-5 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| copilot-search-a | chat | /chat/completions | 200 | 200 | copilot-search-a | 适配器通过 |
| copilot-search-b | chat | /chat/completions | 200 | 200 | copilot-search-b | 适配器通过 |
| gemini-3.8-flash | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| gemini-4-argon | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| gpt-5.3-codex | chat | /responses | 400 | 接口未实现 | - | 上游拒绝模型 |
| gpt-5.4-nano | chat | /responses | 200 | 接口未实现 | gpt-5.4-nano-2026-03-17 | 上游通过，适配器缺接口 |
| gpt-5.6-luna | chat | /responses | 400 | 接口未实现 | - | 上游拒绝模型 |
| gpt-5.6-sol | chat | /responses | 400 | 接口未实现 | - | 上游拒绝模型 |
| gpt-5.6-terra | chat | /responses | 400 | 接口未实现 | - | 上游拒绝模型 |
| gpt-6.1-sol | chat | /responses | 400 | 接口未实现 | - | 上游拒绝模型 |
| gpt-6-astra | chat | /responses | 400 | 接口未实现 | - | 上游拒绝模型 |
| gpt-6-luna-decisions | decisions | /v1/decisions | 400 | 接口未实现 | - | 特殊端点未验证通过 |
| gpt-6-luna | chat | /responses | 400 | 接口未实现 | - | 上游拒绝模型 |
| gpt-6-sol | chat | /responses | 400 | 接口未实现 | - | 上游拒绝模型 |
| kimi-k3-base | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| kimi-k3-copilot | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| kimi-k3 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| mai-code-1.1-flash | chat | /responses | 400 | 接口未实现 | - | 上游拒绝模型 |
| gpt-4o-mini-2024-07-18 | chat | /chat/completions | 200 | 200 | gpt-4o-mini-2024-07-18 | 适配器通过 |
| gpt-4o-2024-11-20 | chat | /chat/completions | 200 | 200 | gpt-4o-2024-11-20 | 适配器通过 |
| gpt-4o-2024-08-06 | chat | /chat/completions | 200 | 200 | gpt-4o-2024-08-06 | 适配器通过 |
| text-embedding-3-small | embeddings | /embeddings | 400 | 接口未实现 | - | 特殊端点未验证通过 |
| text-embedding-3-small-inference | embeddings | /embeddings | 400 | 接口未实现 | - | 特殊端点未验证通过 |
| claude-haiku-4.5 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| gpt-4.1-2025-04-14 | chat | /chat/completions | 200 | 200 | gpt-4.1-2025-04-14 | 适配器通过 |
| gpt-41-copilot | completion | /completions | 404 | 接口未实现 | - | 特殊端点未验证通过 |
| gpt-3.5-turbo-0613 | chat | /chat/completions | 200 | 200 | gpt-4o-mini-2024-07-18 | 适配器通过 |
| gpt-4 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| gpt-4-0613 | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| gpt-4-0125-preview | chat | /chat/completions | 400 | 400 | - | 上游拒绝模型 |
| gpt-4o-2024-05-13 | chat | /chat/completions | 200 | 200 | gpt-4.1-2025-04-14 | 适配器通过 |
| gpt-4-o-preview | chat | /chat/completions | 200 | 200 | gpt-4.1-2025-04-14 | 适配器通过 |
| gpt-4.1 | chat | /chat/completions | 200 | 200 | gpt-4.1-2025-04-14 | 适配器通过 |
| gpt-3.5-turbo | chat | /chat/completions | 200 | 200 | gpt-4o-mini-2024-07-18 | 适配器通过 |
| gpt-4o-mini | chat | /chat/completions | 200 | 200 | gpt-4o-mini-2024-07-18 | 适配器通过 |
| gpt-4o | chat | /chat/completions | 200 | 200 | gpt-4o-2024-11-20 | 适配器通过 |
| text-embedding-ada-002 | embeddings | /embeddings | 400 | 接口未实现 | - | 特殊端点未验证通过 |

## 验证边界

本轮没有修改模型权限、订阅或线上账号映射。
线上 Copilot_private 仍开放此前验证的三个别名。
其他成功项仅代表独立适配器或上游调用成功。

测试仅验证普通短响应，没有逐一验证工具、SSE 或视觉。
目录里的 enabled/disabled 不能替代实际调用结果。
请求间隔至少 2.6 秒，没有修改现有保护措施。
GPT-4o mini 直连首次网络失败，重试与适配器测试均成功。

三个 embedding 请求均返回 400 Bad Request。
decisions 请求也返回 400 Bad Request。
通用 400 无法区分请求格式、端点权限和模型权限。
completion 模型 /completions 返回 404。
对它补测 /chat/completions，返回 model_not_supported。

原中转站保持运行，启动时间和重启次数均未变化。
StartedAt：2026-11-05T13:11:00.001051073Z；RestartCount：1。
最终 /health 返回 status=ok。
