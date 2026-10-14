import { Assistant } from '@/assistant/Assistant'
import type { Metadata, Viewport } from 'next'
import { Chakra_Petch, Cormorant_Garamond, EB_Garamond, JetBrains_Mono } from 'next/font/google'
import { bootstrap } from '@/server/session'
import { groundFor } from '@/ui/themeGrounds'
import { Background } from '@/ui/backgrounds/Background'
import { backgroundOr } from '@/ui/backgrounds/registry'
import './globals.css'

const display = Chakra_Petch({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-chakra',
})
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains',
})
const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  variable: '--font-cormorant',
})
const ink = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-eb-garamond',
})

export const metadata: Metadata = {
  title: 'unranked',
  description: 'A real-life System.',
  manifest: '/manifest.webmanifest',
}

/**
 * The browser chrome follows the chosen theme.
 *
 * Hardcoding one colour here left the address bar and splash screen holographic
 * blue no matter which theme was picked — the kind of seam that makes a theme
 * feel like a skin rather than a setting.
 */
export function generateViewport(): Viewport {
  const { hunter } = bootstrap()
  return {
    themeColor: groundFor(hunter.theme),
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  }
}

/** The System's state is read on every request; there is nothing to cache. */
export const dynamic = 'force-dynamic'

/**
 * The root layout holds the document and the wallpaper, and nothing else.
 *
 * Navigation and the `.shell` column live in `(system)/layout.tsx` instead, so
 * the Awakening — which must not offer a way to skip past itself — can sit
 * outside them while still getting the fonts, the theme and the background.
 *
 * `data-background` is a live wire, exactly like `data-theme`: the picker sets
 * it on click and `<Background>` follows the attribute, so an effect swaps
 * under your cursor rather than after a round trip.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { hunter } = bootstrap()
  const background = backgroundOr(hunter.background)

  return (
    <html
      lang="en"
      data-theme={hunter.theme}
      data-background={background}
      className={`${display.variable} ${mono.variable} ${serif.variable} ${ink.variable}`}
    >
      <body className="ground-glow scanlines">
        <Background initial={background} />
        <Assistant>{children}</Assistant>
      </body>
    </html>
  )
}
