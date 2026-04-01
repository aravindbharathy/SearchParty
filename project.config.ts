import { resolve } from 'path'

// ─── Project Configuration ─────────────────────────────────────────────────
// Edit this file to brand the dashboard for your project.

export const PROJECT = {
  /** Your project name — shown in the sidebar header */
  name: 'Job Search OS',

  /** 2-letter initials (fallback when logo image is not used) */
  short: 'JS',

  /** One-line description (shown in README / about) */
  description: 'AI-powered job search system',

  /** Link to your source repo (used in README) */
  repo: '',

  /**
   * Directory name for the operations/state directory.
   * The dashboard reads pipeline data, blackboard, context, etc. from here.
   */
  opsDir: 'search',
}

/** Resolved absolute path to the operations directory */
export const OPS_DIR = resolve(process.cwd(), PROJECT.opsDir)

/** Alias — replaces KAPI_DIR from the reference codebase */
export const SEARCH_DIR = OPS_DIR
