/**
 * Create a new topic on Bitcointalk using a saved Playwright session.
 * Requires an existing logged-in session in .sessions/profiles/bitcointalk/.
 *
 * Usage:
 *   node scripts/social/bitcointalk-post.js <board-url-key-or-id> <title> <body>
 *
 * Example:
 *   node scripts/social/bitcointalk-post.js bitcoin "Bitcoin gap fix explained" "Here is why gaps matter..."
 *
 * Common board keys: bitcoin, altcoins, marketplace, offthewallbizarre
 * Board IDs can be found in the URL: https://bitcointalk.org/index.php?board=1.0 → board id is 1
 *
 * Returns: { success: true, url: "https://bitcointalk.org/index.php?topic=..." }
 */

import { getContext, closeContext, randomDelay, sleep, humanType } from './session.js';
import { solveTurnstile } from '../solve-captcha.mjs';

const BOARD_MAP = {
  bitcoin: 1,
  altcoins: 67,
  marketplace: 5,
  economics: 30,
  speculation: 4,
  beginners: 239,
};

function resolveBoardId(boardKeyOrId) {
  if (/^\d+$/.test(boardKeyOrId)) return Number(boardKeyOrId);
  const mapped = BOARD_MAP[boardKeyOrId.toLowerCase()];
  if (mapped) return mapped;
  throw new Error(`Unknown board: "${boardKeyOrId}". Use a numeric board ID or one of: ${Object.keys(BOARD_MAP).join(', ')}`);
}

/**
 * Post a new topic to a Bitcointalk board.
 * @param {string|number} boardKeyOrId - board name key or numeric board ID
 * @param {string} title - topic subject
 * @param {string} body - topic body text
 * @returns {{ success: boolean, url: string|null, error?: string }}
 */
export async function bitcointalkPost(boardKeyOrId, title, body) {
  const boardId = resolveBoardId(boardKeyOrId);
  console.log(`[bitcointalk-post] Posting to board ${boardId}: "${title.substring(0, 60)}..."`);

  // Use headless:false — Cloudflare Turnstile blocks headless browsers entirely
  const ctx = await getContext('bitcointalk', { headless: false });
  const { page } = ctx;

  const postUrl = `https://bitcointalk.org/index.php?action=post;board=${boardId}.0`;

  try {
    // Navigate to the board's new topic page
    await page.goto(postUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await randomDelay(1500, 2500);

    // Handle Cloudflare Turnstile — auto-resolves in non-headless mode, falls back to Telegram
    const cfOk = await solveTurnstile({
      page,
      pageUrl: postUrl,
      agentContext: 'Bitcointalk post',
    });
    if (!cfOk) {
      throw new Error('Cloudflare Turnstile could not be resolved — see browser window or Telegram for instructions');
    }
    await randomDelay(500, 1000);

    const currentUrl = page.url().toString();
    if (currentUrl.includes('action=login') || currentUrl.includes('action=register')) {
      throw new Error('Session expired — run bitcointalk-signup.js or log in manually first');
    }

    await page.screenshot({ path: 'scripts/social/.debug-bt-post-page.png' }).catch(() => {});

    // Fill subject/title
    const subjectInput = page.locator('input[name="subject"]').first();
    await subjectInput.waitFor({ state: 'visible', timeout: 15000 });
    await subjectInput.fill('');
    await humanType(page, title, 60);
    await randomDelay(500, 1000);

    // Fill body (Bitcointalk uses a textarea, not contenteditable)
    const bodyInput = page.locator('textarea[name="message"]').first();
    await bodyInput.waitFor({ state: 'visible', timeout: 10000 });
    await bodyInput.click();
    await randomDelay(400, 700);
    await humanType(page, body, 50);
    await randomDelay(500, 1000);

    await page.screenshot({ path: 'scripts/social/.debug-bt-before-post.png' }).catch(() => {});

    // Check for CAPTCHA
    const captchaImg = page.locator('img#captcha').or(page.locator('img[src*="captcha"]')).first();
    if (await captchaImg.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('\n[bitcointalk-post] CAPTCHA detected. Manual action required:');
      console.log('  1. Look at the browser window for the CAPTCHA image');
      console.log('  2. Enter the CAPTCHA text in the browser, then press ENTER here.');
      await waitForEnter();
    }

    // Submit the post
    const submitBtn = page.locator('input[value="Post"]').or(page.locator('input[name="post"]')).first();
    await submitBtn.click();
    await randomDelay(3000, 5000);

    const finalUrl = page.url().toString();
    const isTopicUrl = finalUrl.includes('topic=');

    console.log('[bitcointalk-post] Post submitted!');
    if (isTopicUrl) console.log('[bitcointalk-post] URL:', finalUrl);

    return { success: true, url: isTopicUrl ? finalUrl : null };
  } catch (err) {
    console.error('[bitcointalk-post] Failed:', err.message);
    await page.screenshot({ path: 'scripts/social/.debug-bt-post-fail.png' }).catch(() => {});
    return { success: false, error: err.message };
  } finally {
    await closeContext(ctx);
  }
}

function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => resolve());
  });
}

// CLI: node bitcointalk-post.js <board> <title> <body>
const [, , board, title, ...bodyParts] = process.argv;
if (board && title) {
  bitcointalkPost(board, title, bodyParts.join(' ')).then(r => {
    console.log(JSON.stringify(r));
    if (!r.success) process.exit(1);
  });
}
