# @creatorweave/i18n

共享的国际化 (i18n) package，提供中英文翻译支持。

## 特性

- 🌍 支持中英文双语
- 💾 Zustand + localStorage 持久化
- 🎯 轻量级，无外部运行时依赖
- 📝 类型安全的翻译键
- 🔧 支持字符串插值 `{var}`
- 🔄 自动回退到默认语言

## 安装

```bash
# workspace protocol
pnpm add @creatorweave/i18n

# or in package.json
"dependencies": {
  "@creatorweave/i18n": "workspace:*"
}
```

## 快速开始

### 1. 创建 Zustand Store

```typescript
// src/i18n/store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@creatorweave/i18n'

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'zh-CN' as Locale,
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'app-i18n' }
  )
)
```

### 2. 创建 Hook 封装

```typescript
// src/i18n/index.ts
import { createUseT } from '@creatorweave/i18n'
import { useI18nStore } from './store'

export function useT() {
  const locale = useI18nStore((state) => state.locale)
  return createUseT(locale)
}

export function useLocale() {
  const { locale, setLocale } = useI18nStore()
  return [locale, setLocale] as const
}

export type { Locale } from '@creatorweave/i18n'
```

### 3. 在组件中使用

```typescript
import { useT } from '@/i18n'

function Component() {
  const t = useT()

  return (
    <div>
      <h1>{t('welcome.title')}</h1>
      <button>{t('common.save')}</button>
      <p>{t('skills.enabledCount', { count: 5, total: 10 })}</p>
    </div>
  )
}
```

## 翻译键

### 通用 (`common`)

| 键 | 中文 | 英文 |
|---|------|------|
| save | 保存 | Save |
| cancel | 取消 | Cancel |
| close | 关闭 | Close |
| refresh | 刷新 | Refresh |

### 设置 (`settings`)

| 键 | 中文 | 英文 |
|---|------|------|
| title | 设置 | Settings |
| llmProvider | LLM 服务商 | LLM Provider |
| apiKey | API Key | API Key |
| modelName | 模型名称 | Model Name |
| maxTokens | 最大输出 Tokens | Max Tokens |

### 欢迎页 (`welcome`)

| 键 | 中文 | 英文 |
|---|------|------|
| title | CreatorWeave | CreatorWeave |
| tagline | AI 原生创作者工作台 | AI-Native Creator Workspace |
| placeholder | 输入消息开始对话... | Type a message to start... |

### 技能管理 (`skills`)

| 键 | 中文 | 英文 |
|---|------|------|
| title | 技能管理 | Skills Manager |
| filterAll | 全部 | All |
| filterEnabled | 已启用 | Enabled |
| createNew | 新建技能 | Create Skill |

### 远程控制 (`remote`)

| 键 | 中文 | 英文 |
|---|------|------|
| title | 远程控制 | Remote Control |
| host | HOST | HOST |
| disconnect | Disconnect | Disconnect |

### 会话 (`session`)

| 键 | 中文 | 英文 |
|---|------|------|
| current | 当前会话 | Current Session |
| notInitialized | 未初始化 | Not Initialized |
| noSession | 无会话 | No Session |

### 移动端 (`mobile`)

| 键 | 中文 | 英文 |
|---|------|------|
| back | 返回 | Back |
| settings.connectionStatus | 连接状态 | Connection Status |
| sessionInput.title | 加入远程会话 | Join Remote Session |

## API 参考

### `createUseT(locale: Locale)`

创建翻译函数。

```typescript
const t = createUseT('zh-CN')
t('common.save') // '保存'
```

### `t(locale, key, params?)`

静态翻译函数，用于非 React 环境。

```typescript
import { t } from '@creatorweave/i18n'
t('zh-CN', 'common.save') // '保存'
t('en-US', 'session.pendingCount', { count: 5 }) // '5 pending'
```

### `getNested(obj, path)`

获取嵌套对象值。

### `interpolate(template, params)`

字符串插值。

### `LOCALE_LABELS`

```typescript
{ 'zh-CN': '简体中文', 'en-US': 'English' }
```

## 类型

```typescript
type Locale = 'zh-CN' | 'en-US'
```

## 添加新翻译

1. 在 `src/locales/zh-CN.ts` 添加中文键值
2. 在 `src/locales/en-US.ts` 添加英文键值
3. 在组件中使用 `t('your.key')` 调用

## License

MIT

