/**
 * Post a tweet to @bitcoin_gap_fix using a saved Playwright session.
 * Explicitly switches to @bitcoin_gap_fix account before posting.
 *
 * Usage:
 *   node scripts/social/x-post.js "Your tweet text here"
 */

import { getContext, closeContext, randomDelay, sleep } from './session.js';

const TARGET_ACCOUNT = 'bitcoin_gap_fix';

/**
 * Switch X to the specified account using the account switcher menu.
 * Returns true if already on target or switched successfully.
 */
async function switchToAccount(page, targetUsername) {
  console.log(`[x-post] Checking active account...`);

  // Check current account from nav profile link
  const profileLink = await page.locator('[data-testid="AppTabBar_Profile_Link"]').getAttribute('href').catch(() => null);
  const currentUser = profileLink ? profileLink.replace('/', '') : null;
  console.log(`[x-post] Current account: @${currentUser}`);

  if (currentUser && currentUser.toLowerCase() === targetUsername.toLowerCase()) {
    console.log(`[x-post] Already on @${targetUsername}`);
    return true;
  }

  // Open account switcher
  console.log(`[x-post] Switching to @${targetUsername}...`);

  // Click the account/more options button in the nav
  const accountSwitcher = page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').first();
  if (await accountSwitcher.isVisible({ timeout: 5000 }).catch(() => false)) {
    await accountSwitcher.click();
    await sleep(1500);
    await page.screenshot({ path: 'scripts/social/.debug-switcher.png' }).catch(() => {});

    // Look for the target account in the switcher
    const targetLink = page.locator(`a[href="/${targetUsername}"]`).first();
    if (await targetLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await targetLink.click({ force: true });
      await sleep(2000);
      console.log(`[x-post] Switched to @${targetUsername}`);
      return true;
    }

    // Try finding by text
    const targetByText = page.locator(`text=@${targetUsername}`).first();
    if (await targetByText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await targetByText.click();
      await sleep(2000);
      return true;
    }

    // Close switcher if we couldn't switch
    await page.keyboard.press('Escape');
    console.error(`[x-post] Could not find @${targetUsername} in account switcher`);
    return false;
  }

  console.error('[x-post] Account switcher not found');
  return false;
}

/**
 * Post a tweet. Returns { success, url } or { success: false, error }.
 */
export async function postTweet(text) {
  console.log(`[x-post] Posting: "${text.substring(0, 80)}..."`);
  const ctx = await getContext('x');
  const { context, page } = ctx;

  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(2000, 3000);

    const currentUrl = page.url().toString();
    if (currentUrl.includes('/login') || currentUrl.includes('/i/flow')) {
      throw new Error('Session expired — run x-login.js first');
    }

    // Ensure we are posting as @bitcoin_gap_fix
    const switched = await switchToAccount(page, TARGET_ACCOUNT);
    if (!switched) {
      throw new Error(`Could not switch to @${TARGET_ACCOUNT} — check account switcher`);
    }

    // Re-check profile link after switch
    const profileLink = await page.locator('[data-testid="AppTabBar_Profile_Link"]').getAttribute('href').catch(() => null);
    const activeUser = profileLink ? profileLink.replace('/', '') : 'unknown';
    console.log(`[x-post] Active account after switch: @${activeUser}`);

    if (activeUser.toLowerCase() !== TARGET_ACCOUNT.toLowerCase()) {
      await page.screenshot({ path: 'scripts/social/.debug-wrong-account.png' }).catch(() => {});
      throw new Error(`Still on wrong account @${activeUser} — expected @${TARGET_ACCOUNT}`);
    }

    // Use the compose modal URL — more reliable than the inline home compose box
    await page.goto('https://x.com/compose/tweet', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await randomDelay(2000, 3000);

    const composeArea = page.locator('div[contenteditable="true"]').first();
    await composeArea.waitFor({ state: 'visible', timeout: 15000 });
    await composeArea.click();
    await randomDelay(500, 1000);

    await composeArea.pressSequentially(text, { delay: 40 });
    await randomDelay(1000, 2000);

    // Click the modal Post button (force to bypass overlay intercept)
    const postButton = page.locator('[data-testid="tweetButton"]').first();
    await postButton.waitFor({ timeout: 5000 });
    await postButton.click({ force: true });
    await randomDelay(3000, 5000);

    // Navigate to profile and grab the latest tweet URL
    let tweetUrl = null;
    await page.goto(`https://x.com/${TARGET_ACCOUNT}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    const firstTweetLink = await page.locator('article[data-testid="tweet"] a[href*="/status/"]').first().getAttribute('href').catch(() => null);
    if (firstTweetLink) tweetUrl = `https://x.com${firstTweetLink}`;

    console.log('[x-post] Tweet posted successfully!');
    if (tweetUrl) console.log('[x-post] URL:', tweetUrl);

    return { success: true, url: tweetUrl };
  } catch (err) {
    console.error('[x-post] Failed:', err.message);
    await page.screenshot({ path: 'scripts/social/.debug-post-fail.png' }).catch(() => {});
    return { success: false, error: err.message };
  } finally {
    await closeContext(ctx);
  }
}

// CLI: node x-post.js "tweet text"
if (process.argv[2]) {
  postTweet(process.argv.slice(2).join(' ')).then(r => {
    if (!r.success) process.exit(1);
  });
}
