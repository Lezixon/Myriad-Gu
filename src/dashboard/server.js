import 'dotenv/config';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import { PublicStore } from '../publicbot/store.js';

const PORT = Number(process.env.DASHBOARD_PORT || 3000);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const BOT_TOKEN = process.env.DISCORD_TOKEN || '';
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;
const DISCORD_API = 'https://discord.com/api/v10';
const SESSION_TTL = 8 * 60 * 60 * 1000;
const publicRoot = path.resolve('public');
const dashboardRoot = path.join(publicRoot, 'dashboard');
const store = new PublicStore(process.env.DATA_DIR || './data');
await store.load();

const sessions = new Map();
const oauthStates = new Map();

const MODULE_KEYS = {
  welcome: ['enabled', 'channelId', 'message'],
  goodbye: ['enabled', 'channelId', 'message'],
  levels: ['enabled', 'channelId', 'announce', 'xpMin', 'xpMax', 'cooldown', 'messageXp', 'voiceXp', 'reactionXp', 'perWord', 'threadXp', 'voiceTextXp', 'antiSpam', 'antiAfk', 'decay', 'prestige', 'rankCard', 'levelUp'],
  automod: ['enabled', 'links', 'spam', 'caps', 'mentions', 'words', 'exemptChannels', 'exemptRoles', 'logChannelId'],
  logs: ['enabled', 'channelId', 'events'],
  reminders: ['staffRoleId', 'timezone'],
  tickets: ['enabled', 'categoryId', 'staffRoleId', 'logChannelId', 'autoCloseHours'],
  music: ['djRoleId', 'volume', 'announce'],
  starboard: ['enabled', 'channelId', 'threshold', 'emoji'],
  autorole: ['enabled', 'roleId'],
  server: ['prefix', 'timezone']
};

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body);
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { location, ...headers });
  res.end();
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const index = x.indexOf('=');
    return [index < 0 ? x : x.slice(0, index), index < 0 ? '' : decodeURIComponent(x.slice(index + 1))];
  }));
}

function sessionFor(req) {
  const id = cookies(req).dashboard_sid;
  const session = id ? sessions.get(id) : null;
  if (!session || session.expiresAt < Date.now()) {
    if (id) sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  return session;
}

function requireSession(req, res) {
  const session = sessionFor(req);
  if (!session) {
    json(res, 401, { error: 'Sign in with Discord to continue.', authUrl: '/auth/discord' });
    return null;
  }
  return session;
}

function canManageGuild(session, guildId) {
  const guild = session.guilds.find(item => item.id === guildId);
  if (!guild) return false;
  const permissions = BigInt(guild.permissions || '0');
  return guild.owner || Boolean(permissions & 0x8n) || Boolean(permissions & 0x20n);
}

async function discord(pathname, options = {}) {
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    ...options,
    headers: { accept: 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(body?.message || `Discord API returned ${response.status}`);
  return body;
}

async function fetchBotGuilds() {
  if (!BOT_TOKEN) return new Set();
  try {
    const rows = await discord('/users/@me/guilds', { headers: { authorization: `Bot ${BOT_TOKEN}` } });
    return new Set(rows.map(row => row.id));
  } catch {
    return new Set();
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function publicGuildSettings(id) {
  const current = store.data.publicBot.guilds?.[id];
  return current?.settings || {};
}

async function guildPayload(id, session) {
  const selected = session.guilds.find(item => item.id === id);
  if (!selected) return null;
  const botGuildIds = await fetchBotGuilds();
  let remote = null;
  let channels = [];
  let roles = [];
  if (BOT_TOKEN && botGuildIds.has(id)) {
    remote = await discord(`/guilds/${id}?with_counts=true`, { headers: { authorization: `Bot ${BOT_TOKEN}` } }).catch(() => null);
    channels = await discord(`/guilds/${id}/channels`, { headers: { authorization: `Bot ${BOT_TOKEN}` } }).catch(() => []);
    roles = await discord(`/guilds/${id}/roles`, { headers: { authorization: `Bot ${BOT_TOKEN}` } }).catch(() => []);
  }
  const guildData = store.data.publicBot.guilds?.[id];
  return {
    id,
    name: remote?.name || selected.name,
    icon: remote?.icon || selected.icon || null,
    owner: Boolean(selected.owner),
    manageable: canManageGuild(session, id),
    botPresent: botGuildIds.has(id),
    memberCount: remote?.approximate_member_count || remote?.member_count || null,
    channels: channels.filter(channel => channel.type === 0 || channel.type === 4).map(channel => ({ id: channel.id, name: channel.name, type: channel.type })),
    roles: roles.filter(role => !role.managed).map(role => ({ id: role.id, name: role.name, color: role.color })),
    settings: publicGuildSettings(id),
    counts: {
      reminders: guildData?.reminders?.length || 0,
      tickets: guildData?.tickets?.length || 0,
      giveaways: guildData?.giveaways?.length || 0,
      events: guildData?.events?.length || 0,
      cases: guildData?.cases?.length || 0
    },
    lastChanges: (guildData?.audit || []).slice(0, 8).map(row => ({ event: row.event, detail: row.detail, at: row.at }))
  };
}

function cleanSettings(module, input) {
  const allowed = MODULE_KEYS[module];
  if (!allowed || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Unsupported dashboard module.');
  const output = {};
  for (const key of allowed) {
    if (!(key in input)) continue;
    const value = input[key];
    if (['message', 'timezone', 'prefix', 'emoji', 'logChannelId', 'channelId', 'staffRoleId', 'categoryId', 'djRoleId', 'roleId'].includes(key)) {
      if (typeof value !== 'string' || value.length > 2000) throw new Error(`Invalid ${key} value.`);
      output[key] = value;
    } else if (['enabled', 'announce', 'messageXp', 'voiceXp', 'reactionXp', 'perWord', 'threadXp', 'voiceTextXp', 'antiSpam', 'antiAfk', 'decay', 'prestige', 'links', 'spam', 'caps'].includes(key)) {
      output[key] = Boolean(value);
    } else if (['xpMin', 'xpMax', 'cooldown', 'mentions', 'volume', 'threshold', 'autoCloseHours'].includes(key)) {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || number > 100000) throw new Error(`Invalid ${key} value.`);
      output[key] = Math.round(number);
    } else if (['words', 'exemptChannels', 'exemptRoles', 'events'].includes(key)) {
      if (!Array.isArray(value) || value.length > 100) throw new Error(`Invalid ${key} list.`);
      output[key] = value.map(item => String(item).slice(0, 100));
    } else if (['rankCard', 'levelUp'].includes(key)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${key} settings.`);
      output[key] = structuredClone(value);
    }
  }
  return output;
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/session' && req.method === 'GET') {
    const session = sessionFor(req);
    if (!session) return json(res, 200, { authenticated: false, configured: Boolean(CLIENT_ID && CLIENT_SECRET), authUrl: '/auth/discord' });
    const botGuildIds = await fetchBotGuilds();
    return json(res, 200, {
      authenticated: true,
      clientId: CLIENT_ID,
      user: session.user,
      guilds: session.guilds.map(guild => ({ ...guild, botPresent: botGuildIds.has(guild.id), manageable: canManageGuild(session, guild.id) }))
    });
  }
  const session = requireSession(req, res);
  if (!session) return;
  const guildMatch = url.pathname.match(/^\/api\/guild\/([^/]+)(?:\/(settings))?$/);
  if (!guildMatch) return json(res, 404, { error: 'Dashboard route not found.' });
  const guildId = guildMatch[1];
  if (!canManageGuild(session, guildId)) return json(res, 403, { error: 'You do not have Manage Server permission in this server.' });
  if (req.method === 'GET') {
    const payload = await guildPayload(guildId, session);
    return payload ? json(res, 200, payload) : json(res, 404, { error: 'Server not found.' });
  }
  if (req.method === 'PATCH' && guildMatch[2] === 'settings') {
    const body = await readBody(req);
    const module = String(body.module || '');
    const changes = cleanSettings(module, body.settings);
    const guild = store.guild(guildId);
    guild.id = guildId;
    guild.settings[module] = { ...(guild.settings[module] || {}), ...changes };
    store.log(guild, 'dashboard.settings.updated', `${module} settings updated through the dashboard.`, session.user.id);
    await store.save();
    return json(res, 200, { ok: true, module, settings: guild.settings[module] });
  }
  return json(res, 405, { error: 'Method not allowed.' });
}

async function handleAuth(req, res, url) {
  if (url.pathname === '/auth/discord') {
    if (!CLIENT_ID || !CLIENT_SECRET) return json(res, 503, { error: 'Discord OAuth is not configured. Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI.' });
    const state = randomUUID();
    oauthStates.set(state, Date.now() + 10 * 60 * 1000);
    const oauth = new URL('https://discord.com/oauth2/authorize');
    oauth.searchParams.set('client_id', CLIENT_ID);
    oauth.searchParams.set('redirect_uri', REDIRECT_URI);
    oauth.searchParams.set('response_type', 'code');
    oauth.searchParams.set('scope', 'identify guilds');
    oauth.searchParams.set('state', state);
    return redirect(res, oauth.toString(), { 'set-cookie': `dashboard_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600` });
  }
  if (url.pathname === '/auth/callback') {
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!state || oauthStates.get(state) < Date.now() || cookies(req).dashboard_oauth_state !== state) return json(res, 400, { error: 'The sign-in session expired. Please try again.' });
    oauthStates.delete(state);
    if (!code) return json(res, 400, { error: 'Discord did not return an authorisation code.' });
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }) });
    if (!tokenResponse.ok) return json(res, 502, { error: 'Discord rejected the dashboard sign-in.' });
    const token = await tokenResponse.json();
    const [user, guilds] = await Promise.all([
      discord('/users/@me', { headers: { authorization: `Bearer ${token.access_token}` } }),
      discord('/users/@me/guilds', { headers: { authorization: `Bearer ${token.access_token}` } })
    ]);
    const id = randomUUID();
    sessions.set(id, { user: { id: user.id, username: user.username, globalName: user.global_name, avatar: user.avatar }, guilds, expiresAt: Date.now() + SESSION_TTL });
    return redirect(res, '/dashboard/', { 'set-cookie': `dashboard_sid=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}` });
  }
  if (url.pathname === '/auth/logout') return redirect(res, '/dashboard/', { 'set-cookie': 'dashboard_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  return false;
}

function mime(file) {
  return { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
}

async function staticFile(res, pathname) {
  const relative = pathname === '/' || pathname === '/dashboard' || pathname === '/dashboard/' ? 'dashboard/index.html' : pathname === '/docs' || pathname === '/docs/' ? 'site/index.html' : pathname.startsWith('/docs/') ? `site/${pathname.slice('/docs/'.length)}` : pathname.replace(/^\//, '');
  const file = path.resolve(publicRoot, relative);
  if (!file.startsWith(publicRoot) || !file.startsWith(dashboardRoot) && !file.startsWith(path.join(publicRoot, 'site'))) return json(res, 403, { error: 'Forbidden.' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime(file), 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    json(res, 404, { error: 'Page not found.' });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/auth/')) return await handleAuth(req, res, url);
    return await staticFile(res, url.pathname);
  } catch (error) {
    console.error('[Dashboard]', error);
    json(res, 500, { error: error.message || 'Dashboard request failed.' });
  }
});

server.listen(PORT, () => console.log(`Dashboard listening on http://localhost:${PORT}/dashboard/`));
