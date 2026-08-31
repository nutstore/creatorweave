---
title: 接入 Ollama 本地模型
order: 4
---

# 接入 Ollama 本地模型

[Ollama](https://ollama.com) 让你在自己电脑上本地运行大模型（Qwen、Llama、DeepSeek 等）。EO2Weave 通过 Ollama 内置的 **OpenAI 兼容接口**与其对接——无需注册、无需 API Key，对话数据完全不经过第三方服务。

> 本指南同样适用于其他暴露 OpenAI 兼容接口的本地服务（LM Studio、llama.cpp server、vLLM 等），只需把 Base URL 换成对应地址即可。

## 前置准备

1. **安装并启动 Ollama**：从 [ollama.com](https://ollama.com) 下载安装，安装后 Ollama 会自动在本机 `11434` 端口提供服务（菜单栏 / 系统托盘可看到图标）。

2. **拉取一个支持工具调用的模型**。EO2Weave 的 Agent 能力依赖 function calling，请选择 Ollama 模型页标注 `tools` 的模型，例如：

   ```bash
   ollama pull qwen3        # 支持工具调用，中文友好
   ollama pull llama3.1     # 支持工具调用
   ```

   > ⚠️ 不支持工具调用的纯对话模型无法完成 Agent 任务（读写文件等操作会失败或空转）。

## 在 EO2Weave 中配置

1. 打开 **设置 → LLM 服务商 → 新增服务商**
2. 按下表填写：

   | 字段 | 填写内容 |
   |------|---------|
   | 服务商名称 | 随意，如 `Ollama 本地` |
   | API Base URL | `http://localhost:11434/v1` |
   | API 模式 | `Chat Completions`（默认） |
   | API Key | **留空即可** |

3. 点击 **创建**
4. 展开该服务商卡片，点击 **「从 API 刷新模型列表」**——Ollama 上已安装的模型会自动出现在列表中（也可以手动输入模型名添加）
5. 通过顶部模型切换器选中 Ollama 的模型，即可开始对话

> 💡 Base URL 末尾的 `/v1` **不能省略**——它是 OpenAI 兼容层的路径前缀，漏掉会导致所有请求 404。

## 跨域（CORS）配置

EO2Weave 是浏览器应用，对话请求由**浏览器直接发往本机 Ollama**。Ollama 出于安全考虑，默认只接受来自 `localhost` 的跨域请求，因此：

| EO2Weave 的打开方式 | 是否可用 |
|--------------------|---------|
| `http://localhost:xxxx`（本地开发） | ✅ 默认即可用，无需配置 |
| 部署域名（如 `https://weave.example.com`） | ❌ 需要配置 `OLLAMA_ORIGINS` |
| 局域网 IP（如 `http://192.168.1.5:3000`） | ❌ 需要配置 `OLLAMA_ORIGINS` |

**判断方法**：对话报 `Failed to fetch` 时，打开浏览器 DevTools（F12）→ Network 面板，若发往 `localhost:11434` 的请求显示 CORS / 跨域错误，按下文配置即可。

### 设置 `OLLAMA_ORIGINS`

将环境变量 `OLLAMA_ORIGINS` 设为 `*`（允许所有来源），或精确填写 EO2Weave 的访问地址（多个用逗号分隔）：

| 系统 | 操作步骤 |
|------|---------|
| **macOS** | 终端执行 `launchctl setenv OLLAMA_ORIGINS "*"`，然后完全退出菜单栏的 Ollama，重新打开 |
| **Windows** | 系统设置搜索「编辑系统环境变量」→ 环境变量 → 新建**用户变量** `OLLAMA_ORIGINS`，值为 `*`，然后在系统托盘退出 Ollama 并重新启动 |
| **Linux（systemd）** | `sudo systemctl edit ollama` 写入 `[Service]` 段与 `Environment="OLLAMA_ORIGINS=*"`，保存后执行 `sudo systemctl daemon-reload && sudo systemctl restart ollama` |
| **前台手动运行** | `OLLAMA_ORIGINS="*" ollama serve` |

> 🔒 精确限制更安全：如 `OLLAMA_ORIGINS="https://weave.example.com"`。`*` 意味着你打开的**任何网页**都有权访问本地模型，仅建议个人电脑使用。具体写法以 [Ollama 官方 FAQ](https://docs.ollama.com/faq) 为准。

### Ollama 不在本机时

若 Ollama 部署在局域网另一台机器上：

1. 让 Ollama 监听外部地址：设置环境变量 `OLLAMA_HOST=0.0.0.0` 后重启
2. EO2Weave 中 Base URL 填 `http://<目标机器IP>:11434/v1`
3. `OLLAMA_ORIGINS` 按上文配置（此时必然跨域）

> ⚠️ **混合内容限制**：如果 EO2Weave 页面是 **https** 加载的，浏览器会拦截发往局域网 `http://IP` 的请求（`localhost` 例外，不受影响）。此场景建议将 Ollama 通过反向代理提供 https 访问，或改用 http 方式打开 EO2Weave。

## 建议的附加配置

| 环境变量 | 作用 | 建议 |
|---------|------|------|
| `OLLAMA_CONTEXT_LENGTH` | 模型默认上下文长度（默认值较小，约 4K tokens） | 设为 `32768` 或更高——Agent 任务携带的系统提示、文件内容较长，上下文太小会导致模型"遗忘"前文或截断 |
| `OLLAMA_ORIGINS` | 允许的跨域来源 | 见上节 |
| `OLLAMA_HOST` | 监听地址 | Ollama 与浏览器同机时无需设置 |

## 常见问题排查

| 现象 | 原因与处理 |
|------|-----------|
| 刷新模型列表报 `Failed to fetch` | Ollama 未启动；或跨域被拦截——按上文配置 `OLLAMA_ORIGINS` |
| 模型列表为空 | 本机尚未 `ollama pull` 任何模型，先拉取模型 |
| 对话报 404 / model not found | Base URL 漏了末尾 `/v1`；或所选模型已被删除（`ollama list` 确认） |
| 对话正常但 Agent 不执行文件操作 / 工具调用报错 | 所选模型不支持 function calling，换 `qwen3`、`llama3.1` 等带 `tools` 标注的模型 |
| 响应中途截断、对话变长后开始"失忆" | 上下文长度不足，调大 `OLLAMA_CONTEXT_LENGTH` 后重启 Ollama |
| 顶部一直提示「未配置 API Key」 | 确认当前选中的是 Ollama 这个**自定义服务商**（自定义服务商只需 Base URL，无需 Key）；若用的是内置服务商（OpenAI、DeepSeek 等），Key 仍然是必填的 |

## 工作原理（可选阅读）

Ollama 自 v0.1.24 起内置 OpenAI 兼容层，EO2Weave 的自定义服务商调用的正是这两个端点：

| 操作 | 端点 |
|------|------|
| 拉取模型列表 | `GET http://localhost:11434/v1/models` |
| 流式对话（含工具调用） | `POST http://localhost:11434/v1/chat/completions` |

因此 Ollama 原生的 `/api/generate`、`/api/chat` 端点在本流程中**不会**被用到，也无需额外适配。
