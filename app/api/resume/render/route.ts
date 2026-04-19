import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getUploadsDir } from '@/lib/paths'
import { migrateResume } from '@/lib/resume-types'
import type {
  ResumeData, ResumeSection, SummarySection, ExperienceSection,
  EducationSection, SkillsSection, CertificationsSection,
  PublicationsSection, ProjectsSection, CustomSection,
} from '@/lib/resume-types'

export async function POST(req: Request) {
  try {
    const raw = await req.json()
    const resume = migrateResume(raw)

    let userStyles: string | null = null
    const templateDir = join(getUploadsDir(), 'templates')
    const cssPath = join(templateDir, `${resume.template}.css`)
    const htmlPath = join(templateDir, `${resume.template}.html`)

    if (existsSync(cssPath)) {
      userStyles = readFileSync(cssPath, 'utf-8')
    } else if (existsSync(htmlPath)) {
      const htmlContent = readFileSync(htmlPath, 'utf-8')
      const styleMatch = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
      if (styleMatch) userStyles = styleMatch[1]
    }

    const html = renderResumeHTML(resume, userStyles)
    return NextResponse.json({ html })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// ─── CSS Remapping ──────────────────────────────────────────────────────────

const CSS_REMAP_RULES: [RegExp, string][] = [
  [/\.resume-container/g, '.resume'],
  [/\.header(?![-\w])/g, '.contact'],
  [/\.name(?![-\w])/g, '.contact h1'],
  [/\.contact-info(?![-\w])/g, '.contact-details'],
  [/\.contact-divider/g, '.contact-details .sep'],
  [/\.section-header/g, 'h2'],
  [/\.work-experience/g, 'section'],
  [/\.job-entry/g, '.entry'],
  [/\.job-header/g, '.entry-header'],
  [/\.job-title/g, '.entry-header strong'],
  [/\.job-dates/g, '.dates'],
  [/\.company-name/g, '.entry-header .company'],
  [/\.job-description/g, '.entry ul'],
  [/\.education(?![-\w])/g, 'section'],
  [/\.degree-entry/g, '.entry'],
  [/\.degree-header/g, '.entry-header'],
  [/\.degree(?![-\w])/g, '.entry-header strong'],
  [/\.degree-dates/g, '.dates'],
  [/\.school/g, '.entry-header .institution'],
  [/\.summary-text/g, '.summary'],
  [/\.summary-bullet/g, '.summary li'],
  [/\.info-label/g, 'p strong'],
  [/\.info-content/g, 'p'],
  [/\.additional-info/g, 'section'],
  [/\.info-item/g, '.skills-row'],
]

function remapUserCSS(css: string): string {
  let result = css
  for (const [pattern, replacement] of CSS_REMAP_RULES) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// ─── Section renderers ──────────────────────────────────────────────────────

function renderSection(section: ResumeSection): string {
  switch (section.type) {
    case 'summary': return renderSummary(section)
    case 'experience': return renderExperience(section)
    case 'education': return renderEducation(section)
    case 'skills': return renderSkills(section)
    case 'certifications': return renderCertifications(section)
    case 'publications': return renderPublications(section)
    case 'projects': return renderProjects(section)
    case 'custom': return renderCustom(section)
    default: return ''
  }
}

function renderSummary(s: SummarySection): string {
  if (!s.text) return ''
  return `<section>
    <h2>${esc(s.title)}</h2>
    <p class="summary">${esc(s.text)}</p>
  </section>`
}

function renderExperience(s: ExperienceSection): string {
  if (!s.entries?.length) return ''
  return `<section>
    <h2>${esc(s.title)}</h2>
    ${s.entries.map(exp => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title"><strong>${esc(exp.role)}</strong>, ${esc(exp.company)}${exp.location ? ` (${esc(exp.location)})` : ''}</span>
        <span class="dates">${esc(exp.dates)}</span>
      </div>
      ${exp.bullets?.length ? `<ul>${exp.bullets.map(b => `
        <li>${esc(b.text)}</li>`).join('')}
      </ul>` : ''}
    </div>`).join('')}
  </section>`
}

function renderEducation(s: EducationSection): string {
  if (!s.entries?.length) return ''
  return `<section>
    <h2>${esc(s.title)}</h2>
    ${s.entries.map(edu => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title"><strong>${esc(edu.degree)}${edu.field ? ` in ${esc(edu.field)}` : ''}</strong>${edu.institution ? `, ${esc(edu.institution)}` : ''}</span>
        <span class="dates">${esc(edu.year)}</span>
      </div>
    </div>`).join('')}
  </section>`
}

function renderSkills(s: SkillsSection): string {
  if (!s.groups?.length) return ''
  const rows = s.groups.filter(g => g.items?.length > 0)
  if (rows.length === 0) return ''
  return `<section>
    <h2>${esc(s.title)}</h2>
    ${rows.map(g => `<div class="skills-row"><strong>${esc(g.label)}:</strong> ${g.items.map(i => esc(i)).join(', ')}</div>`).join('\n    ')}
  </section>`
}

function renderCertifications(s: CertificationsSection): string {
  if (!s.items?.length) return ''
  return `<section>
    <h2>${esc(s.title)}</h2>
    <div class="skills-row">${s.items.map(c => esc(c)).join(' &middot; ')}</div>
  </section>`
}

function renderPublications(s: PublicationsSection): string {
  if (!s.entries?.length) return ''
  return `<section>
    <h2>${esc(s.title)}</h2>
    ${s.entries.map(pub => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title">${pub.url ? `<a href="${esc(pub.url)}">${esc(pub.title)}</a>` : `<strong>${esc(pub.title)}</strong>`}${pub.venue ? `. <em>${esc(pub.venue)}</em>` : ''}</span>
        <span class="dates">${esc(pub.date)}</span>
      </div>
    </div>`).join('')}
  </section>`
}

function renderProjects(s: ProjectsSection): string {
  if (!s.entries?.length) return ''
  return `<section>
    <h2>${esc(s.title)}</h2>
    ${s.entries.map(proj => `
    <div class="entry">
      <div class="entry-header">
        <span class="entry-title"><strong>${esc(proj.name)}</strong>${proj.technologies?.length ? ` — <em>${proj.technologies.map(t => esc(t)).join(', ')}</em>` : ''}</span>
      </div>
      ${proj.description ? `<p class="summary">${esc(proj.description)}</p>` : ''}
      ${proj.bullets?.length ? `<ul>${proj.bullets.map(b => `
        <li>${esc(b.text)}</li>`).join('')}
      </ul>` : ''}
    </div>`).join('')}
  </section>`
}

function renderCustom(s: CustomSection): string {
  if (!s.content) return ''
  return `<section>
    <h2>${esc(s.title)}</h2>
    <div class="custom-content">${esc(s.content)}</div>
  </section>`
}

// ─── Main renderer ──────────────────────────────────────────────────────────

function renderResumeHTML(r: ResumeData, userStyles?: string | null): string {
  const styles = userStyles ? remapUserCSS(userStyles) : getTemplateStyles(r.template || 'clean')

  const contactItems: string[] = []
  if (r.contact?.location) contactItems.push(esc(r.contact.location))
  if (r.contact?.phone) contactItems.push(esc(r.contact.phone))
  if (r.contact?.email) contactItems.push(`<a href="mailto:${esc(r.contact.email)}">${esc(r.contact.email)}</a>`)
  if (r.contact?.linkedin) {
    const url = r.contact.linkedin.startsWith('http') ? r.contact.linkedin : `https://${r.contact.linkedin}`
    contactItems.push(`<a href="${esc(url)}">LinkedIn</a>`)
  }
  if (r.contact?.website) {
    const url = r.contact.website.startsWith('http') ? r.contact.website : `https://${r.contact.website}`
    contactItems.push(`<a href="${esc(url)}">${esc(r.contact.website.replace(/^https?:\/\//, ''))}</a>`)
  }

  const sectionsHtml = r.sections.map(s => renderSection(s)).filter(Boolean).join('\n')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${styles}
</style>
</head>
<body>
<div class="resume">
  <header class="contact">
    <h1>${esc(r.contact?.name || '')}</h1>
    <div class="contact-details">${contactItems.join('<span class="sep"> | </span>')}</div>
  </header>
  ${sectionsHtml}
</div>
</body>
</html>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Template styles ────────────────────────────────────────────────────────

function getTemplateStyles(template: string): string {
  const base = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.35;
      color: #1a1a1a;
    }
    .resume {
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.45in 0.55in;
    }
    h1 {
      font-size: 22pt;
      font-weight: 700;
      margin-bottom: 2px;
      letter-spacing: 0.3px;
    }
    .contact-details {
      font-size: 9pt;
      color: #333;
      margin-bottom: 2px;
    }
    .contact-details .sep { margin: 0 2px; }
    .contact-details a { color: inherit; text-decoration: underline; }
    .contact-details a:hover { color: #0051BA; }
    h2 {
      font-size: 10.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      border-bottom: 1.5px solid #1a1a1a;
      padding-bottom: 2px;
      margin: 10px 0 6px 0;
    }
    .summary {
      font-size: 9.5pt;
      line-height: 1.4;
      color: #222;
    }
    section { margin-bottom: 2px; }
    .entry { margin-bottom: 6px; }
    .entry-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      font-size: 10pt;
    }
    .entry-title { flex: 1; }
    .dates {
      color: #444;
      font-size: 9pt;
      white-space: nowrap;
      flex-shrink: 0;
      text-align: right;
    }
    ul {
      margin: 2px 0 0 14px;
      padding: 0;
    }
    li {
      font-size: 9.5pt;
      line-height: 1.35;
      margin-bottom: 1px;
      color: #1a1a1a;
    }
    .skills-row {
      font-size: 9.5pt;
      line-height: 1.4;
      margin-bottom: 1px;
    }
    .skills-row strong { font-weight: 700; }
    .custom-content {
      font-size: 9.5pt;
      line-height: 1.4;
      color: #222;
      white-space: pre-wrap;
    }
    p { font-size: 9.5pt; line-height: 1.4; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    a { color: inherit; }
  `

  if (template === 'modern') {
    return base + `
      h1 { color: #0051BA; }
      h2 { color: #0051BA; border-bottom-color: #0051BA; }
      .contact-details a { color: #0051BA; text-decoration: underline; }
    `
  }
  if (template === 'traditional') {
    return base + `
      body { font-family: 'Georgia', 'Times New Roman', serif; }
      h1 { text-align: center; font-size: 20pt; }
      .contact-details { text-align: center; }
      h2 { text-align: center; border-bottom: 2px solid #333; }
    `
  }
  return base
}
