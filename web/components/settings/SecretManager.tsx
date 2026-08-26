import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, Globe, KeyRound, Loader2, Lock, Plus, RefreshCw, Trash2, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import {
  BrandButton,
  BrandDialog,
  BrandDialogBody,
  BrandDialogContent,
  BrandDialogDescription,
  BrandDialogFooter,
  BrandDialogHeader,
  BrandDialogTitle,
  BrandInput,
} from '@creatorweave/ui'
import { useT } from '@/i18n'
import { useProjectStore } from '@/store/project.store'
import {
  deleteSecret,
  getAllSecretEntries,
  getGlobalSecretNames,
  loadSecret,
  promoteSecretToGlobal,
  saveSecret,
  type SecretEntry,
  type SecretScope,
} from '@/security/secret-store'

type EditorMode = 'add' | 'edit' | null

/** A rendered secret row — the entry plus whether it was overridden. */
interface RenderedSecret extends SecretEntry {
  /** True when a project-scoped secret shadows this global one. */
  overridden?: boolean
}

/**
 * Local encrypted-secret settings. The list intentionally contains names only;
 * a secret is decrypted only after a user explicitly opens it for editing.
 *
 * Supports two scopes:
 * - **Project** — isolated per project (requires an active project).
 * - **Global** — shared across all projects, used as a fallback at read time.
 */
export function SecretManager() {
  const t = useT()
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const activeProjectName = useProjectStore(
    (state) => state.projects.find((project) => project.id === state.activeProjectId)?.name
  )
  const [projectSecrets, setProjectSecrets] = useState<SecretEntry[]>([])
  const [globalSecrets, setGlobalSecrets] = useState<RenderedSecret[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [editingScope, setEditingScope] = useState<SecretScope>('project')
  const [editingName, setEditingName] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [secretToDelete, setSecretToDelete] = useState<SecretEntry | null>(null)
  const [secretToPromote, setSecretToPromote] = useState<SecretEntry | null>(null)
  const [promoteOverwrites, setPromoteOverwrites] = useState(false)
  const hasActiveProject = Boolean(activeProjectId)

  const refreshSecrets = useCallback(async () => {
    setIsLoading(true)
    try {
      const [projectEntries, globalEntries] = await Promise.all([
        activeProjectId ? getAllSecretEntries(activeProjectId) : Promise.resolve([]),
        getGlobalSecretNames(),
      ])
      // Split projectEntries into project-scoped only (entries from
      // getAllSecretEntries already deduplicate, so global entries returned by
      // it are excluded when a project name exists).
      const projectScoped = projectEntries.filter((e) => e.scope === 'project')
      const projectNames = new Set(projectScoped.map((e) => e.name))

      setProjectSecrets(projectScoped)
      setGlobalSecrets(
        globalEntries.map((name) => ({
          name,
          scope: 'global' as const,
          overridden: projectNames.has(name),
        }))
      )
    } catch {
      toast.error(t('settings.secrets.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [activeProjectId, t])

  useEffect(() => {
    // A project switch must not allow an already open editor to save into a
    // different project's namespace.
    setEditorMode(null)
    setSecretToDelete(null)
    setSecretValue('')
    setShowValue(false)
    void refreshSecrets()
  }, [refreshSecrets])

  const closeEditor = () => {
    setEditorMode(null)
    setEditingName('')
    setSecretValue('')
    setShowValue(false)
  }

  const openNewSecret = (scope: SecretScope) => {
    if (scope === 'project' && !hasActiveProject) return
    setEditorMode('add')
    setEditingScope(scope)
    setEditingName('')
    setSecretValue('')
    setShowValue(false)
  }

  const openEditSecret = (entry: SecretEntry) => {
    if (entry.scope === 'project' && !hasActiveProject) return
    setEditorMode('edit')
    setEditingScope(entry.scope)
    setEditingName(entry.name)
    // Updating a secret does not require loading its current plaintext value.
    setSecretValue('')
    setShowValue(false)
  }

  const handleSave = async () => {
    if (editingScope === 'project' && !activeProjectId) return
    const name = editingName.trim()
    if (!name || !secretValue) {
      toast.error(t('settings.secrets.requiredFields'))
      return
    }

    setIsSaving(true)
    try {
      await saveSecret(activeProjectId || '', name, secretValue, editingScope)
      await refreshSecrets()
      toast.success(t(editorMode === 'add' ? 'settings.secrets.addSuccess' : 'settings.secrets.updateSuccess'))
      closeEditor()
    } catch {
      toast.error(t('settings.secrets.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!secretToDelete) return
    if (secretToDelete.scope === 'project' && !activeProjectId) return

    try {
      await deleteSecret(activeProjectId || '', secretToDelete.name, secretToDelete.scope)
      setSecretToDelete(null)
      await refreshSecrets()
      toast.success(t('settings.secrets.deleteSuccess'))
    } catch {
      toast.error(t('settings.secrets.deleteFailed'))
    }
  }

  const openPromoteDialog = (entry: SecretEntry) => {
    if (!activeProjectId) return
    setSecretToPromote(entry)
    // Check whether a global secret with the same name already exists
    setPromoteOverwrites(globalSecrets.some((g) => g.name === entry.name))
  }

  const handlePromote = async () => {
    if (!secretToPromote || !activeProjectId) return

    try {
      const ok = await promoteSecretToGlobal(activeProjectId, secretToPromote.name)
      if (!ok) {
        toast.error(t('settings.secrets.promoteNotFound'))
        return
      }
      setSecretToPromote(null)
      await refreshSecrets()
      toast.success(t('settings.secrets.promoteSuccess'))
    } catch {
      toast.error(t('settings.secrets.promoteFailed'))
    }
  }

  const toggleCurrentValueVisibility = async () => {
    if (showValue) {
      setShowValue(false)
      return
    }

    if (
      (editingScope === 'project' && !activeProjectId) ||
      editorMode !== 'edit' ||
      !editingName ||
      secretValue
    ) {
      setShowValue(true)
      return
    }

    try {
      const value = await loadSecret(activeProjectId || '', editingName)
      if (value === null) {
        toast.error(t('settings.secrets.loadFailed'))
        return
      }
      setSecretValue(value)
      setShowValue(true)
    } catch {
      toast.error(t('settings.secrets.loadFailed'))
    }
  }

  return (
    <div className="space-y-4 py-1">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-tertiary" />
            <h3 className="text-sm font-medium text-secondary">{t('settings.secrets.title')}</h3>
          </div>
          <p className="max-w-xl text-xs leading-relaxed text-tertiary">
            {hasActiveProject
              ? t('settings.secrets.projectDescription', { name: activeProjectName ?? activeProjectId })
              : t('settings.secrets.noActiveProject')}
          </p>
        </div>
      </div>

      {/* Project secrets section */}
      <SecretSection
        title={t('settings.secrets.projectSecrets')}
        icon={<Lock className="h-3.5 w-3.5" />}
        subtitle={
          hasActiveProject
            ? t('settings.secrets.scopeProjectHint')
            : t('settings.secrets.noActiveProject')
        }
        secrets={projectSecrets}
        isLoading={isLoading}
        canAdd={hasActiveProject}
        emptyText={t('settings.secrets.empty')}
        loadingText={t('settings.secrets.loading')}
        onAdd={() => openNewSecret('project')}
        onEdit={openEditSecret}
        onDelete={setSecretToDelete}
        onPromote={openPromoteDialog}
        promoteLabel={t('settings.secrets.promote')}
        onUpdateLabel={t('settings.secrets.update')}
        deleteLabel={t('settings.secrets.delete')}
        addLabel={t('settings.secrets.add')}
        refreshLabel={t('settings.secrets.refresh')}
        onRefresh={() => void refreshSecrets()}
      />

      {/* Global secrets section */}
      <SecretSection
        title={t('settings.secrets.globalSecrets')}
        icon={<Globe className="h-3.5 w-3.5" />}
        subtitle={t('settings.secrets.globalDescription')}
        secrets={globalSecrets}
        isLoading={isLoading}
        canAdd={true}
        emptyText={t('settings.secrets.empty')}
        loadingText={t('settings.secrets.loading')}
        onAdd={() => openNewSecret('global')}
        onEdit={openEditSecret}
        onDelete={setSecretToDelete}
        onUpdateLabel={t('settings.secrets.update')}
        deleteLabel={t('settings.secrets.delete')}
        addLabel={t('settings.secrets.add')}
        refreshLabel={t('settings.secrets.refresh')}
        onRefresh={() => void refreshSecrets()}
        renderBadge={(entry) =>
          (entry as RenderedSecret).overridden ? (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-400 dark:bg-neutral-800">
              {t('settings.secrets.fallbackHint')}
            </span>
          ) : null
        }
      />

      <p className="text-[11px] leading-relaxed text-tertiary">{t('settings.secrets.nameHint')}</p>

      {/* Editor dialog */}
      <BrandDialog open={editorMode !== null} onOpenChange={(open) => !open && closeEditor()}>
        <BrandDialogContent className="w-[min(92vw,440px)] p-0">
          <BrandDialogHeader>
            <BrandDialogTitle>
              {t(editorMode === 'add' ? 'settings.secrets.addTitle' : 'settings.secrets.updateTitle')}
            </BrandDialogTitle>
            <BrandDialogDescription className="sr-only">
              {t('settings.secrets.description')}
            </BrandDialogDescription>
          </BrandDialogHeader>
          <BrandDialogBody className="space-y-4">
            {/* Scope indicator */}
            <div className="flex items-center gap-2 rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-900">
              {editingScope === 'global' ? (
                <Globe className="h-4 w-4 text-primary-500" />
              ) : (
                <Lock className="h-4 w-4 text-primary-500" />
              )}
              <span className="text-xs text-secondary">
                {editingScope === 'global'
                  ? t('settings.secrets.scopeGlobal')
                  : t('settings.secrets.scopeProject')}{' '}
                —{' '}
                {editingScope === 'global'
                  ? t('settings.secrets.scopeGlobalHint')
                  : t('settings.secrets.scopeProjectHint')}
              </span>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-secondary" htmlFor="secret-name">
                {t('settings.secrets.name')}
              </label>
              <BrandInput
                id="secret-name"
                value={editingName}
                onChange={(event) => setEditingName(event.target.value.toUpperCase())}
                placeholder="ASSEMBLYAI_API_KEY"
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                disabled={editorMode === 'edit' || isSaving}
                className="font-mono text-sm"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-secondary" htmlFor="secret-value">
                  {t('settings.secrets.value')}
                </label>
                {editorMode === 'edit' && (
                  <button
                    type="button"
                    className="text-[11px] text-primary-600 hover:text-primary-700"
                    onClick={() => void toggleCurrentValueVisibility()}
                    disabled={isSaving}
                  >
                    {showValue ? t('settings.secrets.hide') : t('settings.secrets.reveal')}
                  </button>
                )}
              </div>
              <div className="relative">
                <BrandInput
                  id="secret-value"
                  type={showValue ? 'text' : 'password'}
                  value={secretValue}
                  onChange={(event) => setSecretValue(event.target.value)}
                  placeholder={editorMode === 'edit' ? t('settings.secrets.replacePlaceholder') : t('settings.secrets.valuePlaceholder')}
                  autoComplete="new-password"
                  data-form-type="other"
                  data-lpignore="true"
                  disabled={isSaving}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary"
                  onClick={() => setShowValue((visible) => !visible)}
                  aria-label={showValue ? t('settings.secrets.hide') : t('settings.secrets.reveal')}
                >
                  {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton variant="outline" onClick={closeEditor} disabled={isSaving}>
              {t('settings.secrets.cancel')}
            </BrandButton>
            <BrandButton onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('settings.secrets.save')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Delete confirmation */}
      <BrandDialog open={secretToDelete !== null} onOpenChange={(open) => !open && setSecretToDelete(null)}>
        <BrandDialogContent className="w-[min(92vw,400px)] p-0">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('settings.secrets.deleteTitle')}</BrandDialogTitle>
            <BrandDialogDescription className="sr-only">
              {t('settings.secrets.deleteDescription', { name: secretToDelete?.name ?? '' })}
            </BrandDialogDescription>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="text-sm leading-relaxed text-secondary">
              {t('settings.secrets.deleteDescription', { name: secretToDelete?.name ?? '' })}
            </p>
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton variant="outline" onClick={() => setSecretToDelete(null)}>
              {t('settings.secrets.cancel')}
            </BrandButton>
            <BrandButton variant="danger" onClick={() => void handleDelete()}>
              {t('settings.secrets.delete')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>

      {/* Promote confirmation */}
      <BrandDialog
        open={secretToPromote !== null}
        onOpenChange={(open) => !open && setSecretToPromote(null)}
      >
        <BrandDialogContent className="w-[min(92vw,400px)] p-0">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('settings.secrets.promoteTitle')}</BrandDialogTitle>
            <BrandDialogDescription className="sr-only">
              {t('settings.secrets.promoteDescription', { name: secretToPromote?.name ?? '' })}
            </BrandDialogDescription>
          </BrandDialogHeader>
          <BrandDialogBody className="space-y-2">
            <p className="text-sm leading-relaxed text-secondary">
              {t('settings.secrets.promoteDescription', { name: secretToPromote?.name ?? '' })}
            </p>
            {promoteOverwrites && (
              <p className="text-xs leading-relaxed text-amber-600 dark:text-amber-500">
                {t('settings.secrets.promoteOverwriteWarning')}
              </p>
            )}
          </BrandDialogBody>
          <BrandDialogFooter>
            <BrandButton variant="outline" onClick={() => setSecretToPromote(null)}>
              {t('settings.secrets.cancel')}
            </BrandButton>
            <BrandButton onClick={() => void handlePromote()}>
              {t('settings.secrets.promote')}
            </BrandButton>
          </BrandDialogFooter>
        </BrandDialogContent>
      </BrandDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SecretSection — renders one scope group (project or global)
// ---------------------------------------------------------------------------

interface SecretSectionProps {
  title: string
  icon: React.ReactNode
  subtitle: string
  secrets: SecretEntry[]
  isLoading: boolean
  canAdd: boolean
  emptyText: string
  loadingText: string
  onAdd: () => void
  onEdit: (entry: SecretEntry) => void
  onDelete: (entry: SecretEntry) => void
  onPromote?: (entry: SecretEntry) => void
  promoteLabel?: string
  onUpdateLabel: string
  deleteLabel: string
  addLabel: string
  refreshLabel: string
  onRefresh: () => void
  renderBadge?: (entry: SecretEntry) => React.ReactNode
}

function SecretSection({
  title,
  icon,
  subtitle,
  secrets,
  isLoading,
  canAdd,
  emptyText,
  loadingText,
  onAdd,
  onEdit,
  onDelete,
  onPromote,
  promoteLabel,
  onUpdateLabel,
  deleteLabel,
  addLabel,
  refreshLabel,
  onRefresh,
  renderBadge,
}: SecretSectionProps) {
  return (
    <div className="rounded-lg border border-border/70">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-tertiary">{icon}</span>
          <span className="text-xs font-medium text-secondary">{title}</span>
          {secrets.length > 0 && (
            <span className="text-[10px] text-neutral-400">({secrets.length})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <BrandButton
            variant="ghost"
            iconButton
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label={refreshLabel}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </BrandButton>
          <BrandButton
            className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={onAdd}
            disabled={!canAdd}
          >
            <Plus className="h-3 w-3" />
            {addLabel}
          </BrandButton>
        </div>
      </div>

      <p className="px-3 py-1.5 text-[11px] leading-relaxed text-tertiary">{subtitle}</p>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingText}
        </div>
      ) : secrets.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-tertiary">{emptyText}</div>
      ) : (
        <ul className="divide-y divide-border/70 border-t border-border/70">
          {secrets.map((entry) => (
            <li key={`${entry.scope}:${entry.name}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 truncate text-xs font-medium text-secondary">{entry.name}</code>
                {renderBadge?.(entry)}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {onPromote && (
                  <BrandButton
                    variant="ghost"
                    iconButton
                    className="h-7 w-7 text-tertiary hover:text-primary-600"
                    onClick={() => onPromote(entry)}
                    aria-label={promoteLabel}
                    title={promoteLabel}
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </BrandButton>
                )}
                <BrandButton
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => onEdit(entry)}
                >
                  {onUpdateLabel}
                </BrandButton>
                <BrandButton
                  variant="ghost"
                  iconButton
                  className="h-7 w-7 text-tertiary hover:text-red-600"
                  onClick={() => onDelete(entry)}
                  aria-label={deleteLabel}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </BrandButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
