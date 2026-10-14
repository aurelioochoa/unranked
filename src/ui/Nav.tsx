'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeMenu } from './ThemeMenu'
import type { ThemeId } from './themeGrounds'

const TABS = [
  { href: '/', label: 'Status' },
  { href: '/quests', label: 'Quests' },
  { href: '/dungeon', label: 'Dungeon' },
  { href: '/system', label: 'System' },
] as const

export function Nav({
  theme,
  onSelectTheme,
}: {
  theme: ThemeId
  onSelectTheme: (theme: ThemeId) => Promise<void>
}) {
  const pathname = usePathname()
  return (
    <nav className="nav" aria-label="System">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname === tab.href ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
      <ThemeMenu current={theme} onSelect={onSelectTheme} />
    </nav>
  )
}
