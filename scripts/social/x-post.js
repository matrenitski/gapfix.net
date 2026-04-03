/**
 * Post a tweet to @bitcoin_gap_fix using a saved Playwright session.
 * Run x-login.js first to establish the session.
 *
 * Usage:
 *   node scripts/social/x-post.js "Your tweet text here"
 *
 * Or import as a module:
 *   import { postTweet } from './x-post.js';
 *   await postTweet('Hello from GapFix!');
 */

import { getContext, saveSession, randomDelay } from './session.js';

/**
 * Post a tweet. Returns the tweet URL on success.
 */
export async function postTweet(text) {
  console.log(`[x-post] Posting: "${text.substring(0, 60)}..."`);
  const { browser, context, page } = await getContext('x');

  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 3000);

    // Check if still logged in
    if (page.url().includes('/login')) {
      throw new Error('Session expired — run x-login.js first');
    }

    // Click the tweet compose box
    const tweetBox = page.locator('[data-testid="tweetTextarea_0"]');
    await tweetBox.waitFor({ timeout: 15000 });
    await tweetBox.click();
    await randomDelay(500, 1000);

    // Type the tweet with human-like delays
    await page.keyboard.type(text, { delay: 30 });
    await randomDelay(1000, 2000);

    // Click the Post button
    const postButton = page.locator('[data-testid="tweetButtonInline"]');
    await postButton.waitFor({ timeout: 5000 });
    await postButton.click();
    await randomDelay(3000, 5000);

    // Try to grab the tweet URL from the confirmation
    let tweetUrl = null;
    try {
      const successLink = page.locator('a[href*="/status/"]').first();
      if (await successLink.isVisible({ timeout: 5000 })) {
        const href = await successLink.getAttribute('href');
        tweetUrl = `https://x.com${href}`;
      }
    } catch {
      // Non-fatal — tweet was posted but we couldn't capture URL
    }

    // Save refreshed session cookies
    await saveSession('x', context);

    console.log('[x-post] Tweet posted successfully!');
    if (tweetUrl) console.log('[x-post] URL:', tweetUrl);

    return { success: true, url: tweetUrl };
  } catch (err) {
    console.error('[x-post] Failed:', err.message);
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

// CLI usage: node x-post.js "tweet text"
if (process.argv[2]) {
  postTweet(process.argv.slice(2).join(' ')).then(result => {
    if (!result.success) process.exit(1);
  });
}
