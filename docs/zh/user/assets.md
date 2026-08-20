---
title: 文件与资源
order: 5
---

# 文件与资源（Assets）

Assets 是你与 AI 之间交换文件的桥梁。你可以上传文件让 AI 分析，AI 也能生成文件（图表、报表等）供你下载。

## 上传文件

### 操作方式

在聊天输入框中，点击左侧 **📎 回形针按钮**，选择本地文件即可上传。

上传后，文件会以卡片形式显示在输入框上方。点击卡片上的 ✕ 可以移除未发送的文件。

### 支持的文件类型

所有常见文件类型均可上传，包括但不限于：

- **数据文件**: CSV, JSON, Excel
- **图片**: PNG, JPG, SVG, WebP
- **文档**: Markdown, TXT, PDF
- **代码**: 任何文本格式的源代码文件

### AI 如何处理上传的文件

发送消息后，AI 会自动读取你上传的文件内容。你可以直接提出需求：

```
📎 上传 sales-data.csv

分析这份数据，给出月度趋势摘要
```

```
📎 上传 screenshot.png

这个 UI 有什么问题？给出改进建议
```

## AI 生成的文件

AI 在执行任务时可能生成文件，例如：

- 数据分析后的 CSV / Excel 报表
- Python 生成的图表（PNG）
- 处理后的导出文件

生成的文件会以卡片形式显示在 AI 的回复消息中，你可以直接**下载**。

### 图片预览

AI 生成的图片或你上传的图片会显示**缩略图预览**。点击缩略图可以**放大查看**全图，按 **Esc** 或点击背景关闭。

## 文件管理

### 存储位置

所有文件（上传的和生成的）都存储在浏览器的本地沙盒存储（OPFS）中，**不会上传到云端服务器**，也不会写入你的项目目录。

- 你的项目文件不会被污染
- 文件仅在当前工作区内可用
- 关闭浏览器后文件仍然保留

### 文件安全

- 文件仅存在于你的浏览器本地
- AI API 调用时**不会**将文件原文发送（仅发送文件名和大小等元数据）
- AI 通过本地工具按需读取文件内容

## Python 中使用 Assets

AI 在执行 Python 代码时，assets 目录挂载为 `/mnt_assets/`。

**读取你上传的文件：**

```python
import pandas as pd
df = pd.read_csv('/mnt_assets/sales-data.csv')
```

**输出文件给你：**

```python
df.describe().to_csv('/mnt_assets/analysis_result.csv')
```

**生成图表：**

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

plt.figure()
plt.plot(df['month'], df['revenue'])
plt.savefig('/mnt_assets/trend.png')
plt.close()
```

写入 `/mnt_assets/` 的文件会自动显示在聊天中，你可以预览和下载。
