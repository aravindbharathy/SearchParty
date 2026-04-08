/** Shared types for context status API responses */

export interface ContextEntry {
  filled: boolean
  lastModified: string | null
  label: string
  description: string
}

export interface ContextStatusResponse {
  contexts: Record<string, ContextEntry>
  contextReady: boolean
}
