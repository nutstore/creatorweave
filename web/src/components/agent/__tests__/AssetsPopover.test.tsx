import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AssetsPopover } from '../AssetsPopover'

const deleteAsset = vi.fn(async () => undefined)
const refresh = vi.fn(async () => undefined)

vi.mock('@/i18n', () => ({
  useT: () => (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
}))

vi.mock('@/store/asset-inventory.store', () => ({
  useAssetInventoryStore: (selector: (state: unknown) => unknown) =>
    selector({
      items: [{
        path: 'exports/report.pdf',
        name: 'report.pdf',
        size: 1024,
        lastModified: Date.now(),
        mimeType: 'application/pdf',
      }],
      loading: false,
      loadedWorkspaceId: 'conversation-1',
      refresh,
      deleteAsset,
      clearAll: vi.fn(async () => undefined),
    }),
}))

vi.mock('../asset-utils', () => ({
  readAssetBlob: vi.fn(async () => null),
  downloadAssetBlob: vi.fn(async () => undefined),
}))

describe('AssetsPopover', () => {
  it('deletes an asset on the first delete click', async () => {
    const user = userEvent.setup()
    render(<AssetsPopover convId="conversation-1" />)

    await user.click(screen.getByTitle('Assets'))
    await user.click(screen.getByTitle('Delete'))

    expect(deleteAsset).toHaveBeenCalledWith('exports/report.pdf')
  })
})
