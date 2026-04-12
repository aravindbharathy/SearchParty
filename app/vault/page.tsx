'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { MarkdownView } from '../_components/markdown-view'

interface VaultFile {
  file: string
  subfolder: string
  status: 'new' | 'parsed' | 'rescan-needed'
  size: number
}

interface SubfolderInfo {
  count: number
  newCount: number
}

interface ScanResponse {
  subfolders: Record<string, SubfolderInfo>
  files: VaultFile[]
  newFiles: string[]
}

interface GeneratedFile {
  filename: string
  dir: string
}

const UPLOAD_FOLDERS: Record<string, { label: string; description: string; accept: string }> = {
  'uploads/resumes': { label: 'Resumes', description: 'Your original resume files', accept: '.pdf,.docx,.doc,.txt' },
  'uploads/jds': { label: 'Job Descriptions', description: 'Saved JD text files', accept: '.txt,.pdf,.docx' },
  'uploads/transcripts': { label: 'Transcripts', description: 'Interview transcripts', accept: '.txt,.pdf,.docx,.md' },
  'uploads/portfolio': { label: 'Portfolio', description: 'Work samples, case studies', accept: '*' },
  'uploads/templates': { label: 'Templates', description: 'Resume CSS/HTML templates', accept: '.html,.css,.docx,.pdf' },
}

const GENERATED_FOLDERS = [
  { dir: 'vault/generated/resumes', label: 'Tailored Resumes' },
  { dir: 'vault/generated/cover-letters', label: 'Cover Letters' },
  { dir: 'vault/generated/outreach', label: 'Outreach' },
  { dir: 'vault/generated/prep', label: 'Interview Prep' },
  { dir: 'vault/generated/messages', label: 'Messages' },
  { dir: 'vault/generated/closing', label: 'Closing' },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function VaultPage() {
  const [uploadData, setUploadData] = useState<ScanResponse | null>(null)
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([])
  const [scanning, setScanning] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeSection, setActiveSection] = useState<'uploads' | 'generated'>('uploads')
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState('uploads/resumes')
  const [viewingFile, setViewingFile] = useState<{ name: string; path: string; content: string | null; loading: boolean } | null>(null)

  const loadUploads = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/scan')
      if (res.ok) setUploadData(await res.json())
    } catch {}
  }, [])

  const loadGenerated = useCallback(async () => {
    const all: GeneratedFile[] = []
    const results = await Promise.all(
      GENERATED_FOLDERS.map(async (f) => {
        try {
          const res = await fetch(`/api/vault/list-dir?dir=${encodeURIComponent(f.dir)}`)
          if (res.ok) {
            const data = await res.json() as { files: string[] }
            return (data.files || []).map(name => ({ filename: name, dir: f.dir }))
          }
        } catch {}
        return []
      })
    )
    for (const r of results) all.push(...r)
    setGeneratedFiles(all)
  }, [])

  const scan = useCallback(async () => {
    setScanning(true)
    await Promise.all([loadUploads(), loadGenerated()])
    setScanning(false)
  }, [loadUploads, loadGenerated])

  useEffect(() => { scan() }, [scan])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return

    setUploading(true)
    setMessage(null)
    let uploaded = 0
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      form.append('subfolder', uploadTarget)
      try {
        const res = await fetch('/api/vault/upload', { method: 'POST', body: form })
        const json = await res.json()
        if (json.ok) uploaded++
      } catch {}
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (uploaded > 0) {
      setMessage({ type: 'success', text: `Uploaded ${uploaded} file${uploaded > 1 ? 's' : ''} to ${UPLOAD_FOLDERS[uploadTarget]?.label || uploadTarget}` })
      scan()
    } else {
      setMessage({ type: 'error', text: 'Upload failed' })
    }
  }

  const handleDelete = async (path: string) => {
    if (!confirm(`Delete this file?`)) return
    try {
      const res = await fetch('/api/vault/delete-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      if (res.ok) {
        setMessage({ type: 'info', text: 'File deleted' })
        scan()
      }
    } catch {}
  }

  const VIEWABLE_EXTS = new Set(['md', 'txt', 'json', 'yaml', 'yml', 'css', 'html', 'csv'])

  const viewFile = async (name: string, path: string) => {
    if (viewingFile?.path === path) { setViewingFile(null); return }
    const ext = name.split('.').pop()?.toLowerCase() || ''
    if (!VIEWABLE_EXTS.has(ext)) {
      setViewingFile({ name, path, content: null, loading: false })
      return
    }
    setViewingFile({ name, path, content: null, loading: true })
    try {
      const res = await fetch(`/api/vault/read-file?path=${encodeURIComponent(path)}`)
      if (res.ok) {
        const data = await res.json() as { content: string }
        setViewingFile({ name, path, content: data.content, loading: false })
      } else {
        setViewingFile({ name, path, content: null, loading: false })
      }
    } catch {
      setViewingFile({ name, path, content: null, loading: false })
    }
  }

  const uploadFiles = uploadData?.files || []
  const subfolders = uploadData ? Object.entries(uploadData.subfolders) : []

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Vault</h1>
          <p className="text-text-muted text-sm">All your files — uploads and generated materials.</p>
        </div>
        <button onClick={scan} disabled={scanning}
          className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50">
          {scanning ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 px-4 py-2 rounded-md text-sm ${
          message.type === 'success' ? 'bg-success/10 text-success border border-success/20' :
          message.type === 'error' ? 'bg-danger/10 text-danger border border-danger/20' :
          'bg-bg border border-border text-text-muted'
        }`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="float-right text-current opacity-50 hover:opacity-100">×</button>
        </div>
      )}

      {/* Upload bar */}
      <div className="mb-6 flex items-center gap-3 p-4 bg-surface border border-border rounded-lg">
        <select value={uploadTarget} onChange={e => setUploadTarget(e.target.value)}
          className="px-3 py-2 bg-bg border border-border rounded-md text-sm">
          {Object.entries(UPLOAD_FOLDERS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-border rounded-md text-sm cursor-pointer hover:bg-bg transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <span className="text-text-muted">{uploading ? 'Uploading...' : 'Choose files or drag here'}</span>
          <input ref={fileInputRef} type="file" multiple onChange={handleUpload} disabled={uploading}
            accept={UPLOAD_FOLDERS[uploadTarget]?.accept || '*'}
            className="hidden" />
        </label>
      </div>

      {/* Section tabs */}
      <div className="flex gap-6 border-b border-border mb-6">
        {([
          { key: 'uploads' as const, label: 'Your Uploads', count: uploadFiles.length },
          { key: 'generated' as const, label: 'Generated Files', count: generatedFiles.length },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveSection(tab.key)}
            className={`pb-2.5 text-sm font-medium transition-colors relative ${
              activeSection === tab.key ? 'text-text' : 'text-text-muted hover:text-text'
            }`}>
            {tab.label} ({tab.count})
            {activeSection === tab.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />}
          </button>
        ))}
      </div>

      {/* Uploads section */}
      {activeSection === 'uploads' && (
        <div>
          {/* Folder summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {subfolders.map(([name, info]) => (
              <div key={name} className="border border-border bg-surface rounded-lg px-4 py-3">
                <h3 className="font-medium text-sm">{UPLOAD_FOLDERS[name]?.label || name}</h3>
                <p className="text-[10px] text-text-muted">{UPLOAD_FOLDERS[name]?.description || ''}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-lg font-bold">{info.count}</span>
                  <span className="text-text-muted text-xs">file{info.count !== 1 ? 's' : ''}</span>
                  {info.newCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-warning/20 text-warning rounded font-medium">{info.newCount} new</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* File list */}
          {uploadFiles.length > 0 ? (
            <div className="border border-border bg-surface rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg/50">
                    <th className="text-left px-4 py-2 font-medium text-xs text-text-muted">File</th>
                    <th className="text-left px-4 py-2 font-medium text-xs text-text-muted">Folder</th>
                    <th className="text-left px-4 py-2 font-medium text-xs text-text-muted">Size</th>
                    <th className="text-right px-4 py-2 font-medium text-xs text-text-muted"></th>
                  </tr>
                </thead>
                <tbody>
                  {uploadFiles.map((file, i) => {
                    const filePath = `vault/${file.subfolder}/${file.file}`
                    const isViewing = viewingFile?.path === filePath
                    return (
                      <tr key={i} className={`border-b border-border/50 last:border-0 ${isViewing ? 'bg-accent/5' : 'hover:bg-bg/30'}`}>
                        <td className="px-4 py-2.5">
                          <button onClick={() => viewFile(file.file, filePath)} className="font-mono text-xs text-accent hover:text-accent-hover text-left">
                            {file.file}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-text-muted">{UPLOAD_FOLDERS[file.subfolder]?.label || file.subfolder}</td>
                        <td className="px-4 py-2.5 text-xs text-text-muted">{formatSize(file.size)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => handleDelete(filePath)}
                            className="text-[10px] text-text-muted hover:text-danger">Delete</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-text-muted text-lg mb-2">No uploads yet</p>
              <p className="text-text-muted text-sm">Upload your resume, job descriptions, or transcripts above.</p>
            </div>
          )}
        </div>
      )}

      {/* Generated section */}
      {activeSection === 'generated' && (
        <div>
          {generatedFiles.length > 0 ? (
            <div className="border border-border bg-surface rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg/50">
                    <th className="text-left px-4 py-2 font-medium text-xs text-text-muted">File</th>
                    <th className="text-left px-4 py-2 font-medium text-xs text-text-muted">Category</th>
                    <th className="text-right px-4 py-2 font-medium text-xs text-text-muted"></th>
                  </tr>
                </thead>
                <tbody>
                  {generatedFiles.map((file, i) => {
                    const folder = GENERATED_FOLDERS.find(f => f.dir === file.dir)
                    const filePath = `${file.dir}/${file.filename}`
                    const isViewing = viewingFile?.path === filePath
                    return (
                      <tr key={i} className={`border-b border-border/50 last:border-0 ${isViewing ? 'bg-accent/5' : 'hover:bg-bg/30'}`}>
                        <td className="px-4 py-2.5">
                          <button onClick={() => viewFile(file.filename, filePath)} className="font-mono text-xs text-accent hover:text-accent-hover text-left">
                            {file.filename}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-text-muted">{folder?.label || file.dir}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => handleDelete(filePath)}
                            className="text-[10px] text-text-muted hover:text-danger">Delete</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-text-muted text-lg mb-2">No generated files yet</p>
              <p className="text-text-muted text-sm">Files appear here as agents create resumes, cover letters, prep packages, and other materials.</p>
            </div>
          )}
        </div>
      )}

      {/* File viewer panel */}
      {viewingFile && (
        <div className="mt-6 border border-border bg-surface rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg/50">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium">{viewingFile.name}</span>
              <button onClick={() => { if (viewingFile.content) navigator.clipboard.writeText(viewingFile.content) }}
                className="text-[10px] text-text-muted hover:text-text px-1.5 py-0.5 border border-border rounded">Copy</button>
            </div>
            <button onClick={() => setViewingFile(null)} className="text-xs text-text-muted hover:text-text">Close</button>
          </div>
          <div className="p-4 overflow-auto max-h-[80vh]">
            {viewingFile.loading ? (
              <p className="text-sm text-text-muted">Loading...</p>
            ) : viewingFile.content === null ? (
              <div className="text-center py-8">
                {viewingFile.name.endsWith('.pdf') ? (
                  <>
                    <p className="text-text-muted text-sm mb-3">PDF files can be viewed in a new browser tab.</p>
                    <a href={`/api/vault/serve-file?path=${encodeURIComponent(viewingFile.path)}`} target="_blank" rel="noopener noreferrer"
                      className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover inline-block">
                      Open PDF
                    </a>
                  </>
                ) : (
                  <>
                    <p className="text-text-muted text-sm mb-2">This file type can&apos;t be previewed in the browser.</p>
                    <p className="text-text-muted text-xs">Binary files like DOCX can be opened from your file system.</p>
                  </>
                )}
              </div>
            ) : viewingFile.name.endsWith('.md') ? (
              <MarkdownView content={viewingFile.content} className="text-sm" />
            ) : viewingFile.name.endsWith('.json') ? (
              <pre className="text-xs font-mono text-text whitespace-pre-wrap">{(() => {
                try { return JSON.stringify(JSON.parse(viewingFile.content), null, 2) } catch { return viewingFile.content }
              })()}</pre>
            ) : (
              <pre className="text-xs font-mono text-text whitespace-pre-wrap">{viewingFile.content}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
