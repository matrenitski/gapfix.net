/**
 * Like and repost tweets matching a search query on X.com.
 * Run x-login.js first to establish the session.
 *
 * Usage:
 *   node scripts/social/x-interact.js "#Bitcoin" --likes 10 --reposts 3
 *
 * Or import as a module:
 *   import { likeAndRepost } from './x-interact.js';
 *   await likeAndRepost('#Bitcoin', { maxLikes: 10, maxReposts: 3 });
 */

import { getContext, saveSession, randomDelay } from './session.js';

/**
 * Like and/or repost tweets from a search result.
 * @param {string} query - Search term (e.g. '#Bitcoin', 'gapfix.net')
 * @param {object} opts - { maxLikes, maxReposts, headless }
 */
export async function likeAndRepost(query, { maxLikes = 5, maxReposts = 0, headless = true } = {}) {
  console.log(`[x-interact] Searching for "${query}" — likes: ${maxLikes}, reposts: ${maxReposts}`);
  const { browser, context, page } = await getContext('x', { headless });

  let liked = 0;
  let reposted = 0;

  try {
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&f=live`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 3000);

    if (page.url().includes('/login')) {
      throw new Error('Session expired — run x-login.js first');
    }

    // Scroll and interact with tweets
    for (let attempt = 0; attempt < 30 && (liked < maxLikes || reposted < maxReposts); attempt++) {
      const articles = page.locator('article[data-testid="tweet"]');
      const count = await articles.count();

      for (let i = 0; i < count && (liked < maxLikes || reposted < maxReposts); i++) {
        const article = articles.nth(i);

        // Like
        if (liked < maxLikes) {
          const likeBtn = article.locator('[data-testid="like"]');
          if (await likeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await likeBtn.click();
            liked++;
            console.log(`[x-interact] Liked tweet ${liked}/${maxLikes}`);
            await randomDelay(1500, 3000);
          }
        }

        // Repost
        if (reposted < maxReposts) {
          const repostBtn = article.locator('[data-testid="retweet"]');
          if (await repostBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await repostBtn.click();
            await randomDelay(500, 1000);
            // Confirm repost in the modal
            const confirmBtn = page.locator('[data-testid="retweetConfirm"]');
            if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await confirmBtn.click();
              reposted++;
              console.log(`[x-interact] Reposted tweet ${reposted}/${maxReposts}`);
              await randomDelay(2000, 4000);
            }
          }
        }
      }

      // Scroll down to load more tweets
      await page.evaluate(() => window.scrollBy(0, 800));
      await randomDelay(1500, 2500);
    }

    await saveSession('x', context);
    console.log(`[x-interact] Done — liked: ${liked}, reposted: ${reposted}`);
    return { success: true, liked, reposted };
  } catch (err) {
    console.error('[x-interact] Failed:', err.message);
    return { success: false, error: err.message, liked, reposted };
  } finally {
    await browser.close();
  }
}

// CLI: node x-interact.js "#Bitcoin" --likes 10 --reposts 3
const args = process.argv.slice(2);
if (args[0]) {
  const query = args[0];
  const likesIdx = args.indexOf('--likes');
  const repostsIdx = args.indexOf('--reposts');
  const maxLikes = likesIdx >= 0 ? parseInt(args[likesIdx + 1]) : 5;
  const maxReposts = repostsIdx >= 0 ? parseInt(args[repostsIdx + 1]) : 0;
  likeAndRepost(query, { maxLikes, maxReposts }).then(r => {
    if (!r.success) process.exit(1);
  });
}
