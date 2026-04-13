/**
 * Post a discussion to Stacker.news using Playwright browser automation.
 * Uses a persistent browser profile so you only need to log in once via stacker-login.js.
 *
 * Usage:
 *   node agents/growth-hacker/stacker-post.js <title> <body>
 *   node agents/growth-hacker/stacker-post.js <title> --file <path>
 *   node agents/growth-hacker/stacker-post.js --sub bitcoin <title> <body>
 *
 * Examples:
 *   node agents/growth-hacker/stacker-post.js "Bitcoin gap limit explained" "Here is why gaps matter..."
 *   node agents/growth-hacker/stacker-post.js "My post title" --file post.md
 *
 * First-time setup:
 *   Run stacker-login.js once to log in and save the session:
 *   node agents/growth-hacker/stacker-login.js
 *
 * Returns: { success: true, url } or { success: false, error }
 */

import { readFileSync } from 'fs';
import { getContext, closeContext, randomDelay, sleep, humanType } from '../../scripts/social/session.js';

const DEFAULT_SUB = 'bitcoin';

/**
 * Post a discussion to Stacker.news.
 * @param {string} title - Post title
 * @param {string} body  - Post body (markdown supported)
 * @param {object} opts  - { sub: string (default 'bitcoin'), headless: boolean }
 * @returns {{ success: boolean, url?: string, error?: string }}
 */
export async function stackerPost(title, body, { sub = DEFAULT_SUB, headless = true } = {}) {
  console.log(`[stacker-post] Posting to ~${sub}: "${title.substring(0, 80)}${title.length > 80 ? '...' : ''}"`);

  const ctx = await getContext('stacker', { headless });
  const { page } = ctx;

  try {
    // Navigate to the new-post page for the target territory
    const postUrl = `https://stacker.news/~${sub}/post`;
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 3000);

    const currentUrl = page.url().toString();
    if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
      throw new Error('Session expired — run stacker-login.js first to establish a session');
    }

    await page.screenshot({ path: 'agents/growth-hacker/.debug-stacker-post.png' }).catch(() => {});

    // Select "Discussion" post type (tab or radio button)
    const discussionTab = page.locator('a:has-text("discussion"), button:has-text("discussion"), [role="tab"]:has-text("discussion")').first();
    if (await discussionTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await discussionTab.click();
      await randomDelay(600, 1000);
    }

    // Fill in the title
    const titleInput = page.locator('input[name="title"], input[placeholder*="title" i], #title').first();
    await titleInput.waitFor({ state: 'visible', timeout: 15000 });
    await titleInput.click();
    await randomDelay(300, 600);
    await titleInput.fill('');
    await humanType(page, title, 50);
    await randomDelay(500, 900);

    // Fill in the body text (markdown editor)
    if (body) {
      const bodyInput = page.locator('textarea[name="text"], div[contenteditable="true"], .CodeMirror-code, textarea').first();
      if (await bodyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await bodyInput.click();
        await randomDelay(400, 700);
        await humanType(page, body, 30);
        await randomDelay(500, 900);
      }
    }

    await page.screenshot({ path: 'agents/growth-hacker/.debug-stacker-before-submit.png' }).catch(() => {});

    // Click the submit/post button
    const submitBtn = page.locator('button[type="submit"]:has-text("post"), button:has-text("post it"), button[type="submit"]').first();
    await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
    await submitBtn.click({ force: true });
    await randomDelay(3000, 5000);

    const finalUrl = page.url().toString();
    const isItemUrl = finalUrl.includes('/items/');

    if (!isItemUrl) {
      await page.screenshot({ path: 'agents/growth-hacker/.debug-stacker-post-result.png' }).catch(() => {});
      // Check for error messages
      const errorMsg = await page.locator('.invalid-feedback, [class*="error"], [class*="Error"]').first().textContent({ timeout: 3000 }).catch(() => null);
      if (errorMsg) throw new Error(`Form error: ${errorMsg.trim()}`);
      throw new Error(`Post may not have submitted — still on: ${finalUrl}`);
    }

    console.log('[stacker-post] Posted successfully!');
    console.log('[stacker-post] URL:', finalUrl);
    return { success: true, url: finalUrl };
  } catch (err) {
    console.error('[stacker-post] Failed:', err.message);
    await page.screenshot({ path: 'agents/growth-hacker/.debug-stacker-post-fail.png' }).catch(() => {});
    return { success: false, error: err.message };
  } finally {
    await closeContext(ctx);
  }
}

// CLI: node stacker-post.js [--sub <sub>] [--headful] <title> [--file <path> | <body...>]
if (process.argv[1] && process.argv[1].endsWith('stacker-post.js')) {
  const args = process.argv.slice(2);

  let sub = DEFAULT_SUB;
  let headless = true;
  let title = null;
  let body = '';
  let filePath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sub' && args[i + 1]) {
      sub = args[++i];
    } else if (args[i] === '--headful') {
      headless = false;
    } else if (args[i] === '--file' && args[i + 1]) {
      filePath = args[++i];
    } else if (!title) {
      title = args[i];
    } else {
      body += (body ? ' ' : '') + args[i];
    }
  }

  if (!title) {
    console.error('Usage: node stacker-post.js [--sub <sub>] [--headful] <title> [--file <path> | <body>]');
    process.exit(1);
  }

  if (filePath) {
    try {
      body = readFileSync(filePath, 'utf8').trim();
    } catch (err) {
      console.error(`[stacker-post] Could not read file: ${err.message}`);
      process.exit(1);
    }
  }

  stackerPost(title, body, { sub, headless }).then(r => {
    console.log(JSON.stringify(r));
    if (!r.success) process.exit(1);
  });
}
