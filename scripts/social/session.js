/**
 * Browser session manager — uses persistent context (full user profile on disk).
 * This is the most reliable approach for avoiding bot detection:
 * - Cookies, localStorage, IndexedDB all persist between runs
 * - Same browser fingerprint every time
 * - No need to re-login after first successful session
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_DIR = join(__dirname, '../../.sessions/profiles');

export function profilePath(service) {
  const dir = join(PROFILES_DIR, service);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Launch a persistent browser context (full profile — cookies, storage, etc. survive).
 * First run will be a fresh profile; subsequent runs reuse the same profile.
 */
export async function getContext(service, { headless = true } = {}) {
  const userDataDir = profilePath(service);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  const page = await context.newPage();

  // Mask automation fingerprint
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  return { context, page, browser: context };
}

/**
 * Close the persistent context.
 */
export async function closeContext({ context }) {
  await context.close();
}

/**
 * Detect a Cloudflare Turnstile/challenge page and wait for it to auto-resolve.
 * Returns true if the page is clear (no challenge, or challenge resolved automatically).
 * Returns false if the challenge is still present after the timeout.
 *
 * In non-headless mode with a seasoned profile, Turnstile usually auto-resolves within ~10s.
 *
 * @param {import('playwright').Page} page
 * @param {number} timeoutMs  Max time to wait for auto-resolution (default 20s)
 * @returns {Promise<boolean>}
 */
export async function waitForCloudflare(page, timeoutMs = 20000) {
  const isCFChallenge = await page.evaluate(() => {
    const title = document.title || '';
    const bodyText = document.body?.innerText || '';
    return (
      title.includes('Just a moment') ||
      bodyText.includes('Performing security verification') ||
      bodyText.includes('Checking if the site connection is secure') ||
      !!document.querySelector('#cf-challenge-running, .cf-browser-verification, #challenge-running')
    );
  }).catch(() => false);

  if (!isCFChallenge) return true; // No challenge present

  console.log('[session] Cloudflare Turnstile/challenge detected — waiting for auto-resolve...');

  try {
    await page.waitForFunction(
      () => {
        const title = document.title || '';
        const bodyText = document.body?.innerText || '';
        return (
          !title.includes('Just a moment') &&
          !bodyText.includes('Performing security verification') &&
          !bodyText.includes('Checking if the site connection is secure') &&
          !document.querySelector('#cf-challenge-running, .cf-browser-verification, #challenge-running')
        );
      },
      { timeout: timeoutMs },
    );
    console.log('[session] Cloudflare challenge resolved automatically');
    return true;
  } catch {
    console.log('[session] Cloudflare challenge did not auto-resolve within timeout');
    return false;
  }
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function randomDelay(minMs = 1000, maxMs = 3000) {
  return sleep(Math.floor(Math.random() * (maxMs - minMs) + minMs));
}

/**
 * Type text character by character with human-like delays.
 */
export async function humanType(page, text, delayMs = 80) {
  for (const char of text) {
    await page.keyboard.type(char, { delay: delayMs + Math.random() * 40 });
  }
}
