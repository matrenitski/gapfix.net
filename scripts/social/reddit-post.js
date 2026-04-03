/**
 * Post a text (self) post to Reddit using a saved Playwright session.
 * Requires an existing logged-in session in .sessions/profiles/reddit/.
 *
 * Usage:
 *   node scripts/social/reddit-post.js <subreddit> <title> <body>
 *
 * Example:
 *   node scripts/social/reddit-post.js Bitcoin "Bitcoin gap fix explained" "Here is why gaps matter..."
 *
 * Returns: { success: true, url: "https://reddit.com/r/.../comments/..." }
 */

import { getContext, closeContext, randomDelay, sleep, humanType } from './session.js';

/**
 * Post a self (text) post to the given subreddit.
 * @param {string} subreddit - subreddit name without r/ prefix
 * @param {string} title - post title
 * @param {string} body - post body text
 * @returns {{ success: boolean, url: string|null, error?: string }}
 */
export async function redditPost(subreddit, title, body) {
  console.log(`[reddit-post] Posting to r/${subreddit}: "${title.substring(0, 60)}..."`);
  const ctx = await getContext('reddit');
  const { page } = ctx;

  try {
    // Go to the new post page for the subreddit
    await page.goto(`https://www.reddit.com/r/${subreddit}/submit`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await randomDelay(2000, 3000);

    const currentUrl = page.url().toString();
    if (currentUrl.includes('/login') || currentUrl.includes('/register')) {
      throw new Error('Session expired — run reddit-signup.js or log in manually first');
    }

    await page.screenshot({ path: 'scripts/social/.debug-reddit-submit.png' }).catch(() => {});

    // Make sure we are on the Text tab
    const textTab = page.locator('[role="tab"]:has-text("Text")').or(page.locator('button:has-text("Text")')).first();
    if (await textTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await textTab.click();
      await randomDelay(800, 1200);
    }

    // Fill title
    const titleInput = page.locator('textarea[placeholder*="Title"]').or(page.locator('[data-testid="post-title-input"]')).first();
    await titleInput.waitFor({ state: 'visible', timeout: 15000 });
    await titleInput.click();
    await humanType(page, title, 60);
    await randomDelay(500, 1000);

    // Fill body
    const bodyInput = page
      .locator('div[contenteditable="true"]')
      .or(page.locator('textarea[placeholder*="body"]'))
      .first();
    if (await bodyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bodyInput.click();
      await randomDelay(400, 700);
      await humanType(page, body, 50);
      await randomDelay(500, 1000);
    }

    await page.screenshot({ path: 'scripts/social/.debug-reddit-before-post.png' }).catch(() => {});

    // Click Post button
    const postBtn = page
      .locator('button:has-text("Post")')
      .or(page.locator('[data-testid="submit-post-button"]'))
      .first();
    await postBtn.waitFor({ state: 'visible', timeout: 10000 });
    await postBtn.click({ force: true });
    await randomDelay(3000, 5000);

    const finalUrl = page.url().toString();
    const isPostUrl = finalUrl.includes('/comments/');

    console.log('[reddit-post] Post submitted!');
    if (isPostUrl) console.log('[reddit-post] URL:', finalUrl);

    return { success: true, url: isPostUrl ? finalUrl : null };
  } catch (err) {
    console.error('[reddit-post] Failed:', err.message);
    await page.screenshot({ path: 'scripts/social/.debug-reddit-post-fail.png' }).catch(() => {});
    return { success: false, error: err.message };
  } finally {
    await closeContext(ctx);
  }
}

// CLI: node reddit-post.js <subreddit> <title> <body>
const [, , subreddit, title, ...bodyParts] = process.argv;
if (subreddit && title) {
  redditPost(subreddit, title, bodyParts.join(' ')).then(r => {
    console.log(JSON.stringify(r));
    if (!r.success) process.exit(1);
  });
}
