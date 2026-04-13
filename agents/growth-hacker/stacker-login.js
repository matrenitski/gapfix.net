/**
 * One-time Stacker.news login to save a persistent browser session.
 * After running this, stacker-post.js will work headlessly without re-login.
 *
 * Usage:
 *   node agents/growth-hacker/stacker-login.js
 *
 * This opens a visible browser window. Log in manually (Lightning, GitHub, or email),
 * then press Enter in the terminal to save the session and exit.
 *
 * The session is stored in .sessions/profiles/stacker/ and reused by stacker-post.js.
 */

import * as readline from 'readline';
import { getContext, closeContext } from '../../scripts/social/session.js';

async function login() {
  console.log('[stacker-login] Opening Stacker.news in browser...');
  console.log('[stacker-login] Log in via Lightning, GitHub, or email, then press Enter here.');

  const ctx = await getContext('stacker', { headless: false });
  const { page } = ctx;

  try {
    await page.goto('https://stacker.news', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for user to log in manually
    await new Promise(resolve => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('\nPress Enter after logging in to save the session... ', () => {
        rl.close();
        resolve();
      });
    });

    // Verify login
    const currentUrl = page.url().toString();
    const hasName = await page.locator('[data-bs-toggle="dropdown"], nav a[href*="/~"], .nav-link').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasName && !currentUrl.includes('stacker.news')) {
      console.warn('[stacker-login] Could not confirm login — session may not be valid');
    } else {
      console.log('[stacker-login] Session saved to .sessions/profiles/stacker/');
    }
  } finally {
    await closeContext(ctx);
  }
}

login().catch(err => {
  console.error('[stacker-login] Error:', err.message);
  process.exit(1);
});
