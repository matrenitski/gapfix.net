/**
 * Telegram ↔ Paperclip Bridge
 *
 * Runs as a local daemon alongside Paperclip. Lets the board manage tasks and
 * receive agent notifications entirely through Telegram — no browser needed.
 *
 * Usage:
 *   node scripts/telegram-bridge.mjs
 *
 * Required env vars (in .env or exported):
 *   TELEGRAM_BOT_TOKEN   — from @BotFather
 *   TELEGRAM_CHAT_ID     — your personal chat ID (numeric)
 *
 * Optional env vars:
 *   PAPERCLIP_API_URL    — defaults to http://127.0.0.1:3100
 *   PAPERCLIP_COMPANY_ID — auto-detected from first company if not set
 *   BRIDGE_POLL_INTERVAL — seconds between Paperclip change polls (default 30)
 *
 * Bot commands:
 *   /list               — open + in-progress issues
 *   /new <title>        — create issue assigned to CEO
 *   /status <id>        — issue status + latest comment (e.g. MAX-66)
 *   /comment <id> <msg> — post a comment on an issue
 *   /done <id>          — mark issue done
 *   /cancel <id>        — cancel issue
 *   /help               — show this help
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Load .env from the project root
// ---------------------------------------------------------------------------
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '..', '.env');
try {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
} catch {
  // .env not found — rely on environment
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = String(process.env.TELEGRAM_CHAT_ID ?? '');
const PAP_URL   = (process.env.PAPERCLIP_API_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const POLL_INTERVAL_SEC = Number(process.env.BRIDGE_POLL_INTERVAL ?? 30);

if (!BOT_TOKEN) { console.error('[bridge] TELEGRAM_BOT_TOKEN is not set'); process.exit(1); }
if (!CHAT_ID)   { console.error('[bridge] TELEGRAM_CHAT_ID is not set');   process.exit(1); }

// ---------------------------------------------------------------------------
// Paperclip helpers (no auth needed — local_trusted mode grants board access)
// ---------------------------------------------------------------------------
let companyId = process.env.PAPERCLIP_COMPANY_ID ?? '';

async function papFetch(path, opts = {}) {
  const url = `${PAP_URL}${path}`;
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Paperclip ${opts.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function ensureCompanyId() {
  if (companyId) return;
  const companies = await papFetch('/api/companies');
  if (!companies.length) throw new Error('No companies found in Paperclip');
  companyId = companies[0].id;
}

async function listIssues(statuses = 'todo,in_progress,blocked') {
  await ensureCompanyId();
  return papFetch(`/api/companies/${companyId}/issues?status=${statuses}&limit=30`);
}

async function findIssue(identifier) {
  await ensureCompanyId();
  const results = await papFetch(`/api/companies/${companyId}/issues?q=${encodeURIComponent(identifier)}`);
  // Prefer exact identifier match
  const exact = results.find(i => i.identifier.toLowerCase() === identifier.toLowerCase());
  return exact ?? results[0] ?? null;
}

async function getIssueById(id) {
  return papFetch(`/api/issues/${id}`);
}

async function getComments(issueId) {
  return papFetch(`/api/issues/${issueId}/comments?order=desc&limit=5`);
}

async function createIssue(title) {
  await ensureCompanyId();
  // Find CEO agent to assign to
  const agents = await papFetch(`/api/companies/${companyId}/agents`);
  const ceo = agents.find(a => a.role === 'ceo');
  const body = {
    title,
    status: 'todo',
    companyId,
    ...(ceo ? { assigneeAgentId: ceo.id } : {}),
  };
  return papFetch(`/api/companies/${companyId}/issues`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function postComment(issueId, text) {
  return papFetch(`/api/issues/${issueId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: text }),
  });
}

async function updateIssue(issueId, fields) {
  return papFetch(`/api/issues/${issueId}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

// ---------------------------------------------------------------------------
// Telegram helpers
// ---------------------------------------------------------------------------
const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tgFetch(method, body = {}) {
  const res = await fetch(`${TG}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function send(text) {
  const r = await tgFetch('sendMessage', {
    chat_id: CHAT_ID,
    text,
    parse_mode: 'HTML',
  });
  if (!r.ok) console.warn('[bridge] Telegram send error:', r.description);
  return r;
}

async function getUpdates(offset, timeoutSec = 20) {
  const r = await tgFetch('getUpdates', {
    offset,
    timeout: timeoutSec,
    allowed_updates: ['message'],
  });
  if (!r.ok) throw new Error(`getUpdates failed: ${r.description}`);
  return r.result ?? [];
}

// ---------------------------------------------------------------------------
// Status emoji
// ---------------------------------------------------------------------------
const STATUS_EMOJI = {
  todo: '📋',
  in_progress: '🔄',
  blocked: '🚫',
  done: '✅',
  cancelled: '❌',
  in_review: '👀',
  backlog: '🗄️',
};

function emo(status) { return STATUS_EMOJI[status] ?? '❓'; }

function fmtIssue(issue) {
  return `${emo(issue.status)} <b>${issue.identifier}</b> — ${escHtml(issue.title)} [${issue.status}]`;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------
async function cmdHelp() {
  return `<b>Paperclip Bridge Commands</b>

/list — open issues
/new &lt;title&gt; — create issue
/status &lt;MAX-66&gt; — issue details
/comment &lt;MAX-66&gt; &lt;message&gt; — post comment
/done &lt;MAX-66&gt; — mark done
/cancel &lt;MAX-66&gt; — cancel issue
/help — this message`;
}

async function cmdList() {
  const issues = await listIssues('todo,in_progress,blocked');
  if (!issues.length) return '✨ No open issues.';
  return `<b>Open issues (${issues.length})</b>\n\n` + issues.map(fmtIssue).join('\n');
}

async function cmdNew(title) {
  if (!title) return '⚠️ Usage: /new &lt;title&gt;';
  const issue = await createIssue(title);
  return `✅ Created <b>${issue.identifier}</b>\n${escHtml(issue.title)}`;
}

async function cmdStatus(identifier) {
  if (!identifier) return '⚠️ Usage: /status &lt;MAX-66&gt;';
  const issue = await findIssue(identifier);
  if (!issue) return `❌ Issue not found: ${escHtml(identifier)}`;

  const comments = await getComments(issue.id);
  const latest = comments[0];

  let msg = `${emo(issue.status)} <b>${issue.identifier}</b> [${issue.status}]\n<i>${escHtml(issue.title)}</i>`;
  if (latest) {
    const snippet = stripMarkdown(latest.body).slice(0, 400);
    msg += `\n\n<b>Latest comment:</b>\n${escHtml(snippet)}${snippet.length === 400 ? '…' : ''}`;
  }
  return msg;
}

async function cmdComment(args) {
  const spaceIdx = args.indexOf(' ');
  if (spaceIdx === -1) return '⚠️ Usage: /comment &lt;MAX-66&gt; &lt;message&gt;';
  const identifier = args.slice(0, spaceIdx).trim();
  const text = args.slice(spaceIdx + 1).trim();
  if (!text) return '⚠️ Usage: /comment &lt;MAX-66&gt; &lt;message&gt;';

  const issue = await findIssue(identifier);
  if (!issue) return `❌ Issue not found: ${escHtml(identifier)}`;
  await postComment(issue.id, text);
  return `💬 Comment posted on <b>${issue.identifier}</b>`;
}

async function cmdDone(identifier) {
  if (!identifier) return '⚠️ Usage: /done &lt;MAX-66&gt;';
  const issue = await findIssue(identifier);
  if (!issue) return `❌ Issue not found: ${escHtml(identifier)}`;
  await updateIssue(issue.id, { status: 'done' });
  return `✅ <b>${issue.identifier}</b> marked done`;
}

async function cmdCancel(identifier) {
  if (!identifier) return '⚠️ Usage: /cancel &lt;MAX-66&gt;';
  const issue = await findIssue(identifier);
  if (!issue) return `❌ Issue not found: ${escHtml(identifier)}`;
  await updateIssue(issue.id, { status: 'cancelled' });
  return `❌ <b>${issue.identifier}</b> cancelled`;
}

async function handleCommand(text) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const args = rest.join(' ').trim();

  switch (cmd.toLowerCase()) {
    case '/help':   return cmdHelp();
    case '/list':   return cmdList();
    case '/new':    return cmdNew(args);
    case '/status': return cmdStatus(args);
    case '/comment':return cmdComment(args);
    case '/done':   return cmdDone(args);
    case '/cancel': return cmdCancel(args);
    default:
      return `❓ Unknown command: ${escHtml(cmd)}\n\nSend /help for a list of commands.`;
  }
}

// ---------------------------------------------------------------------------
// Change-poller — push notifications when agents update issues
// ---------------------------------------------------------------------------
// Track last-seen comment ID per issue and last-seen status
const seenComments = new Map();   // issueId → last comment id
const seenStatuses = new Map();   // issueId → last status

async function pollChanges() {
  let issues;
  try {
    // Poll all non-cancelled issues that might have activity
    issues = await listIssues('todo,in_progress,blocked,in_review,done');
  } catch (err) {
    console.warn('[bridge] Poll error (issues):', err.message);
    return;
  }

  for (const issue of issues) {
    const prevStatus = seenStatuses.get(issue.id);

    // Status change notification
    if (prevStatus !== undefined && prevStatus !== issue.status) {
      const msg = `${emo(issue.status)} <b>${issue.identifier}</b> status changed: ${prevStatus} → <b>${issue.status}</b>\n<i>${escHtml(issue.title)}</i>`;
      await send(msg).catch(e => console.warn('[bridge] Telegram send error:', e.message));
    }
    seenStatuses.set(issue.id, issue.status);

    // New agent comments
    try {
      const comments = await getComments(issue.id);
      if (!comments.length) continue;

      const latest = comments[0];
      const prevId = seenComments.get(issue.id);

      if (prevId === undefined) {
        // First poll — record current state, don't notify
        seenComments.set(issue.id, latest.id);
        continue;
      }

      if (prevId !== latest.id && latest.authorAgentId) {
        // New comment from an agent
        const snippet = stripMarkdown(latest.body).slice(0, 500);
        const msg = `💬 <b>${issue.identifier}</b> — agent update:\n${escHtml(snippet)}${snippet.length === 500 ? '…' : ''}`;
        await send(msg).catch(e => console.warn('[bridge] Telegram send error:', e.message));
        seenComments.set(issue.id, latest.id);
      }
    } catch (err) {
      console.warn(`[bridge] Poll comments error for ${issue.identifier}:`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
let updateOffset = 0;

async function init() {
  // Get current update offset so we only handle new messages
  try {
    const updates = await getUpdates(-1, 0);
    if (updates.length) updateOffset = updates[updates.length - 1].update_id + 1;
  } catch { /* ignore */ }

  // Seed the poller with current state so first run doesn't spam notifications
  await ensureCompanyId();
  await pollChanges();

  console.log(`[bridge] Started — listening in chat ${CHAT_ID}`);
  await send('🤖 Paperclip bridge online. Send /help for commands.');
}

let lastPoll = Date.now();

async function tick() {
  // Long-poll Telegram for new messages (20 s timeout)
  let updates;
  try {
    updates = await getUpdates(updateOffset, 20);
  } catch (err) {
    console.warn('[bridge] getUpdates error:', err.message);
    await new Promise(r => setTimeout(r, 5000));
    return;
  }

  for (const upd of updates) {
    updateOffset = upd.update_id + 1;
    const msg = upd.message;
    if (!msg?.text) continue;
    if (String(msg.chat.id) !== CHAT_ID) continue; // ignore other chats

    const text = msg.text.trim();
    if (!text.startsWith('/')) {
      await send('💡 Commands start with /. Send /help for a list.').catch(() => {});
      continue;
    }

    let reply;
    try {
      reply = await handleCommand(text);
    } catch (err) {
      reply = `⚠️ Error: ${escHtml(err.message)}`;
      console.error('[bridge] Command error:', err);
    }
    await send(reply).catch(e => console.warn('[bridge] send error:', e.message));
  }

  // Periodically poll Paperclip for changes
  if (Date.now() - lastPoll >= POLL_INTERVAL_SEC * 1000) {
    lastPoll = Date.now();
    await pollChanges().catch(e => console.warn('[bridge] poll error:', e.message));
  }
}

async function main() {
  await init();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick();
  }
}

main().catch(err => {
  console.error('[bridge] Fatal error:', err);
  process.exit(1);
});
