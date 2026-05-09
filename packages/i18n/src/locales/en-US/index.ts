import { common } from './common'
import { app } from './app'
import { topbar } from './topbar'
import { folderSelector } from './folderSelector'
import { settings } from './settings'
import { projectRoots } from './projectRoots'
import { workspaceSettings } from './workspaceSettings'
import { welcome } from './welcome'
import { skills, skillCard, skillEditor, skillDetail } from './skills'
import { webContainer } from './webContainer'
import { workflowEditor, customWorkflowManager, workflowEditorDialog, workflow } from './workflow'
import { remote, session } from './remote'
import { fileViewer, standalonePreview, filePreview, recentFiles } from './fileViewer'
import { storageStatusBanner, pendingSync, conversationStorage, workspaceStorage } from './storage'
import { themeToggle } from './themeToggle'
import { conversation, toolCallDisplay, questionCard } from './conversation'
import { mobile, offlineQueue } from './mobile'
import { activityHeatmap } from './activityHeatmap'
import { errorBoundary } from './errorBoundary'
import { pluginDialog } from './pluginDialog'
import { htmlPreview } from './htmlPreview'
import { commandPalette } from './commandPalette'
import { mcp } from './mcp'
import { onboarding } from './onboarding'
import { workspace } from './workspace'
import { projectHome } from './projectHome'
import { fileTree } from './fileTree'
import { agent } from './agent'
import { sidebar } from './sidebar'
import { goToFile } from './goToFile'

export const enUS = {
  common,
  app,
  topbar,
  folderSelector,
  settings,
  projectRoots,
  workspaceSettings,
  welcome,
  skills,
  skillCard,
  skillEditor,
  skillDetail,
  webContainer,
  workflowEditor,
  customWorkflowManager,
  workflowEditorDialog,
  remote,
  session,
  fileViewer,
  standalonePreview,
  storageStatusBanner,
  pendingSync,
  themeToggle,
  conversation,
  conversationStorage,
  workspaceStorage,
  toolCallDisplay,
  mobile,
  offlineQueue,
  activityHeatmap,
  errorBoundary,
  pluginDialog,
  htmlPreview,
  filePreview,
  recentFiles,
  commandPalette,
  mcp,
  onboarding,
  workspace,
  projectHome,
  fileTree,
  agent,
  sidebar,
  goToFile,
  workflow,
  questionCard,
} as const
