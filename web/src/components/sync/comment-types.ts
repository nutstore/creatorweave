/**
 * Shared comment types for review functionality
 * Used by SyncPreviewPanel and FileDiffViewer
 */

export type CommentSide = 'original' | 'modified'

export type LineComment = {
  id: string
  path: string
  side: CommentSide
  startLine: number
  endLine: number
  text: string
  createdAt: number
}
