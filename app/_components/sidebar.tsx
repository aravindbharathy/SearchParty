'use client'

interface SidebarProps {
  connected: boolean
  urgencyCount: number
  networkingCount?: number
  activePage: string
}

interface NavItem {
  label: string
  href: string
  section?: string
}

const NAV_ITEMS: (NavItem | { separator: string })[] = [
  { label: 'Job Search Coach', href: '/coach' },
  { label: 'Dashboard', href: '/' },
  { separator: 'Lifecycle' },
  { label: 'Finding Roles', href: '/finding' },
  { label: 'Applying', href: '/applying' },
  { label: 'Networking', href: '/networking' },
  { label: 'Interviewing', href: '/interviewing' },
  { label: 'Closing', href: '/closing' },
  { separator: 'Meta' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Playbook', href: '/playbook' },
  { separator: '' },
  { label: 'Vault', href: '/vault' },
  { label: 'Command Center', href: '/command-center' },
]

export function Sidebar({ connected, urgencyCount, networkingCount = 0, activePage }: SidebarProps) {
  return (
    <aside className="flex flex-col w-56 min-h-screen bg-sidebar-bg text-sidebar-text shrink-0">
      {/* Header */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-white">Search Party</span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs">
          <span
            className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-[#4A8C5C]' : 'bg-[#8B7E74]'}`}
          />
          <span className="text-sidebar-text/60">
            {connected ? 'live' : 'disconnected'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item, i) => {
          if ('separator' in item) {
            return item.separator ? (
              <div key={i} className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-text/40">
                {item.separator}
              </div>
            ) : (
              <hr key={i} className="my-2 border-white/10" />
            )
          }

          const isActive = activePage === item.href
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-sidebar-active/20 text-white font-medium'
                  : 'text-sidebar-text/70 hover:bg-white/5 hover:text-sidebar-text'
              }`}
            >
              <span>{item.label}</span>
              {item.href === '/' && urgencyCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-[#C44A4A] text-white rounded-full">
                  {urgencyCount}
                </span>
              )}
              {item.href === '/networking' && networkingCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-[#D4A843] text-white rounded-full">
                  {networkingCount}
                </span>
              )}
            </a>
          )
        })}
      </nav>
    </aside>
  )
}
