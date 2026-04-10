---
title: CI/CD 配置
order: 103
---

# CI/CD 配置

当前仓库以本地质量检查为主。

目前代码仓库中未跟踪 `.github/workflows/` 下的 CI 工作流文件。
如需在 PR/push 上启用远端 CI，请先补充 workflow。

## CI 流程

当前建议的提交前检查：

1. `pnpm -C web run typecheck`
2. `pnpm -C web run lint`
3. `pnpm -C web run test:run`（或针对性测试）
4. `pnpm -C mobile-web run typecheck`
5. `pnpm -C relay-server run typecheck`

## 本地验证

在提交前运行：

```bash
pnpm lint          # ESLint 检查
pnpm typecheck     # 类型检查
pnpm test          # 单元测试
pnpm test:e2e      # E2E 测试
```

## 启用远端 CI（可选）

- 建议在 `.github/workflows/ci.yml` 新增 workflow
- 推荐至少覆盖：类型检查、ESLint、单元测试、构建

## 相关文档

- [Pre-commit Hooks](pre-commit-hooks.md)
