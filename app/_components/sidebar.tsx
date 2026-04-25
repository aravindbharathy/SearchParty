'use client'

import Link from 'next/link'
import {
  LayoutDashboard,
  Search,
  Mail,
  Users,
  MessageSquare,
  DollarSign,
  Sparkles,
  TrendingUp,
  BookOpen,
  Archive,
  Terminal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface SidebarProps {
  connected: boolean
  urgencyCount: number
  networkingCount?: number
  activePage: string
}

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

const LIFECYCLE_ITEMS: NavItem[] = [
  { label: 'Finding Roles', href: '/finding', icon: Search },
  { label: 'Applying', href: '/applying', icon: Mail },
  { label: 'Networking', href: '/networking', icon: Users },
  { label: 'Interviewing', href: '/interviewing', icon: MessageSquare },
  { label: 'Closing', href: '/closing', icon: DollarSign },
]

const META_ITEMS: NavItem[] = [
  { label: 'Analytics', href: '/analytics', icon: TrendingUp },
  { label: 'Playbook', href: '/playbook', icon: BookOpen },
]

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Vault', href: '/vault', icon: Archive },
  { label: 'Command Center', href: '/command-center', icon: Terminal },
]

export function Sidebar({ connected, urgencyCount, networkingCount = 0, activePage }: SidebarProps) {
  const renderNavItem = (item: NavItem) => {
    const isActive = activePage === item.href
    const Icon = item.icon
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
          isActive
            ? 'bg-sidebar-active/20 text-white font-medium'
            : 'text-sidebar-text/70 hover:bg-sidebar-hover hover:text-sidebar-text'
        }`}
      >
        <Icon size={16} strokeWidth={2} className={`shrink-0 ${isActive ? 'text-sidebar-active' : 'opacity-85'}`} />
        <span>{item.label}</span>
        {item.href === '/' && urgencyCount > 0 && (
          <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-danger text-white rounded-full">
            {urgencyCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-sidebar-bg text-sidebar-text shrink-0">
      {/* Header */}
      <div className="px-4 py-5 border-b border-sidebar-divider">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-lg font-semibold tracking-tight text-sidebar-text">Search Party</span>
        </div>
        <div className="flex items-center gap-2 mt-2 text-[11px]">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-success' : 'bg-danger'}`}
          />
          <span className="text-sidebar-muted">
            {connected ? 'Live · connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {/* Coach + Dashboard */}
        <Link
          href="/coach"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
            activePage === '/coach'
              ? 'bg-sidebar-active/20 text-white font-medium'
              : 'text-sidebar-text/70 hover:bg-sidebar-hover hover:text-sidebar-text'
          }`}
        >
          <Sparkles size={16} strokeWidth={2} className={`shrink-0 ${activePage === '/coach' ? 'text-sidebar-active' : 'opacity-85'}`} />
          <span>Job Search Coach</span>
        </Link>
        <Link
          href="/"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
            activePage === '/'
              ? 'bg-sidebar-active/20 text-white font-medium'
              : 'text-sidebar-text/70 hover:bg-sidebar-hover hover:text-sidebar-text'
          }`}
        >
          <LayoutDashboard size={16} strokeWidth={2} className={`shrink-0 ${activePage === '/' ? 'text-sidebar-active' : 'opacity-85'}`} />
          <span>Dashboard</span>
          {urgencyCount > 0 && (
            <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-danger text-white rounded-full">
              {urgencyCount}
            </span>
          )}
        </Link>

        {/* Lifecycle */}
        <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted">
          Lifecycle
        </div>
        {LIFECYCLE_ITEMS.map(renderNavItem)}

        {/* Meta */}
        <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted">
          Meta
        </div>
        {META_ITEMS.map(renderNavItem)}

        <hr className="my-2 border-sidebar-divider" />
        {BOTTOM_ITEMS.map(renderNavItem)}
      </nav>
    </aside>
  )
}
