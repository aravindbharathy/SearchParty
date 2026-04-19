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

/** Field-level status from profile-status API */
export interface ProfileFieldStatus {
  label: string
  required: boolean
  filled: boolean
  value_summary: string
}

export interface ProfileSectionStatus {
  label: string
  icon: string
  description: string
  auto_populated: boolean
  filled: boolean
  required_total: number
  required_filled: number
  fields: Record<string, ProfileFieldStatus>
  lastModified: string | null
}

export interface ProfileStatusResponse {
  sections: Record<string, ProfileSectionStatus>
  contextReady: boolean
}
