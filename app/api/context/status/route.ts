import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'

const SEARCH_DIR = join(process.cwd(), process.env.BLACKBOARD_DIR || 'search')

interface ContextStatus {
  experienceLibrary: { filled: boolean; count: number }
  careerPlan: { filled: boolean; count: number }
  contextReady: boolean
}

export async function GET(): Promise<NextResponse<ContextStatus>> {
  const experiencePath = join(SEARCH_DIR, 'context', 'experience-library.yaml')
  const careerPlanPath = join(SEARCH_DIR, 'context', 'career-plan.yaml')

  let experienceCount = 0
  let careerPlanCount = 0

  try {
    if (existsSync(experiencePath)) {
      const raw = YAML.parse(readFileSync(experiencePath, 'utf-8'))
      experienceCount = Array.isArray(raw?.experiences) ? raw.experiences.length : 0
    }
  } catch {}

  try {
    if (existsSync(careerPlanPath)) {
      const raw = YAML.parse(readFileSync(careerPlanPath, 'utf-8'))
      careerPlanCount = Array.isArray(raw?.goals) ? raw.goals.length : 0
    }
  } catch {}

  const status: ContextStatus = {
    experienceLibrary: { filled: experienceCount > 0, count: experienceCount },
    careerPlan: { filled: careerPlanCount > 0, count: careerPlanCount },
    contextReady: experienceCount > 0 && careerPlanCount > 0,
  }

  return NextResponse.json(status)
}
