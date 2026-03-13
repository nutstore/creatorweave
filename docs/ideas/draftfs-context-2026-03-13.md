# DraftFS / AgentFS 思路上下文记录（2026-03-13）

## 1. 背景
团队提出：将 Agent 的文件改动先写入草稿层，再 review/confirm 后落地真实仓库。
目标是提升可审计性、可回滚性与团队协作效率。

## 2. 目标定义
验证 AgentFS（建议内部命名 DraftFS）是否可以：
1. 作为 Agent 改动草稿层（overlay）
2. 准确捕获文件系统修改（基于 SQLite overlay）
3. 使用标准 diff 工具完成 review/confirm
4. confirm 后再落地真实仓库
5. 在此基础上支持 commit/rollback
6. 支持快照 + 同步 + 自动总结（帮助团队快速理解变化）

## 3. 当前共识
- 项目已具备较强基础能力：SQLite + OPFS、本地状态管理、工具链与 UI 体系。
- 当前状态“接近目标”，但尚未形成严格的 Draft 工作流语义。
- OPFS 当前更像主存储层，不等同于“强约束草稿层”。

## 4. 与现状的关键差距
1. 缺少统一写入口约束：需要保证 Agent 的所有写操作都经过 overlay。
2. 缺少强制 review gate：确认前不能直接落到真实仓库。
3. 缺少事务化 apply/rollback：失败要自动回滚。
4. 缺少快照差异到团队摘要的闭环。

## 5. 建议分层（MVP -> 扩展）

### MVP（先验证可行性）
1. 文本文件 create/modify/delete 的 overlay 记录
2. 基于 session 的草稿隔离
3. 标准 diff review（base vs overlay view）
4. confirm apply + discard rollback

### 扩展阶段
1. rename/chmod/symlink/二进制处理
2. 快照增量同步（blob 去重）
3. 针对快照差异自动生成团队摘要
4. 多 Agent 并发冲突策略

## 6. 推荐数据模型（草案）
1. `draft_sessions`：草稿会话
2. `draft_ops`：操作日志（create/modify/delete/rename...）
3. `draft_blobs`：内容寻址存储（hash -> content）
4. `draft_index`：路径当前状态（合并视图）

## 7. 风险点
1. 绕过 DraftFS 直接写真实 FS 导致漏记
2. diff 结果不可复现（非确定性）
3. 大文件与二进制成本
4. 多 Agent 并发冲突

## 8. 命名共识
- 对外品牌名可变化。
- 代码层建议使用中性命名（DraftFS / PluginAPI / app-*），避免再次全局重命名成本。

## 9. 后续讨论建议
下次讨论聚焦三件事：
1. MVP 边界（必须做/暂不做）
2. 写入口约束方案（工具层、服务层还是 FS 层）
3. apply/rollback 的事务边界与失败恢复策略

---
记录人：Codex（根据本次对话整理）
