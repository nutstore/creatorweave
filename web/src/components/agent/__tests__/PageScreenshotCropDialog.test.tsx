import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PageScreenshotCropDialog } from '../PageScreenshotCropDialog'

describe('PageScreenshotCropDialog', () => {
  it('adds the full screenshot as a file when confirmed without a crop selection', async () => {
    const onConfirm = vi.fn()

    render(
      <PageScreenshotCropDialog
        imageDataUrl="data:image/png;base64,aGVsbG8="
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^(Insert image|插入图片)$/ }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    const file = onConfirm.mock.calls[0][0] as File
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/png')
  })
})
