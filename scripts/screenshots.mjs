import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

// Capture the running app against disposable demo data, never the user's database.
// Run after pnpm build: node scripts/screenshots.mjs
const directory = await mkdtemp(join(tmpdir(), 'unranked-screenshots-'))
const output = resolve('docs/images')
const port = Number(process.env.SCREENSHOT_PORT ?? 3028)
const base = `http://localhost:${port}`
const environment = {
  ...process.env,
  DATABASE_PATH: join(directory, 'demo.db'),
  HUNTER_ID: 'readme-demo',
  HUNTER_NAME: 'Hunter',
  HUNTER_TIMEZONE: 'UTC',
  AI_PROVIDER: 'none',
}
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', String(port)], {
  env: environment,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
server.stdout.on('data', value => { logs += value })
server.stderr.on('data', value => { logs += value })
let browser
try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(logs)
    try {
      const response = await fetch(`${base}/api/assistant/context`)
      if (response.ok) { ready = true; break }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, `Screenshot server did not start: ${logs}`)
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  async function capture(name, fullPage = false) {
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow in ${name}`)
    await page.screenshot({ path: join(output, `${name}.png`), fullPage })
    console.log(`Captured ${name}`)
  }
  async function command(text) {
    const count = await page.locator('.sage-message--assistant').count()
    await page.locator('#sage-command').fill(text)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.waitForFunction(count => document.querySelectorAll('.sage-message--assistant').length > count, count)
    await page.waitForFunction(() => document.querySelector('.sage-state')?.textContent?.startsWith('idle'))
  }
  await page.goto(`${base}/awaken`)
  await page.evaluate(async () => {
    const context = await (await fetch('/api/assistant/context')).json()
    context.preferences.speak = false
    const response = await fetch('/api/assistant/preferences', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(context.preferences),
    })
    if (!response.ok) throw new Error('Could not silence demo speech')
  })
  await page.reload()
  await page.locator('#awaken-name').fill('Hunter')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture('awakening-mobile')
  await page.setViewportSize({ width: 1440, height: 1040 })
  await page.getByRole('button', { name: 'Great Sage', exact: true }).click()
  await command('accept awakening')
  await page.locator('.sage-confirm').getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.waitForURL(`${base}/`)
  await page.keyboard.press('Escape')

  // Exercise the existing history helper to show real progression and decay.
  await promisify(execFile)('pnpm', ['exec', 'tsx', 'scripts/dev-history.ts', '10'], { env: environment })
  await page.reload()
  await capture('status-desktop', true)
  await page.goto(`${base}/quests`)
  await capture('quests-desktop', true)

  await page.goto(`${base}/dungeon`)
  await page.getByRole('button', { name: 'Great Sage', exact: true }).click()
  await command('fill dungeon Write the next chapter for 25 minutes mind')
  await page.waitForFunction(() => document.querySelector('#objective')?.value === 'Write the next chapter')
  await capture('sage-desktop')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'ID Create', exact: true }).click()
  await page.waitForSelector('.dungeon-view')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture('dungeon-mobile', true)
  assert.deepEqual(errors, [])
  console.log('Screenshots complete. Demo database:', directory)
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  if (server.exitCode === null) {
    await Promise.race([
      new Promise(resolve => server.once('exit', resolve)),
      new Promise(resolve => setTimeout(() => { server.kill('SIGKILL'); resolve() }, 3000)),
    ])
  }
}
