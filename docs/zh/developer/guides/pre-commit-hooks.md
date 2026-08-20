---
title: Pre-commit Hooks
order: 104
---

# Pre-commit Hooks

项目使用 pre-commit 工具自动运行代码检查。

## 安装

```bash
# 安装 pre-commit
pip install pre-commit

# 安装 hooks
pre-commit install
```

## 检查项

| 检查项 | 说明 |
|-------|------|
| ESLint | 代码规范检查 |
| Prettier | 格式化检查 |
| 敏感信息检测 | 防止泄露密钥等 |
| 大文件检测 | 防止提交大文件 |

## 跳过 Hooks

```bash
git commit --no-verify -m "跳过检查"
```

## 相关文档

- [CI/CD 配置](ci-cd.md)
