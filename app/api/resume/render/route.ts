import { NextResponse } from 'next/server'
import type { ResumeData } from '@/lib/resume-types'

/**
 * POST — render a structured resume as HTML for preview/PDF
 */
export async function POST(req: Request) {
  try {
    const resume = await req.json() as ResumeData

    const html = renderResumeHTML(resume)
    return NextResponse.json({ html })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

function renderResumeHTML(r: ResumeData): string {
  const styles = getTemplateStyles(r.template || 'clean')

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
  <!-- Contact -->
  <header class="contact">
    <h1>${esc(r.contact.name)}</h1>
    <div class="contact-details">
      ${[r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin].filter(Boolean).map(v => `<span>${esc(v)}</span>`).join(' · ')}
    </div>
  </header>

  <!-- Summary -->
  ${r.summary ? `
  <section>
    <h2>Summary</h2>
    <p class="summary">${esc(r.summary)}</p>
  </section>
  ` : ''}

  <!-- Experience -->
  ${r.experiences.length > 0 ? `
  <section>
    <h2>Experience</h2>
    ${r.experiences.map(exp => `
    <div class="entry">
      <div class="entry-header">
        <div>
          <strong>${esc(exp.role)}</strong> · ${esc(exp.company)}
        </div>
        <div class="dates">${esc(exp.dates)}${exp.location ? ` · ${esc(exp.location)}` : ''}</div>
      </div>
      <ul>
        ${exp.bullets.map(b => `<li>${esc(b.text)}</li>`).join('\n        ')}
      </ul>
    </div>
    `).join('')}
  </section>
  ` : ''}

  <!-- Skills -->
  ${(r.skills.technical.length > 0 || r.skills.leadership.length > 0) ? `
  <section>
    <h2>Skills</h2>
    ${r.skills.technical.length > 0 ? `<p><strong>Technical:</strong> ${r.skills.technical.map(s => esc(s)).join(', ')}</p>` : ''}
    ${r.skills.leadership.length > 0 ? `<p><strong>Leadership:</strong> ${r.skills.leadership.map(s => esc(s)).join(', ')}</p>` : ''}
    ${r.skills.other && r.skills.other.length > 0 ? `<p><strong>Other:</strong> ${r.skills.other.map(s => esc(s)).join(', ')}</p>` : ''}
  </section>
  ` : ''}

  <!-- Education -->
  ${r.education.length > 0 ? `
  <section>
    <h2>Education</h2>
    ${r.education.map(edu => `
    <div class="entry">
      <div class="entry-header">
        <div><strong>${esc(edu.degree)}</strong>${edu.field ? `, ${esc(edu.field)}` : ''} · ${esc(edu.institution)}</div>
        <div class="dates">${esc(edu.year)}</div>
      </div>
    </div>
    `).join('')}
  </section>
  ` : ''}

  <!-- Certifications -->
  ${r.certifications.length > 0 ? `
  <section>
    <h2>Certifications</h2>
    <p>${r.certifications.map(c => esc(c)).join(' · ')}</p>
  </section>
  ` : ''}
</div>
</body>
</html>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getTemplateStyles(template: string): string {
  const base = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11pt; line-height: 1.4; color: #1a1a1a; }
    .resume { max-width: 8.5in; margin: 0 auto; padding: 0.6in 0.7in; }
    h1 { font-size: 20pt; font-weight: 700; margin-bottom: 4px; }
    h2 { font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #333; padding-bottom: 3px; margin: 14px 0 8px 0; }
    .contact-details { font-size: 9.5pt; color: #444; }
    .contact-details span + span::before { content: ''; }
    .summary { font-size: 10.5pt; color: #333; margin-bottom: 4px; }
    section { margin-bottom: 4px; }
    .entry { margin-bottom: 10px; }
    .entry-header { display: flex; justify-content: space-between; align-items: baseline; font-size: 10.5pt; }
    .dates { color: #666; font-size: 9.5pt; white-space: nowrap; }
    ul { margin: 4px 0 0 18px; }
    li { font-size: 10.5pt; margin-bottom: 2px; color: #222; }
    p { font-size: 10.5pt; }
  `

  if (template === 'modern') {
    return base + `
      body { font-family: 'Helvetica Neue', 'Arial', sans-serif; }
      h1 { color: #2563eb; }
      h2 { color: #2563eb; border-bottom-color: #2563eb; }
    `
  }
  if (template === 'traditional') {
    return base + `
      h1 { text-align: center; }
      .contact-details { text-align: center; }
      h2 { text-align: center; border-bottom: 2px solid #333; }
    `
  }
  return base // clean (default)
}
