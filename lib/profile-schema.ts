/**
 * Profile Schema — reads the configurable YAML schema and checks field completion.
 *
 * The schema at search/config/profile-schema.yaml defines:
 * - Section labels, icons, descriptions
 * - Fields with types, labels, required/optional
 * - Completion = all required fields have non-empty values
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from './paths'

export interface FieldDef {
  label: string
  type: 'string' | 'number' | 'array'
  required: boolean
  min_items?: number
}

export interface SectionDef {
  label: string
  icon: string
  description: string
  auto_populated?: boolean
  fields: Record<string, FieldDef>
}

export interface ProfileSchema {
  sections: Record<string, SectionDef>
}

export interface FieldStatus {
  label: string
  required: boolean
  filled: boolean
  value_summary: string  // brief display: "3 items", "set", "(empty)"
}

export interface SectionStatus {
  label: string
  icon: string
  description: string
  auto_populated: boolean
  filled: boolean             // ALL required fields have values
  required_total: number
  required_filled: number
  fields: Record<string, FieldStatus>
}

let cachedSchema: ProfileSchema | null = null

export function loadProfileSchema(): ProfileSchema {
  // Re-read on every call in dev to pick up schema file changes
  if (cachedSchema && process.env.NODE_ENV === 'production') return cachedSchema

  const schemaPath = join(getSearchDir(), 'config', 'profile-schema.yaml')
  if (!existsSync(schemaPath)) {
    throw new Error(`Profile schema not found at ${schemaPath}`)
  }

  const raw = readFileSync(schemaPath, 'utf-8')
  cachedSchema = YAML.parse(raw) as ProfileSchema
  return cachedSchema
}

/**
 * Get a nested value from an object using dot notation.
 * e.g., getNestedValue(data, 'contact.name') → data.contact.name
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Check if a field value is considered "filled" based on its type.
 */
function isFieldFilled(value: unknown, field: FieldDef): boolean {
  if (value === undefined || value === null) return false

  switch (field.type) {
    case 'string':
      return typeof value === 'string' && value.trim().length > 0
    case 'number':
      return typeof value === 'number' && value > 0
    case 'array': {
      if (!Array.isArray(value)) return false
      const minItems = field.min_items ?? 1
      return value.length >= minItems
    }
    default:
      return !!value
  }
}

/**
 * Get a brief summary of a field's value for display.
 */
function getValueSummary(value: unknown, field: FieldDef): string {
  if (value === undefined || value === null) return '(empty)'

  switch (field.type) {
    case 'string':
      return typeof value === 'string' && value.trim() ? '(set)' : '(empty)'
    case 'number':
      return typeof value === 'number' && value > 0 ? String(value) : '(empty)'
    case 'array':
      if (!Array.isArray(value) || value.length === 0) return '(empty)'
      return `${value.length} item${value.length !== 1 ? 's' : ''}`
    default:
      return value ? '(set)' : '(empty)'
  }
}

/**
 * Check completion status for a single section against its data.
 */
export function checkSectionStatus(
  sectionName: string,
  data: Record<string, unknown>,
  schema?: ProfileSchema,
): SectionStatus {
  const s = schema || loadProfileSchema()
  const sectionDef = s.sections[sectionName]

  if (!sectionDef) {
    return {
      label: sectionName,
      icon: '📄',
      description: '',
      auto_populated: false,
      filled: false,
      required_total: 0,
      required_filled: 0,
      fields: {},
    }
  }

  const fields: Record<string, FieldStatus> = {}
  let requiredTotal = 0
  let requiredFilled = 0

  for (const [path, fieldDef] of Object.entries(sectionDef.fields)) {
    const value = getNestedValue(data, path)
    const filled = isFieldFilled(value, fieldDef)

    if (fieldDef.required) {
      requiredTotal++
      if (filled) requiredFilled++
    }

    fields[path] = {
      label: fieldDef.label,
      required: fieldDef.required,
      filled,
      value_summary: getValueSummary(value, fieldDef),
    }
  }

  return {
    label: sectionDef.label,
    icon: sectionDef.icon,
    description: sectionDef.description,
    auto_populated: sectionDef.auto_populated ?? false,
    filled: requiredTotal > 0 ? requiredFilled === requiredTotal : Object.values(fields).some(f => f.filled),
    required_total: requiredTotal,
    required_filled: requiredFilled,
    fields,
  }
}

/**
 * Get missing required fields for a section.
 */
export function getMissingFields(
  sectionName: string,
  data: Record<string, unknown>,
): string[] {
  const status = checkSectionStatus(sectionName, data)
  return Object.entries(status.fields)
    .filter(([, f]) => f.required && !f.filled)
    .map(([, f]) => f.label)
}
