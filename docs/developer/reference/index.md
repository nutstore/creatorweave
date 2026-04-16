---
title: API 参考
order: 300
---

# API 参考

CreatorWeave 的 API 接口文档。

## 目录

本节包含详细的 API 参考文档：

- [完整 API 文档](README.md) - 包含 Stores、Services、Repositories、Hooks、Components 的详细 API 定义

## 代理服务器接口

### 创建会话

```
POST /api/sessions
```

创建新的远程会话。

### 获取会话

```
GET /api/sessions/:id
```

获取指定会话的信息。

### 删除会话

```
DELETE /api/sessions/:id
```

删除指定会话。

### 消息格式

#### 请求格式

```json
{
  "type": "message",
  "payload": {
    "content": "消息内容"
  }
}
```

#### 响应格式

```json
{
  "type": "message",
  "payload": {
    "content": "响应内容"
  }
}
```

## 错误码

| 错误码 | 说明 |
|--------|------|
| 400 | 请求格式错误 |
| 401 | 未授权 |
| 404 | 会话不存在 |
| 500 | 服务器错误 |
