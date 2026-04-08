'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAgentEvents } from '../hooks/use-agent-events'

interface Outreach {
  date: string
  type: string
  status: string
  message_summary: string
}

interface FollowUp {
  due: string
  type: string
  outreach_ref: string
  status: string
}

interface Contact {
  id: string
  name: string
  company: string
  role: string
  relationship: 'cold' | 'connected' | 'warm' | 'referred'
  linkedin_url: string
  outreach: Outreach[]
  follow_ups: FollowUp[]
  notes: string
}

interface NetworkingStats {
  totalContacts: number
  totalOutreach: number
  totalReplies: number
  replyRate: number
  referrals: number
  pendingFollowUps: number
}

const RELATIONSHIP_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  cold: { label: 'Cold', bg: 'bg-text-muted/10', text: 'text-text-muted' },
  connected: { label: 'Connected', bg: 'bg-accent/10', text: 'text-accent' },
  warm: { label: 'Warm', bg: 'bg-warning/10', text: 'text-warning' },
  referred: { label: 'Referred', bg: 'bg-success/10', text: 'text-success' },
}

export default function NetworkingPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [stats, setStats] = useState<NetworkingStats | null>(null)
  const [expandedContact, setExpandedContact] = useState<string | null>(null)
  const { spawnAgent, status: agentStatus, output: agentOutput, reset: agentReset } = useAgentEvents()

  // Agent action state
  const [connectionBatchStatus, setConnectionBatchStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [referralTarget, setReferralTarget] = useState<{ name: string; company: string } | null>(null)
  const [referralStatus, setReferralStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [latestAgentOutput, setLatestAgentOutput] = useState<string | null>(null)

  // FIX 5: Track referral contact ID for auto-save
  const [referralContactId, setReferralContactId] = useState<string | null>(null)
  const [referralSaveStatus, setReferralSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Inline edit saved indicator
  const [savedContactField, setSavedContactField] = useState<string | null>(null)

  // Add contact form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [newRole, setNewRole] = useState('')

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/networking/contacts')
      if (res.ok) {
        const data = await res.json() as { contacts: Contact[] }
        setContacts(data.contacts)
      }
    } catch { /* ignore */ }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/networking/stats')
      if (res.ok) {
        const data = await res.json() as NetworkingStats
        setStats(data)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadContacts()
    loadStats()
  }, [loadContacts, loadStats])

  // FIX 5: Auto-save referral messages to contact
  const saveReferralToContact = useCallback(async (contactId: string, output: string) => {
    setReferralSaveStatus('saving')
    try {
      const contact = contacts.find((c) => c.id === contactId)
      if (!contact) { setReferralSaveStatus('error'); return }

      const todayStr = new Date().toISOString().split('T')[0]
      const day3 = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]
      const day7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

      // Build new outreach entries
      const newOutreach = [
        ...contact.outreach,
        { date: todayStr, type: 'referral-request', status: 'sent', message_summary: output.slice(0, 120) },
        { date: day3, type: 'referral-step-2', status: 'pending', message_summary: 'Follow-up on referral request' },
        { date: day7, type: 'referral-step-3', status: 'pending', message_summary: 'Final referral follow-up' },
      ]

      // Build new follow-up entries
      const newFollowUps = [
        ...contact.follow_ups,
        { due: day3, type: 'referral-step-2', outreach_ref: 'referral-request', status: 'pending' },
        { due: day7, type: 'referral-step-3', outreach_ref: 'referral-request', status: 'pending' },
      ]

      // Save outreach
      await fetch('/api/networking/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, field: 'outreach', value: newOutreach }),
      })

      // Save follow-ups
      await fetch('/api/networking/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, field: 'follow_ups', value: newFollowUps }),
      })

      setReferralSaveStatus('saved')
      loadContacts()
      loadStats()
    } catch {
      setReferralSaveStatus('error')
    }
  }, [contacts, loadContacts, loadStats])

  useEffect(() => {
    if (agentStatus === 'completed') {
      loadContacts()
      loadStats()
      if (agentOutput) setLatestAgentOutput(agentOutput)
      if (connectionBatchStatus === 'running') setConnectionBatchStatus('done')
      if (referralStatus === 'running') {
        setReferralStatus('done')
        // FIX 5: Auto-save referral messages on completion
        if (referralContactId && agentOutput) {
          saveReferralToContact(referralContactId, agentOutput)
        }
      }
    }
    if (agentStatus === 'failed') {
      if (connectionBatchStatus === 'running') setConnectionBatchStatus('error')
      if (referralStatus === 'running') setReferralStatus('error')
    }
  }, [agentStatus, agentOutput, loadContacts, loadStats, connectionBatchStatus, referralStatus, referralContactId, saveReferralToContact])

  const handleGenerateConnectionBatch = async () => {
    agentReset()
    setConnectionBatchStatus('running')
    setLatestAgentOutput(null)

    try {
      const promptRes = await fetch('/api/agent/build-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: 'connection-request', params: { batchSize: 25 } }),
      })
      if (promptRes.ok) {
        const data = await promptRes.json() as { prompt: string }
        await spawnAgent('networking', {
          skill: 'connection-request',
          text: data.prompt,
        })
      } else {
        setConnectionBatchStatus('error')
      }
    } catch {
      setConnectionBatchStatus('error')
    }
  }

  const handleRequestReferral = async (contact: Contact) => {
    agentReset()
    setReferralTarget({ name: contact.name, company: contact.company })
    setReferralContactId(contact.id)
    setReferralStatus('running')
    setReferralSaveStatus('idle')
    setLatestAgentOutput(null)

    try {
      const promptRes = await fetch('/api/agent/build-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill: 'referral-request',
          params: { contactName: contact.name, company: contact.company },
        }),
      })
      if (promptRes.ok) {
        const data = await promptRes.json() as { prompt: string }
        await spawnAgent('networking', {
          skill: 'referral-request',
          text: data.prompt,
        })
      } else {
        setReferralStatus('error')
      }
    } catch {
      setReferralStatus('error')
    }
  }

  const handleAddContact = async () => {
    if (!newName.trim() || !newCompany.trim()) return

    try {
      const res = await fetch('/api/networking/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, company: newCompany, role: newRole }),
      })
      if (res.ok) {
        setNewName('')
        setNewCompany('')
        setNewRole('')
        setShowAddForm(false)
        loadContacts()
        loadStats()
      }
    } catch { /* ignore */ }
  }

  const handleDismissFollowUp = async (contactId: string, followUpIdx: number) => {
    const contact = contacts.find((c) => c.id === contactId)
    if (!contact) return

    const updatedFollowUps = [...contact.follow_ups]
    updatedFollowUps[followUpIdx] = { ...updatedFollowUps[followUpIdx], status: 'dismissed' }

    try {
      await fetch('/api/networking/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, field: 'follow_ups', value: updatedFollowUps }),
      })
      loadContacts()
      loadStats()
    } catch { /* ignore */ }
  }

  const handleSkipFollowUp = async (contactId: string, followUpIdx: number) => {
    const contact = contacts.find((c) => c.id === contactId)
    if (!contact) return

    const updatedFollowUps = [...contact.follow_ups]
    updatedFollowUps[followUpIdx] = { ...updatedFollowUps[followUpIdx], status: 'skipped' }

    try {
      await fetch('/api/networking/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, field: 'follow_ups', value: updatedFollowUps }),
      })
      loadContacts()
      loadStats()
    } catch { /* ignore */ }
  }

  // Inline edit handler for contact fields
  const handleContactFieldUpdate = async (contactId: string, field: string, value: string) => {
    try {
      await fetch('/api/networking/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, field, value }),
      })
      loadContacts()
      loadStats()
      setSavedContactField(`${contactId}-${field}`)
      setTimeout(() => setSavedContactField(null), 1500)
    } catch {}
  }

  // Group contacts by company
  const grouped: Record<string, Contact[]> = {}
  for (const contact of contacts) {
    const key = contact.company || 'Other'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(contact)
  }

  // Find pending follow-ups across all contacts
  const pendingFollowUps: { contact: Contact; fuIdx: number; fu: FollowUp }[] = []
  const todayStr = new Date().toISOString().split('T')[0]
  for (const contact of contacts) {
    for (let i = 0; i < contact.follow_ups.length; i++) {
      const fu = contact.follow_ups[i]
      if (fu.status === 'pending' && fu.due <= todayStr) {
        pendingFollowUps.push({ contact, fuIdx: i, fu })
      }
    }
  }
  pendingFollowUps.sort((a, b) => a.fu.due.localeCompare(b.fu.due))

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Networking</h1>
      <p className="text-text-muted mb-8">Manage connections, generate outreach, and track follow-ups.</p>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Contacts</div>
          <div className="text-2xl font-bold">{stats?.totalContacts ?? 0}</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Outreach Sent</div>
          <div className="text-2xl font-bold">{stats?.totalOutreach ?? 0}</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Reply Rate</div>
          <div className="text-2xl font-bold">{stats?.replyRate ?? 0}%</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Referrals</div>
          <div className="text-2xl font-bold">{stats?.referrals ?? 0}</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="text-sm text-text-muted mb-1">Pending F/Us</div>
          <div className="text-2xl font-bold">{stats?.pendingFollowUps ?? 0}</div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleGenerateConnectionBatch}
          disabled={connectionBatchStatus === 'running'}
          className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {connectionBatchStatus === 'running' ? 'Generating...' : 'Generate Connection Batch'}
        </button>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 border border-border text-text rounded-md text-sm font-medium hover:bg-bg transition-colors"
        >
          Add Contact
        </button>
        {connectionBatchStatus === 'running' && (
          <span className="text-sm text-text-muted flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Networking agent generating batch (2-5 min)...
          </span>
        )}
        {connectionBatchStatus === 'done' && (
          <span className="text-sm text-success">Batch generated. Check messages below.</span>
        )}
        {connectionBatchStatus === 'error' && (
          <span className="text-sm text-danger">Batch generation failed.</span>
        )}
      </div>

      {/* Add Contact Form */}
      {showAddForm && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-6">
          <h3 className="font-semibold text-sm mb-3">Add New Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              className="px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <input
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              placeholder="Company"
              className="px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="Role (optional)"
              className="px-3 py-2 border border-border rounded-md bg-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleAddContact}
              disabled={!newName.trim() || !newCompany.trim()}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-text-muted text-sm hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Follow-up Alerts */}
      {pendingFollowUps.length > 0 && (
        <div className="bg-surface border border-warning/20 rounded-lg p-5 mb-6">
          <h2 className="font-semibold text-sm text-warning mb-3">Follow-ups Due</h2>
          <div className="space-y-2">
            {pendingFollowUps.slice(0, 10).map(({ contact, fuIdx, fu }) => (
              <div key={`${contact.id}-${fuIdx}`} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{contact.name}</span>
                  <span className="text-text-muted"> at {contact.company}</span>
                  <span className="text-text-muted text-xs ml-2">({fu.type}) Due: {fu.due}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDismissFollowUp(contact.id, fuIdx)}
                    className="text-xs text-text-muted hover:text-text px-2 py-1 rounded border border-border"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => handleSkipFollowUp(contact.id, fuIdx)}
                    className="text-xs text-text-muted hover:text-text px-2 py-1 rounded border border-border"
                  >
                    Skip
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Referral Status */}
      {referralStatus === 'running' && referralTarget && (
        <div className="bg-surface border border-accent/20 rounded-lg p-4 mb-6">
          <p className="text-sm flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Generating referral sequence for {referralTarget.name} at {referralTarget.company}...
          </p>
        </div>
      )}
      {referralStatus === 'done' && referralTarget && (
        <div className="bg-surface border border-success/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-success">Referral sequence generated for {referralTarget.name} at {referralTarget.company}.</p>
          {/* FIX 5: Show what was saved */}
          {referralSaveStatus === 'saving' && (
            <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
              <span className="inline-block w-2 h-2 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              Saving outreach &amp; follow-ups to contact...
            </p>
          )}
          {referralSaveStatus === 'saved' && (
            <div className="text-xs text-success mt-2 space-y-0.5">
              <p>Saved to {referralTarget.name}:</p>
              <p>- 3 outreach entries (referral-request, step-2, step-3)</p>
              <p>- 2 follow-ups scheduled (day 3 and day 7)</p>
            </div>
          )}
          {referralSaveStatus === 'error' && (
            <p className="text-xs text-danger mt-1">Failed to auto-save to contact. You can manually save below.</p>
          )}
        </div>
      )}

      {/* Agent Output */}
      {latestAgentOutput && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Agent Output</h3>
            <button
              onClick={() => setLatestAgentOutput(null)}
              className="text-xs text-text-muted hover:text-text"
            >
              Dismiss
            </button>
          </div>
          <pre className="text-sm text-text whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-y-auto">{latestAgentOutput}</pre>
        </div>
      )}

      {/* Contacts grouped by company */}
      {contacts.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <p className="text-text-muted text-lg mb-2">No contacts yet.</p>
          <p className="text-text-muted text-sm mb-4">
            Run &quot;Generate Connection Batch&quot; to start networking, or add contacts manually.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([companyName, companyContacts]) => (
            <div key={companyName} className="bg-surface border border-border rounded-lg p-5">
              <h2 className="font-semibold mb-3">{companyName} <span className="text-sm text-text-muted font-normal">({companyContacts.length})</span></h2>
              <div className="space-y-2">
                {companyContacts.map((contact) => {
                  const badge = RELATIONSHIP_BADGES[contact.relationship] || RELATIONSHIP_BADGES.cold
                  const isExpanded = expandedContact === contact.id
                  const hasPendingFU = contact.follow_ups.some((fu) => fu.status === 'pending' && fu.due <= todayStr)

                  return (
                    <div key={contact.id} className="border border-border rounded-md">
                      <button
                        onClick={() => setExpandedContact(isExpanded ? null : contact.id)}
                        className="w-full text-left p-3 flex items-center justify-between hover:bg-bg transition-colors rounded-md"
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="font-medium text-sm">{contact.name}</span>
                            {contact.role && <span className="text-text-muted text-xs ml-2">{contact.role}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasPendingFU && (
                            <span className="w-2 h-2 bg-warning rounded-full" title="Follow-up due" />
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                          <span className="text-xs text-text-muted">{contact.outreach.length} msgs</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border p-3 bg-bg/50 space-y-3">
                          {/* Editable Fields */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-xs text-text-muted mb-0.5">Name {savedContactField === `${contact.id}-name` && <span className="text-success">- Saved</span>}</div>
                              <input
                                defaultValue={contact.name}
                                onBlur={(e) => { if (e.target.value !== contact.name) handleContactFieldUpdate(contact.id, 'name', e.target.value) }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                              />
                            </div>
                            <div>
                              <div className="text-xs text-text-muted mb-0.5">Company {savedContactField === `${contact.id}-company` && <span className="text-success">- Saved</span>}</div>
                              <input
                                defaultValue={contact.company}
                                onBlur={(e) => { if (e.target.value !== contact.company) handleContactFieldUpdate(contact.id, 'company', e.target.value) }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                              />
                            </div>
                            <div>
                              <div className="text-xs text-text-muted mb-0.5">Role {savedContactField === `${contact.id}-role` && <span className="text-success">- Saved</span>}</div>
                              <input
                                defaultValue={contact.role}
                                onBlur={(e) => { if (e.target.value !== contact.role) handleContactFieldUpdate(contact.id, 'role', e.target.value) }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                placeholder="Role"
                                className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                              />
                            </div>
                            <div>
                              <div className="text-xs text-text-muted mb-0.5">Relationship {savedContactField === `${contact.id}-relationship` && <span className="text-success">- Saved</span>}</div>
                              <select
                                defaultValue={contact.relationship}
                                onChange={(e) => handleContactFieldUpdate(contact.id, 'relationship', e.target.value)}
                                className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                              >
                                <option value="cold">Cold</option>
                                <option value="connected">Connected</option>
                                <option value="warm">Warm</option>
                                <option value="referred">Referred</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-text-muted mb-0.5">LinkedIn URL {savedContactField === `${contact.id}-linkedin_url` && <span className="text-success">- Saved</span>}</div>
                            <input
                              defaultValue={contact.linkedin_url}
                              onBlur={(e) => { if (e.target.value !== contact.linkedin_url) handleContactFieldUpdate(contact.id, 'linkedin_url', e.target.value) }}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              placeholder="https://linkedin.com/in/..."
                              className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors"
                            />
                          </div>
                          <div>
                            <div className="text-xs text-text-muted mb-0.5">Notes {savedContactField === `${contact.id}-notes` && <span className="text-success">- Saved</span>}</div>
                            <textarea
                              defaultValue={contact.notes}
                              onBlur={(e) => { if (e.target.value !== contact.notes) handleContactFieldUpdate(contact.id, 'notes', e.target.value) }}
                              placeholder="Add notes..."
                              rows={2}
                              className="text-sm bg-transparent border border-transparent hover:border-border focus:border-accent focus:outline-none w-full px-1 py-0.5 rounded transition-colors resize-y"
                            />
                          </div>

                          {/* Outreach Timeline */}
                          {contact.outreach.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-text-muted mb-2">Outreach Timeline</h4>
                              <div className="space-y-1">
                                {contact.outreach.map((o, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className="text-text-muted w-20">{o.date}</span>
                                    <span className={`px-1.5 py-0.5 rounded ${
                                      o.status === 'replied' ? 'bg-success/10 text-success'
                                      : o.status === 'no-response' ? 'bg-danger/10 text-danger'
                                      : 'bg-accent/10 text-accent'
                                    }`}>{o.status}</span>
                                    <span className="text-text-muted capitalize">{o.type.replace(/-/g, ' ')}</span>
                                    {o.message_summary && <span className="text-text-muted">- {o.message_summary}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Follow-ups */}
                          {contact.follow_ups.filter((fu) => fu.status === 'pending').length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-text-muted mb-2">Pending Follow-ups</h4>
                              <div className="space-y-1">
                                {contact.follow_ups.map((fu, i) => {
                                  if (fu.status !== 'pending') return null
                                  const isOverdue = fu.due < todayStr
                                  return (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                      <div className="flex items-center gap-2">
                                        <span className={isOverdue ? 'text-danger font-medium' : 'text-text-muted'}>{fu.due}</span>
                                        <span className="text-text-muted capitalize">{fu.type.replace(/-/g, ' ')}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleDismissFollowUp(contact.id, i)}
                                          className="text-text-muted hover:text-text px-1.5 py-0.5 rounded border border-border"
                                        >
                                          Dismiss
                                        </button>
                                        <button
                                          onClick={() => handleSkipFollowUp(contact.id, i)}
                                          className="text-text-muted hover:text-text px-1.5 py-0.5 rounded border border-border"
                                        >
                                          Skip
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => handleRequestReferral(contact)}
                              disabled={referralStatus === 'running'}
                              className="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Request Referral
                            </button>
                            {contact.linkedin_url && (
                              <a
                                href={contact.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 border border-border text-text rounded text-xs hover:bg-bg transition-colors"
                              >
                                LinkedIn
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
