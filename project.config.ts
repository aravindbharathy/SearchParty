import { resolve } from 'path'

// ─── Project Configuration ─────────────────────────────────────────────────
// Edit this file to brand the dashboard for your project.

export const PROJECT = {
  /** Your project name — shown in the sidebar header */
  name: 'Search Party',

  /** 2-letter initials (fallback when logo image is not used) */
  short: 'SP',

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

/**
 * Agent model configuration.
 * Change the default model here — all agents will use it unless overridden per-agent.
 * Per-agent overrides go in AGENT_MODELS below.
 *
 * Available: 'claude-sonnet-4-6' | 'claude-opus-4-6' | 'claude-haiku-4-5-20251001'
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-6'

/**
 * Per-agent model overrides. Agents not listed here use DEFAULT_MODEL.
 * Example: use Opus for interview (deeper reasoning for mocks) and Haiku for archivist (fast, cheap maintenance).
 */
export const AGENT_MODELS: Record<string, string> = {
  // interview: 'claude-opus-4-6',
  // archivist: 'claude-haiku-4-5-20251001',
}

/** Resolved absolute path to the operations directory */
export const OPS_DIR = resolve(process.cwd(), PROJECT.opsDir)
