import { redirect } from 'next/navigation'
import { bootstrap } from '@/server/session'
import { setThemeAction } from '@/app/actions'
import { Experience } from '@/ui/Experience'
import { Nav } from '@/ui/Nav'
import type { ThemeId } from '@/ui/themeGrounds'

/**
 * Everything behind the Awakening.
 *
 * The route group exists for this one line: a hunter with no `onboarded_at` has
 * not answered for their name, their time zone or their deadline, and every
 * page below here reads all three. Guarding once in a shared layout is the
 * difference between a rule and four copies of a rule that will disagree the
 * first time a fifth page is added.
 *
 * `/awaken` is deliberately outside this group, so the redirect cannot loop.
 */
export default function SystemLayout({ children }: { children: React.ReactNode }) {
  const { hunter } = bootstrap()
  if (hunter.onboardedAt === null) redirect('/awaken')

  return (
    <Experience>
      <div className="shell">
        {children}
        <Nav theme={hunter.theme as ThemeId} onSelectTheme={setThemeAction} />
      </div>
    </Experience>
  )
}
