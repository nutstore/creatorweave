import Link from 'next/link'
import type { ReactNode } from 'react'
import styles from './privacy-page.module.css'

type Locale = 'en' | 'zh'

type Section = {
  id: string
  title: string
  body: ReactNode
}

type Copy = {
  documentLabel: string
  title: string
  lead: string
  appliesTo: string
  updated: string
  updatedValue: string
  localLabel: string
  localValue: string
  summary: Array<{ icon: 'device' | 'choice' | 'shield'; title: string; body: string }>
  contents: string
  intro: ReactNode
  sections: Section[]
  backToProduct: string
  contactLabel: string
}

const copy: Record<Locale, Copy> = {
  en: {
    documentLabel: 'Privacy, by design',
    title: 'Your work stays yours.',
    lead:
      'EO2Weave is built around local processing, explicit actions, and controls you can revoke. This policy explains what the browser extension processes and when data may leave your device.',
    appliesTo: 'EO2Weave browser extension',
    updated: 'Last updated',
    updatedValue: 'August 17, 2026',
    localLabel: 'Operating model',
    localValue: 'Local-first',
    summary: [
      {
        icon: 'device',
        title: 'Processed on your device',
        body: 'Settings, authorizations, caches, and task context remain local unless a task requires an external service.',
      },
      {
        icon: 'choice',
        title: 'Only when you ask',
        body: 'Page reading and interactions happen for tasks you explicitly initiate—never as silent background collection.',
      },
      {
        icon: 'shield',
        title: 'No ads or tracking',
        body: 'We do not sell your data, run behavioral advertising, or add third-party trackers to the extension.',
      },
    ],
    contents: 'On this page',
    intro: (
      <>
        This policy applies to the EO2Weave browser extension (the “extension”) offered by Astronet Technology Pte. Ltd. (“we”, “us”). We do not operate a server that receives your conversations, files, or browsing activity.
      </>
    ),
    sections: [
      {
        id: 'data-we-process',
        title: 'Data we process',
        body: (
          <>
            <p>The extension runs locally in your browser. To complete tasks, it may process the following information on your device:</p>
            <ul>
              <li><strong>Page content.</strong> When you or your agent ask about a page, the extension extracts the relevant content for that task.</li>
              <li><strong>Page interactions.</strong> With your consent, the agent may click controls or fill forms only for a task you initiate.</li>
              <li><strong>Local state.</strong> Settings, per-site authorization grants, and cached tool descriptions are stored locally on your device.</li>
              <li><strong>Search queries.</strong> When you request a web search, the query is passed to the search service needed to fulfill it.</li>
            </ul>
          </>
        ),
      },
      {
        id: 'what-we-do-not-do',
        title: 'What we do not do',
        body: (
          <ul>
            <li>We do not collect or upload your browsing history.</li>
            <li>We do not read pages in the background; content is processed only for tasks you explicitly run.</li>
            <li>We do not send your data to servers operated by us.</li>
            <li>We do not include ads or third-party trackers, and we do not sell or share your data.</li>
          </ul>
        ),
      },
      {
        id: 'ai-providers',
        title: 'AI model providers',
        body: (
          <p>To answer your request, the extension sends the relevant task content—which may include page content you asked about—to the AI model provider you configure. That provider processes the content under its own privacy policy. This happens only when you run a task, never automatically in the background.</p>
        ),
      },
      {
        id: 'webmcp',
        title: 'Website tools (WebMCP)',
        body: (
          <p>When a website exposes tools through WebMCP, the extension can list them for you. Using those tools requires your explicit per-site authorization, which you can revoke at any time. Tool calls are routed between your browser tabs only.</p>
        ),
      },
      {
        id: 'desktop-helper',
        title: 'Optional desktop helper',
        body: (
          <p>The extension can optionally integrate with a separately installed desktop helper so the agent can read and write files in folders you designate. It is never installed silently, and the extension works without it.</p>
        ),
      },
      {
        id: 'storage-deletion',
        title: 'Storage and deletion',
        body: <p>All local state—including settings, authorizations, and caches—stays on your device. Removing the extension deletes that extension data.</p>,
      },
      {
        id: 'changes',
        title: 'Changes to this policy',
        body: <p>We may update this policy as the extension changes. Material changes will be reflected on this page together with a revised update date.</p>,
      },
      {
        id: 'contact',
        title: 'Contact',
        body: <p>Questions about this policy are welcome.</p>,
      },
    ],
    backToProduct: 'Open EO2Weave',
    contactLabel: 'Email privacy support',
  },
  zh: {
    documentLabel: '隐私，始于设计',
    title: '你的工作，只属于你。',
    lead: 'EO2Weave 坚持本地处理、明确操作与可撤销授权。本政策说明浏览器扩展会处理哪些数据，以及数据可能在何时离开你的设备。',
    appliesTo: 'EO2Weave 浏览器扩展',
    updated: '最近更新',
    updatedValue: '2026 年 8 月 17 日',
    localLabel: '运行模式',
    localValue: '本地优先',
    summary: [
      {
        icon: 'device',
        title: '在你的设备上处理',
        body: '设置、授权、缓存和任务上下文默认保留在本地；仅当任务需要外部服务时才会发送必要内容。',
      },
      {
        icon: 'choice',
        title: '仅在你提出请求时',
        body: '读取页面和执行页面操作只为你明确发起的任务服务，不会在后台静默收集。',
      },
      {
        icon: 'shield',
        title: '无广告、无追踪',
        body: '我们不出售你的数据，不投放行为广告，也不会在扩展中加入第三方追踪器。',
      },
    ],
    contents: '本页目录',
    intro: (
      <>
        本政策适用于由 Astronet Technology Pte. Ltd.（“我们”）提供的 EO2Weave 浏览器扩展（“本扩展”）。我们不运营接收你的对话、文件或浏览活动的服务器。
      </>
    ),
    sections: [
      {
        id: 'data-we-process',
        title: '我们处理的数据',
        body: (
          <>
            <p>本扩展在你的浏览器中本地运行。为完成任务，它可能在你的设备上处理以下信息：</p>
            <ul>
              <li><strong>页面内容。</strong>当你或智能体就某个页面提问时，本扩展会为该任务提取相关页面内容。</li>
              <li><strong>页面操作。</strong>经你同意，智能体可为你发起的任务点击控件或填写表单。</li>
              <li><strong>本地状态。</strong>设置、按站点的授权记录及缓存的工具说明保存在你的设备上。</li>
              <li><strong>搜索查询。</strong>当你要求搜索网络时，查询内容会发送给完成该请求所需的搜索服务。</li>
            </ul>
          </>
        ),
      },
      {
        id: 'what-we-do-not-do',
        title: '我们不做的事',
        body: (
          <ul>
            <li>我们不收集、不上传你的浏览历史。</li>
            <li>我们不在后台读取页面；内容仅为你明确运行的任务而处理。</li>
            <li>我们不将你的数据发送到我们运营的服务器。</li>
            <li>我们不含广告与第三方追踪器，也不出售或共享你的数据。</li>
          </ul>
        ),
      },
      {
        id: 'ai-providers',
        title: 'AI 模型服务',
        body: <p>为响应你的请求，本扩展会将相关任务内容（可能包含你要求阅读的页面内容）发送给你自行配置的 AI 模型服务。该服务商会按其自身隐私政策处理这些内容。发送仅在你运行任务时发生，绝不会在后台自动进行。</p>,
      },
      {
        id: 'webmcp',
        title: '网站工具（WebMCP）',
        body: <p>当网站通过 WebMCP 提供工具时，本扩展可以将其列出。使用工具需要你按站点明确授权，且你可随时撤销。工具调用仅在你的浏览器标签页之间路由。</p>,
      },
      {
        id: 'desktop-helper',
        title: '可选的桌面助手',
        body: <p>本扩展可与单独安装的桌面助手集成，使智能体能够读写你指定文件夹中的文件。桌面助手绝不会被静默安装；不安装它，本扩展也可使用。</p>,
      },
      {
        id: 'storage-deletion',
        title: '存储与删除',
        body: <p>包括设置、授权和缓存在内的本地状态均保存在你的设备上。卸载扩展会删除这些扩展数据。</p>,
      },
      {
        id: 'changes',
        title: '政策变更',
        body: <p>我们可能随扩展功能变化更新本政策。重大变更会在本页体现，并同时更新最近更新日期。</p>,
      },
      {
        id: 'contact',
        title: '联系我们',
        body: <p>如对本政策有任何疑问，欢迎联系我们。</p>,
      },
    ],
    backToProduct: '打开 EO2Weave',
    contactLabel: '发送隐私问题邮件',
  },
}

function Icon({ name }: { name: 'device' | 'choice' | 'shield' }) {
  if (name === 'device') {
    return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M9 17h6" /></svg>
  }
  if (name === 'choice') {
    return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 12 2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
  }
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 5 6v5c0 4.8 2.8 8.2 7 10 4.2-1.8 7-5.2 7-10V6l-7-3Z" /><path d="m9.5 12 1.6 1.6 3.5-3.6" /></svg>
}

export function PrivacyPage({ locale }: { locale: Locale }) {
  const text = copy[locale]
  const isChinese = locale === 'zh'

  return (
    <div className={styles.page} lang={isChinese ? 'zh-CN' : 'en'}>
      <a className={styles.skipLink} href="#privacy-content">{isChinese ? '跳到主要内容' : 'Skip to main content'}</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/" aria-label="EO2Weave home">
            <span className={styles.brandMark} aria-hidden="true">✦</span>
            <span>EO2Weave</span>
          </Link>
          <div className={styles.headerActions}>
            <Link className={styles.productLink} href="/">{text.backToProduct} <span aria-hidden="true">↗</span></Link>
            <nav className={styles.languageSwitch} aria-label={isChinese ? '语言选择' : 'Language selection'}>
              {isChinese ? <Link className={styles.languageLink} href="/privacy/" hrefLang="en">EN</Link> : <span className={styles.languageActive}>EN</span>}
              {isChinese ? <span className={styles.languageActive}>中</span> : <Link className={styles.languageLink} href="/privacy/zh/" hrefLang="zh-CN">中</Link>}
            </nav>
          </div>
        </div>
      </header>

      <main id="privacy-content">
        <section className={styles.hero} aria-labelledby="privacy-title">
          <p className={styles.eyebrow}><span aria-hidden="true">●</span>{text.documentLabel}</p>
          <h1 id="privacy-title">{text.title}</h1>
          <p className={styles.heroLead}>{text.lead}</p>
          <div className={styles.metaRow}>
            <span className={styles.metaPill}>{text.appliesTo}</span>
            <span className={styles.metaPill}>{text.updated}: {text.updatedValue}</span>
            <span className={styles.metaPill}>{text.localLabel}: {text.localValue}</span>
          </div>
          <div className={styles.summaryGrid} aria-label={isChinese ? '隐私摘要' : 'Privacy summary'}>
            {text.summary.map((item) => (
              <article className={styles.summaryCard} key={item.title}>
                <span className={styles.summaryIcon}><Icon name={item.icon} /></span>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <div className={styles.bodyGrid}>
          <nav className={styles.toc} aria-label={text.contents}>
            <p className={styles.tocTitle}>{text.contents}</p>
            {text.sections.map((section, index) => <a href={`#${section.id}`} key={section.id}>{String(index + 1).padStart(2, '0')} · {section.title}</a>)}
          </nav>

          <article className={styles.article}>
            <p className={styles.intro}>{text.intro}</p>
            {text.sections.map((section, index) => (
              <section className={styles.section} id={section.id} key={section.id}>
                <span className={styles.sectionNumber}>{String(index + 1).padStart(2, '0')}</span>
                <h2>{section.title}</h2>
                {section.id === 'contact' ? (
                  <div className={styles.contactCard}>
                    {section.body}
                    <a href="mailto:support@eo2suite.cn">{text.contactLabel} →</a>
                  </div>
                ) : section.body}
              </section>
            ))}
          </article>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>© 2026 Astronet Technology Pte. Ltd.</span>
          <Link href={isChinese ? '/privacy/' : '/privacy/zh/'} hrefLang={isChinese ? 'en' : 'zh-CN'}>{isChinese ? 'Read in English' : '阅读简体中文版'}</Link>
        </div>
      </footer>
    </div>
  )
}
