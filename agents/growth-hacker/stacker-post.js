/**
 * Post a discussion to Stacker.news using the GraphQL API.
 * Requires STACKER_NEWS_API_KEY environment variable (Settings → API → generate key).
 *
 * Usage:
 *   node agents/growth-hacker/stacker-post.js <title> <body>
 *   node agents/growth-hacker/stacker-post.js <title> --file <path>
 *   node agents/growth-hacker/stacker-post.js --sub bitcoin <title> <body>
 *
 * Examples:
 *   node agents/growth-hacker/stacker-post.js "Bitcoin gap limit explained" "Here is why gaps matter..."
 *   node agents/growth-hacker/stacker-post.js "My post" --file post.md
 *
 * Environment:
 *   STACKER_NEWS_API_KEY  — Bearer token from your Stacker.news account settings
 *
 * Returns: { success: true, id, url } or { success: false, error }
 */

import { readFileSync } from 'fs';

const GRAPHQL_ENDPOINT = 'https://stacker.news/api/graphql';
const DEFAULT_SUB = 'bitcoin';

const UPSERT_DISCUSSION = `
  mutation UpsertDiscussion($title: String!, $text: String, $subNames: [String!]!) {
    upsertDiscussion(title: $title, text: $text, subNames: $subNames) {
      id
    }
  }
`;

/**
 * Post a discussion item to Stacker.news.
 * @param {string} title - Post title
 * @param {string} body - Post body (markdown supported)
 * @param {object} opts - { sub: string (default 'bitcoin') }
 * @returns {{ success: boolean, id?: string, url?: string, error?: string }}
 */
export async function stackerPost(title, body, { sub = DEFAULT_SUB } = {}) {
  const apiKey = process.env.STACKER_NEWS_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'STACKER_NEWS_API_KEY env var is not set' };
  }

  console.log(`[stacker-post] Posting to ~${sub}: "${title.substring(0, 80)}${title.length > 80 ? '...' : ''}"`);

  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: UPSERT_DISCUSSION,
        variables: {
          title,
          text: body || undefined,
          subNames: [sub],
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const json = await res.json();

    if (json.errors && json.errors.length > 0) {
      const msg = json.errors.map(e => e.message).join('; ');
      throw new Error(msg);
    }

    const id = json.data?.upsertDiscussion?.id;
    if (!id) {
      throw new Error('No item id returned from API');
    }

    const url = `https://stacker.news/items/${id}`;
    console.log('[stacker-post] Posted successfully!');
    console.log('[stacker-post] URL:', url);

    return { success: true, id, url };
  } catch (err) {
    console.error('[stacker-post] Failed:', err.message);
    return { success: false, error: err.message };
  }
}

// CLI: node stacker-post.js [--sub <sub>] <title> [--file <path> | <body>]
if (process.argv[1] && process.argv[1].endsWith('stacker-post.js')) {
  const args = process.argv.slice(2);

  let sub = DEFAULT_SUB;
  let title = null;
  let body = '';
  let filePath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sub' && args[i + 1]) {
      sub = args[++i];
    } else if (args[i] === '--file' && args[i + 1]) {
      filePath = args[++i];
    } else if (!title) {
      title = args[i];
    } else {
      body += (body ? ' ' : '') + args[i];
    }
  }

  if (!title) {
    console.error('Usage: node stacker-post.js [--sub <sub>] <title> [--file <path> | <body>]');
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

  stackerPost(title, body, { sub }).then(r => {
    console.log(JSON.stringify(r));
    if (!r.success) process.exit(1);
  });
}
