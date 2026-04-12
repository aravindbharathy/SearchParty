'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

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
  vaultPath: string
  subfolders: Record<string, SubfolderInfo>
  files: VaultFile[]
  newFiles: string[]
}

const SUBFOLDER_LABELS: Record<string, string> = {
  'uploads/jds': 'Job Descriptions',
  'uploads/templates': 'Resume Templates',
  'uploads/portfolio': 'Portfolio',
  transcripts: 'Interview Transcripts',
  'generated/resumes': 'Generated Resumes',
  'generated/cover-letters': 'Cover Letters',
  'generated/outreach': 'Outreach',
  'generated/closing': 'Closing',
}

function statusBadge(status: string) {
  switch (status) {
    case 'new':
      return <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">{'\uD83C\uDD95'} New</span>
    case 'parsed':
      return <span className="text-xs px-1.5 py-0.5 rounded bg-success/20 text-success font-medium">{'\u2705'} Parsed</span>
    case 'rescan-needed':
      return <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">{'\uD83D\uDD04'} Re-scan</span>
    default:
      return null
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function VaultPage() {
  const [data, setData] = useState<ScanResponse | null>(null)
  const [scanning, setScanning] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadTarget, setUploadTarget] = useState<string>('uploads/jds')
  const [message, setMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const res = await fetch('/api/vault/scan')
      const json = await res.json()
      setData(json)
      if (json.newFiles?.length > 0) {
        setMessage(`Found ${json.newFiles.length} new file(s)`)
      } else {
        setMessage('No new files found')
      }
    } catch {
      setMessage('Scan failed')
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => { scan() }, [scan])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage(null)
    const form = new FormData()
    form.append('file', file)
    form.append('subfolder', uploadTarget)

    try {
      const res = await fetch('/api/vault/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (json.ok) {
        setMessage(`Uploaded ${json.name} to ${json.subfolder}/`)
        scan() // refresh
      } else {
        setMessage(json.error || 'Upload failed')
      }
    } catch {
      setMessage('Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-text-muted">{scanning ? 'Scanning vault...' : 'Loading...'}</p>
      </div>
    )
  }

  const subfolders = Object.entries(data.subfolders)

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Vault</h1>
          <p className="text-text-muted text-sm">
            Source documents for your job search. Upload here or drop files directly.
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
        >
          {scanning ? 'Scanning...' : 'Scan Vault'}
        </button>
      </div>

      {/* Vault path */}
      <div className="mb-6 px-4 py-3 bg-bg border border-border rounded-lg">
        <p className="text-xs text-text-muted mb-1">Local vault path (drop files here):</p>
        <code className="text-sm font-mono text-text">{data.vaultPath}</code>
      </div>

      {/* Upload */}
      <div className="mb-6 flex items-center gap-3">
        <select
          value={uploadTarget}
          onChange={e => setUploadTarget(e.target.value)}
          className="px-3 py-2 bg-bg border border-border rounded text-sm"
        >
          {Object.entries(SUBFOLDER_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          disabled={uploading}
          className="text-sm"
        />
        {uploading && <span className="text-sm text-text-muted">Uploading...</span>}
      </div>

      {message && (
        <div className="mb-4 px-4 py-2 bg-bg border border-border rounded text-sm">
          {message}
        </div>
      )}

      {/* Subfolder Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {subfolders.map(([name, info]) => (
          <div key={name} className="border border-border bg-surface rounded-lg px-4 py-3">
            <h3 className="font-medium text-sm">{SUBFOLDER_LABELS[name] || name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-bold">{info.count}</span>
              <span className="text-text-muted text-sm">files</span>
              {info.newCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 bg-warning/20 text-warning rounded font-medium">
                  {info.newCount} new
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* File List */}
      {data.files.length > 0 ? (
        <div className="border border-border bg-surface rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/50">
                <th className="text-left px-4 py-2 font-medium">File</th>
                <th className="text-left px-4 py-2 font-medium">Folder</th>
                <th className="text-left px-4 py-2 font-medium">Size</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.files.map((file, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{file.file}</td>
                  <td className="px-4 py-2 text-text-muted">{SUBFOLDER_LABELS[file.subfolder] || file.subfolder}</td>
                  <td className="px-4 py-2 text-text-muted">{formatSize(file.size)}</td>
                  <td className="px-4 py-2">{statusBadge(file.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-text-muted">
          <p className="text-lg mb-2">Vault is empty</p>
          <p className="text-sm">Upload files above or drop them in the vault directory.</p>
        </div>
      )}

      {/* Phase 2+ stub actions */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <button disabled className="px-4 py-2 border border-border rounded text-sm text-text-muted cursor-not-allowed">
          Score All New JDs (Phase 2)
        </button>
        <button disabled className="px-4 py-2 border border-border rounded text-sm text-text-muted cursor-not-allowed">
          Run Debrief on Transcripts (Phase 2)
        </button>
      </div>
    </div>
  )
}
