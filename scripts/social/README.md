# Social Media Automation Scripts

Playwright-based browser automation for social media. No API credits needed — drives the real web UI.

## Setup

### 1. Add credentials to `.env`

```
X_USERNAME=bitcoin_gap_fix
X_EMAIL=max@gapfix.net
X_PASSWORD=your_password_here
```

### 2. First-time login (run once)

```bash
node scripts/social/x-login.js
```

This opens a visible browser, logs in, and saves the session to `.sessions/x.json`. You may need to complete a CAPTCHA manually on first login. After that, all subsequent scripts run headlessly with no login needed.

### 3. Post a tweet

```bash
node scripts/social/x-post.js "Your tweet text here"
```

### 4. Like and repost tweets by search

```bash
# Like 10 tweets matching #Bitcoin
node scripts/social/x-interact.js "#Bitcoin" --likes 10

# Like 5 and repost 2
node scripts/social/x-interact.js "#Bitcoin" --likes 5 --reposts 2
```

## Files

| File | Purpose |
|---|---|
| `session.js` | Shared session manager — load/save browser cookies |
| `x-login.js` | One-time login flow — run manually first |
| `x-post.js` | Post a tweet |
| `x-interact.js` | Like and repost from search results |

## Extending to other platforms

To add Instagram, LinkedIn, etc.:
1. Create `instagram-login.js`, `instagram-post.js` following the same pattern
2. Use `getContext('instagram')` — sessions are stored per-service in `.sessions/`

## Notes

- `.sessions/` is gitignored — never commit session files (they contain auth cookies)
- Add human-like delays between actions to avoid detection
- Stay well under platform rate limits (suggested: max 50 interactions/hour)
