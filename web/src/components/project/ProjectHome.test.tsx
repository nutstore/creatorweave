import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProjectHome } from './ProjectHome'

vi.mock('@/store/theme.store', () => ({
  useTheme: () => ({
    mode: 'light',
    setTheme: vi.fn(),
    accentColor: 'teal',
    setAccentColor: vi.fn(),
  }),
  ACCENT_COLORS: {
    teal: { hue: 170, saturation: 35, lightness: 45 },
    rose: { hue: 350, saturation: 50, lightness: 55 },
    amber: { hue: 35, saturation: 60, lightness: 50 },
    violet: { hue: 270, saturation: 50, lightness: 55 },
    emerald: { hue: 145, saturation: 45, lightness: 45 },
    slate: { hue: 220, saturation: 12, lightness: 45 },
  },
}))

const localeSetter = vi.fn()
const t = (key: string) => {
  const messages: Record<string, string> = {
    'projectHome.hero.badge': '本地优先',
    'projectHome.hero.title': '创作从这里开始',
    'projectHome.hero.description': 'desc',
    'projectHome.hero.descriptionSuffix': 'suffix',
    'projectHome.hero.projectCount': '项目',
    'projectHome.hero.workspaceCount': '工作区',
    'projectHome.hero.docsHub': '文档中心',
    'projectHome.hero.userDocs': '用户文档',
    'projectHome.hero.developerDocs': '开发者文档',
    'projectHome.sidebar.createNew': '新建',
    'projectHome.sidebar.createNewDescription': '创建描述',
    'projectHome.sidebar.shortcutHint': '快捷键: N',
    'projectHome.sidebar.createProject': '创建项目',
    'projectHome.sidebar.continueWork': '继续工作',
    'projectHome.sidebar.startFresh': '重新开始',
    'projectHome.sidebar.startFreshDescription': '重置描述',
    'projectHome.sidebar.resetApp': '重置应用',
    'projectHome.sidebar.helpDocs': '帮助文档',
    'projectHome.sidebar.helpDocsDescription': '查看用户与开发者文档。',
    'projectHome.sidebar.openDocs': '打开文档中心',
    'projectHome.sidebar.appearance': '外观',
    'projectHome.theme.modeTitle': '主题模式',
    'projectHome.theme.light': '浅色',
    'projectHome.theme.dark': '深色',
    'projectHome.theme.languageTitle': '语言',
    'projectHome.theme.accentColorTitle': '主题色',
    'projectHome.filters.searchPlaceholder': '搜索项目...',
    'projectHome.filters.all': '全部',
    'projectHome.filters.active': '活跃',
    'projectHome.filters.archived': '已归档',
    'projectHome.timeline.today': '今天',
    'projectHome.timeline.yesterday': '昨天',
    'projectHome.timeline.thisWeek': '本周',
    'projectHome.timeline.thisMonth': '本月',
    'projectHome.timeline.older': '更早',
    'projectHome.empty.noProjects': '暂无项目',
    'projectHome.empty.noResults': '无结果',
    'projectHome.empty.createFirst': '创建首个项目',
    'projectHome.dialogs.createProject': '创建新项目',
    'projectHome.dialogs.createProjectDescription': '说明',
    'projectHome.dialogs.projectNamePlaceholder': '输入项目名称',
    'projectHome.dialogs.createButton': '创建',
    'projectHome.dialogs.creating': '创建中',
    'projectHome.dialogs.startFreshConfirmPlaceholder': '重新开始',
    'projectHome.project.open': '打开',
    'projectHome.accentColors.teal': '青色',
    'projectHome.accentColors.rose': '玫瑰',
    'projectHome.accentColors.amber': '琥珀',
    'projectHome.accentColors.violet': '紫罗兰',
    'projectHome.accentColors.emerald': '翡翠',
    'projectHome.accentColors.slate': '石墨',
    'common.cancel': '取消',
    'common.processing': '处理中',
    'common.save': '保存',
  }
  return messages[key] ?? key
}

vi.mock('@/i18n', () => ({
  useT: () => t,
  useLocale: () => ['zh-CN', localeSetter],
  LOCALE_LABELS: {
    'zh-CN': '简体中文',
    'en-US': 'English',
    'ja-JP': '日本語',
    'ko-KR': '한국어',
  },
}))

describe('ProjectHome docs entry', () => {
  it('shows single docs hub action in hero', async () => {
    const user = userEvent.setup()
    const onOpenDocs = vi.fn()

    render(
      <ProjectHome
        projects={[]}
        projectStats={{}}
        activeProjectId=""
        onOpenProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onArchiveProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onClearLocalData={vi.fn()}
        onOpenDocs={onOpenDocs}
      />
    )

    await user.click(screen.getByRole('button', { name: '文档中心' }))

    expect(onOpenDocs).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '用户文档' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开发者文档' })).not.toBeInTheDocument()
  })

  it('prefers recent project activity for continue work', async () => {
    const user = userEvent.setup()
    const onOpenProject = vi.fn()
    const now = Date.now()

    render(
      <ProjectHome
        projects={[
          {
            id: 'project-a',
            name: '最近工作项目',
            status: 'active',
            createdAt: now - 86400000 * 30,
            updatedAt: now - 86400000 * 30,
          },
          {
            id: 'project-b',
            name: '刚创建项目',
            status: 'active',
            createdAt: now - 1000 * 60 * 10,
            updatedAt: now - 1000 * 60 * 10,
          },
        ]}
        projectStats={{
          'project-a': {
            projectId: 'project-a',
            workspaceCount: 1,
            lastWorkspaceAccessAt: now - 1000 * 60 * 2,
          },
          'project-b': {
            projectId: 'project-b',
            workspaceCount: 1,
            lastWorkspaceAccessAt: now - 1000 * 60 * 20,
          },
        }}
        activeProjectId=""
        onOpenProject={onOpenProject}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onArchiveProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onClearLocalData={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '继续工作' }))

    expect(onOpenProject).toHaveBeenCalledWith('project-a')
  })

  it('does not inject Google Fonts imports in inline styles', () => {
    const { container } = render(
      <ProjectHome
        projects={[]}
        projectStats={{}}
        activeProjectId=""
        onOpenProject={vi.fn()}
        onCreateProject={vi.fn()}
        onRenameProject={vi.fn()}
        onArchiveProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onClearLocalData={vi.fn()}
      />
    )

    const inlineStyle = container.querySelector('style')

    expect(inlineStyle?.textContent).not.toContain('fonts.googleapis.com')
    expect(inlineStyle?.textContent).not.toContain('@import url(')
  })
})
