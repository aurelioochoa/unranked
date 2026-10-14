import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
const directory = await mkdtemp(join(tmpdir(), 'unranked-assistant-'))
const port = Number(process.env.ASSISTANT_TEST_PORT ?? 3023)
const base = `http://localhost:${port}`
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', String(port)], { env: { ...process.env, DATABASE_PATH: join(directory, 'test.db'), HUNTER_ID: 'sage-test', HUNTER_NAME: 'Hunter' }, stdio: ['ignore', 'pipe', 'pipe'] })
let logs = ''; server.stdout.on('data', value => { logs += value }); server.stderr.on('data', value => { logs += value })
let browser
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs)
    try { const response = await fetch(`${base}/api/assistant/context`); if (response.ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, `server did not start: ${logs}`)
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/awaken`)
  await page.evaluate(async () => {
    const ctx = await (await fetch('/api/assistant/context')).json(); ctx.preferences.speak = false
    const response = await fetch('/api/assistant/preferences', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ctx.preferences) })
    if (!response.ok) throw new Error('could not prepare silent test preferences')
  })
  await page.reload(); await page.getByRole('button', { name: 'Great Sage', exact: true }).click()
  const context = () => page.evaluate(async () => (await fetch('/api/assistant/context')).json())
  async function command(text) {
    const count = await page.locator('.sage-message--assistant').count()
    await page.locator('#sage-command').fill(text); await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.waitForFunction(count => document.querySelectorAll('.sage-message--assistant').length > count, count)
    await page.waitForFunction(() => document.querySelector('.sage-state')?.textContent?.startsWith('idle'))
  }
  await command('set my name to Sage Test'); assert.equal(await page.locator('#awaken-name').inputValue(), 'Sage Test')
  await command('accept awakening'); await page.waitForSelector('.sage-confirm'); assert.match(page.url(), /awaken/)
  await page.locator('.sage-confirm').getByRole('button', { name: 'Confirm', exact: true }).click(); await page.waitForURL(`${base}/`)
  await command('fill dungeon Write report for 25 minutes mind'); await page.waitForURL('**/dungeon')
  await page.waitForFunction(() => document.querySelector('#objective')?.value === 'Write report')
  assert.equal(await page.locator('#minutes').inputValue(), '25'); assert.equal((await context()).run, null)
  await page.locator('#objective').fill('Revised report'); await command('start'); assert.equal((await context()).run.objective, 'Revised report')
  await command('clear dungeon'); assert.match(await page.locator('.sage-history').innerText(), /cannot clear|served|active|early|still running|not over|has not/i)
  await command('flee dungeon'); await page.waitForSelector('.sage-confirm'); await page.locator('.sage-confirm').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.waitForSelector('.sage-confirm', { state: 'detached' }); assert.ok((await context()).run)
  await command('open settings'); await page.waitForURL('**/system'); await page.waitForSelector('#name')
  await command('fill set my name to New Hunter'); assert.equal(await page.locator('#name').inputValue(), 'New Hunter'); assert.equal((await context()).hunter.name, 'Sage Test')
  await command('save'); assert.equal((await context()).hunter.name, 'New Hunter')
  await page.getByRole('button', { name: 'Tap to talk', exact: true }).click(); await page.waitForSelector('.sage-error'); assert.match(await page.locator('.sage-error').innerText(), /Download Needle and Whistle/)
  for (const theme of ['hologram', 'monarch', 'sovereign', 'terminal', 'phosphor', 'falna', 'parchment']) { await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme); assert.ok(await page.locator('.sage-panel').isVisible()) }
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false) }
  await page.locator('#sage-command').focus(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#sage-panel').count(), 0)
  await page.getByRole('button', { name: 'Great Sage', exact: true }).focus(); await page.keyboard.press('Enter'); assert.ok(await page.locator('#sage-panel').isVisible())
  await page.reload(); await page.getByRole('button', { name: 'Great Sage', exact: true }).click(); assert.match(await page.locator('.sage-history').innerText(), /New Hunter/)
  await page.getByRole('button', { name: 'Clear history', exact: true }).click(); await page.waitForFunction(() => document.querySelectorAll('.sage-message').length === 0); assert.equal((await context()).history.length, 0)
  assert.deepEqual(errors, []); console.log('ASSISTANT BROWSER PASS')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  if (server.exitCode === null) await Promise.race([new Promise(resolve => server.once('exit', resolve)), new Promise(resolve => setTimeout(() => { server.kill('SIGKILL'); resolve() }, 3000))])
  await rm(directory, { recursive: true, force: true })
}
