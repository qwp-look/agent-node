# qqbot-agent

QQ 机器人"小克"的远程执行器，部署在 infrlo。由 Orkestr 上的机器人通过 LLM 工具调用（tool call）远程操作。

## 端点

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/` | 无 | 状态/保活 |
| POST | `/run` | Bearer token | `{command}` 执行 shell（60s 超时） |
| POST | `/fetch` | Bearer token | `{url}` 抓取网页返回前 4000 字符 |

## 环境变量

- `AGENT_TOKEN`（必填）：Bearer 鉴权 token
- `BOT_PING_URL`：定时 ping 的机器人地址（双向保活）
- `PING_INTERVAL_MS`：默认 240000（4 分钟）

## 安全说明

`/run` 可以在容器内执行任意命令，仅靠 token 保护。token 泄露 = 服务器失守，请妥善保管，不要把 token 写进任何公开仓库。
