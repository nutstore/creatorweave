---
name: cw-audio-transcribe
description: 当用户上传或提及音频/视频文件（mp3、wav、m4a、ogg、webm、mp4）并需要语音转文字、说话人分离转写、会议纪要、通话整理、证据提取或基于转写的后续分析时使用。通过 AssemblyAI 从 Python 转写音频，支持复用已有转写产物，输出 Markdown + JSON 供下游分析。
version: "1.0.0"
category: general
tags: [audio, transcription, assemblyai, speech-to-text, 语音转文字, 录音转写, 会议纪要]
triggers:
  keywords: [音频转写, 录音转写, 语音转文字, 转写, 逐字稿, 会议纪要, 通话纪要, transcription, transcribe, speech to text, 录音整理, 通话整理]
metadata:
  skill_version: "1.0.0"
---

# Audio Transcribe — 音频转写 & 分析

把音频变成可复用的文字，再分析文字。

不要直接从原始音频字节推理。在总结、提取证据或回答细节问题之前，始终先生成或复用转写产物。

## ✅ 首次使用：密钥配置引导

本 skill 依赖 **AssemblyAI** 语音转写服务（支持 99 种语言、说话人分离、按音频时长计费）。

### AssemblyAI 服务简介

| 项目 | 详情 |
|------|------|
| 免费额度 | **$50 信用额度**，注册即用，无需绑卡 |
| 计费方式 | 按音频时长（Universal-2: $0.15/小时；Universal-3.5 Pro: $0.21/小时） |
| 免费额度能转多久 | 约 **333 小时**（Universal-2）/ **238 小时**（Universal-3.5 Pro） |
| 支持语言 | 99 种，包括中英文混说 |
| 功能 | 语音转文字、说话人分离、时间戳、自定义词汇 |

$50 免费额度对个人用户非常充裕（约 300+ 小时录音）。

### 检查流程

**不要假设密钥已配置**——在首次转写前检查环境：

```
首次触发 skill
  ↓
检查 os.getenv("ASSEMBLYAI_API_KEY")
  ↓
判断结果：
```

| 检查结果 | 诊断 | 引导动作 |
|----------|------|----------|
| 环境变量有值 | ✅ 密钥已配置 | 继续执行转写任务 |
| 环境变量为空或未设置 | ❌ 密钥未配置 | 见下方「引导配置」 |

### 引导配置

用简洁友好的语言告知（**不要**显示任何密钥值）。参考话术：

> 这个功能使用 AssemblyAI 语音转写服务，新用户有 $50 免费额度（约 300+ 小时录音），无需绑卡。
>
> **获取方式**（约 2 分钟）：
> 1. 打开 https://www.assemblyai.com/ 注册/登录
> 2. 在 Dashboard 获取你的 API Key
> 3. 在 EO2Weave 的 **Settings → Secret Manager** 中，新增一个名为 `ASSEMBLYAI_API_KEY` 的密钥，粘贴该值
> 4. 回来重新对我说「转写这个音频」

**重要**：
- 配置完成后密钥会在**下一次 Python 执行时生效**（无需重启）
- 不要让用户把密钥粘贴到对话里——必须存到 Secret Manager
- 引导时介绍免费额度信息（$50 / 约 300+ 小时），降低用户顾虑

## ⚠️ EO2Weave 环境约束

1. **密钥走环境变量**：EO2Weave 把 Secret Manager 中的 `ASSEMBLYAI_API_KEY` 自动注入为 Pyodide 环境变量，脚本通过 `os.getenv("ASSEMBLYAI_API_KEY")` 读取。**永远不要把密钥写在对话、脚本或配置文件里。**
2. **API 调用走 Pyodide pyfetch**：AssemblyAI 的 API 通过 Pyodide 的 `pyfetch` 发起（脚本内部已处理），不需要浏览器扩展。
3. **文件路径**：上传的文件在 `/mnt_assets/` 下，工作区文件在 `/mnt/{rootName}/` 下。

## 工作流

1. 确认音频文件路径。
2. 导入 helper script（路径见下方「最短示例」）。
3. 优先使用 `await transcribe_or_reuse(...)`，自动复用已有转写产物。
4. 使用生成的 Markdown 转写文本做摘要、纪要、证据提取。
5. 仅在需要时间戳、说话人、结构化段落时读取 JSON 转写文件。

## 最短示例

```python
import os, sys

# 1. 检查密钥
api_key = os.getenv("ASSEMBLYAI_API_KEY", "")
if not api_key:
    raise RuntimeError(
        "ASSEMBLYAI_API_KEY 未配置。请在 Settings → Secret Manager 中添加该密钥。"
    )

# 2. 导入 helper（user skill 挂载在 /mnt_skills/user/ 下）
skill_scripts = "/mnt_skills/user/cw-audio-transcribe/scripts"
if skill_scripts not in sys.path:
    sys.path.insert(0, skill_scripts)

from transcribe_audio import transcribe_or_reuse

result = await transcribe_or_reuse(
    "/mnt_assets/meeting.m4a",  # 音频文件路径
)
print(result["markdown_path"])
print(result["json_path"])
```

需要强制重新转写、指定输出目录或直接传 api_key 时，使用 `transcribe_audio(...)`。

## 输出

默认行为：

- 转写文件写在源音频文件旁边
- `meeting.wav` 生成 `meeting.transcript.md` 和 `meeting.transcript.json`

可选行为：

- 指定 `output_dir` 后，转写文件写到该目录
- 已有新鲜转写产物且 `reuse_existing=True` 时，直接复用，不重新上传

## 注意事项

- 始终先转写或复用，再做总结分析
- 普通阅读用 Markdown，时间戳/说话人/结构化处理用 JSON
- 转写失败时，展示 helper 返回结果中检查过的配置路径和配置来源
- 不要用于纯图片 OCR、PDF/DOCX 文本提取、普通文本文件，或用户已有转写文本且无需处理音频的场景
