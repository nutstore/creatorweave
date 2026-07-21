import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
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
  getAllSecretNames,
  loadSecret,
  saveSecret,
  type SecretName,
} from '@/security/secret-store'

type EditorMode = 'add' | 'edit' | null

/**
 * Local encrypted-secret settings. The list intentionally contains names only;
 * a secret is decrypted only after a user explicitly opens it for editing.
 */
export function SecretManager() {
  const t = useT()
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const activeProjectName = useProjectStore(
    (state) => state.projects.find((project) => project.id === state.activeProjectId)?.name
  )
  const [secretNames, setSecretNames] = useState<SecretName[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>(null)
  const [editingName, setEditingName] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [secretToDelete, setSecretToDelete] = useState<SecretName | null>(null)
  const hasActiveProject = Boolean(activeProjectId)

  const refreshSecrets = useCallback(async () => {
    if (!activeProjectId) {
      setSecretNames([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      setSecretNames(await getAllSecretNames(activeProjectId))
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

  const openNewSecret = () => {
    if (!hasActiveProject) return
    setEditorMode('add')
    setEditingName('')
    setSecretValue('')
    setShowValue(false)
  }

  const openEditSecret = (name: SecretName) => {
    if (!hasActiveProject) return
    setEditorMode('edit')
    setEditingName(name)
    // Updating a secret does not require loading its current plaintext value.
    setSecretValue('')
    setShowValue(false)
  }

  const handleSave = async () => {
    if (!activeProjectId) return
    const name = editingName.trim()
    if (!name || !secretValue) {
      toast.error(t('settings.secrets.requiredFields'))
      return
    }

    setIsSaving(true)
    try {
      await saveSecret(activeProjectId, name, secretValue)
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
    if (!activeProjectId || !secretToDelete) return

    try {
      await deleteSecret(activeProjectId, secretToDelete)
      setSecretToDelete(null)
      await refreshSecrets()
      toast.success(t('settings.secrets.deleteSuccess'))
    } catch {
      toast.error(t('settings.secrets.deleteFailed'))
    }
  }

  const toggleCurrentValueVisibility = async () => {
    if (showValue) {
      setShowValue(false)
      return
    }

    if (!activeProjectId || editorMode !== 'edit' || !editingName || secretValue) {
      setShowValue(true)
      return
    }

    try {
      const value = await loadSecret(activeProjectId, editingName)
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
        <BrandButton className="h-8 shrink-0 gap-1.5 text-xs" onClick={openNewSecret} disabled={!hasActiveProject}>
          <Plus className="h-3.5 w-3.5" />
          {t('settings.secrets.add')}
        </BrandButton>
      </div>

      <div className="rounded-lg border border-border/70">
        <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
          <span className="text-xs font-medium text-secondary">
            {hasActiveProject
              ? t('settings.secrets.currentProject', { name: activeProjectName ?? activeProjectId })
              : t('settings.secrets.configured')}
          </span>
          <BrandButton
            variant="ghost"
            iconButton
            className="h-7 w-7"
            onClick={() => void refreshSecrets()}
            disabled={isLoading || !hasActiveProject}
            aria-label={t('settings.secrets.refresh')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </BrandButton>
        </div>

        {!hasActiveProject ? (
          <div className="px-3 py-8 text-center text-xs text-tertiary">{t('settings.secrets.noActiveProject')}</div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('settings.secrets.loading')}
          </div>
        ) : secretNames.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-tertiary">{t('settings.secrets.empty')}</div>
        ) : (
          <ul className="divide-y divide-border/70">
            {secretNames.map((name) => (
              <li key={name} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <code className="min-w-0 truncate text-xs font-medium text-secondary">{name}</code>
                <div className="flex shrink-0 items-center gap-1">
                  <BrandButton variant="outline" className="h-7 px-2 text-[11px]" onClick={() => openEditSecret(name)}>
                    {t('settings.secrets.update')}
                  </BrandButton>
                  <BrandButton
                    variant="ghost"
                    iconButton
                    className="h-7 w-7 text-tertiary hover:text-red-600"
                    onClick={() => setSecretToDelete(name)}
                    aria-label={t('settings.secrets.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </BrandButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-tertiary">{t('settings.secrets.nameHint')}</p>

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

      <BrandDialog open={secretToDelete !== null} onOpenChange={(open) => !open && setSecretToDelete(null)}>
        <BrandDialogContent className="w-[min(92vw,400px)] p-0">
          <BrandDialogHeader>
            <BrandDialogTitle>{t('settings.secrets.deleteTitle')}</BrandDialogTitle>
            <BrandDialogDescription className="sr-only">
              {t('settings.secrets.deleteDescription', { name: secretToDelete ?? '' })}
            </BrandDialogDescription>
          </BrandDialogHeader>
          <BrandDialogBody>
            <p className="text-sm leading-relaxed text-secondary">
              {t('settings.secrets.deleteDescription', { name: secretToDelete ?? '' })}
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
    </div>
  )
}
