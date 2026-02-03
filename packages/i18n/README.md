# @browser-fs-analyzer/i18n

共享的国际化 (i18n) package，提供中英文翻译支持。

## 安装

```bash
pnpm add @browser-fs-analyzer/i18n
```

## 使用

### 1. 在项目中集成

**创建 Zustand Store**:

```typescript
// src/i18n/store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '@browser-fs-analyzer/i18n'

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'zh-CN',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'app-i18n' }
  )
)
```

**创建 Hook 封装**:

```typescript
// src/i18n/index.ts
import { createUseT } from '@browser-fs-analyzer/i18n'
import { useI18nStore } from './store'

export function useT() {
  const locale = useI18nStore((state) => state.locale)
  return createUseT(locale)
}

export function useLocale() {
  const { locale, setLocale } = useI18nStore()
  return [locale, setLocale] as const
}

export type { Locale, TranslationKey } from '@browser-fs-analyzer/i18n'
```

### 2. 在组件中使用

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

### 3. 静态翻译（组件外部）

```typescript
import { t } from '@browser-fs-analyzer/i18n'

const message = t('zh-CN', 'common.save') // '保存'
```

## API

### `createUseT(locale: Locale)`

创建翻译 Hook 的工厂函数。

### `t(locale: Locale, key: string, params?)`

静态翻译函数，用于 React 组件外部。

### `getNested(obj, path)`

获取嵌套对象的值，支持点号路径。

### `interpolate(template, params)`

字符串插值，替换 `{var}` 占位符。

### `LOCALE_LABELS`

语言标签映射：`{ 'zh-CN': '简体中文', 'en-US': 'English' }`

### `DEFAULT_LOCALE`

默认语言：`'zh-CN'`

### `SUPPORTED_LOCALES`

支持的语言列表：`['zh-CN', 'en-US']`

## 类型

```typescript
type Locale = 'zh-CN' | 'en-US'
type TranslationKey = 'common.save' | 'common.close' | ...
```

## 添加新翻译

1. 在 `src/locales/zh-CN.ts` 添加中文
2. 在 `src/locales/en-US.ts` 添加英文
3. 在 `src/config.ts` 注册新语言（如果需要）

## License

MIT
