const state = { session: null, guild: null, view: 'overview' };
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const api = async (url, options) => {
  const response = await fetch(url, { headers: { 'content-type': 'application/json', ...(options?.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Dashboard request failed.');
  return body;
};
const notice = (message, kind = 'info') => { const node = $('#notice'); node.textContent = message; node.className = `notice ${kind}`; node.hidden = false; setTimeout(() => { node.hidden = true; }, 4500); };
const icon = (symbol, label) => `<span class="module-icon" aria-hidden="true">${symbol}</span><span>${label}</span>`;

function moduleCard(key, title, description, enabled, action = '') {
  return `<article class="module-card"><div class="module-head"><div class="module-title">${icon({moderation:'◈',automod:'✦',welcome:'⌂',levels:'↗',reminders:'◷',tickets:'□',music:'♪',logs:'≋',roles:'◇',server:'⚙'}[key] || '◆', title)}</div><span class="state ${enabled ? 'on' : ''}">${enabled ? 'Enabled' : 'Ready'}</span></div><p>${description}</p>${action ? `<button class="text-button" data-view="${action}">Configure <span>→</span></button>` : ''}</article>`;
}

function settingsCard(module, title, description, fields) {
  return `<article class="settings-card"><div class="settings-head"><div><p class="card-kicker">${module.toUpperCase()}</p><h2>${title}</h2><p>${description}</p></div><span class="state ${state.guild?.settings?.[module]?.enabled ? 'on' : ''}">${state.guild?.settings?.[module]?.enabled ? 'Enabled' : 'Off'}</span></div><form data-module="${module}" class="settings-form">${fields}<button class="button primary small" type="submit">Save changes</button></form></article>`;
}

function field(label, name, value, type = 'text', extra = '') {
  const checked = type === 'checkbox' && value ? ' checked' : '';
  if (type === 'checkbox') return `<label class="check-field"><input type="checkbox" name="${name}"${checked}><span>${label}</span></label>`;
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}></label>`;
}

function renderOverview() {
  const g = state.guild, s = g.settings || {};
  $('#pageTitle').textContent = 'Overview';
  $('#content').innerHTML = `
    <div class="welcome-row"><div><p class="eyebrow">CONTROL CENTRE</p><h2>${escapeHtml(g.name)}</h2><p class="muted">${g.botPresent ? 'The bot is installed and ready for configuration.' : 'The bot is not installed in this server yet.'}</p></div><a class="button primary" href="https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(state.session.clientId || '')}&scope=bot%20applications.commands&permissions=0" target="_blank" rel="noreferrer">Invite bot <span>↗</span></a></div>
    <div class="metrics"><div class="metric"><span>Members</span><strong>${g.memberCount ?? '—'}</strong><small>Approximate server size</small></div><div class="metric"><span>Reminders</span><strong>${g.counts.reminders}</strong><small>Saved schedules</small></div><div class="metric"><span>Open tickets</span><strong>${g.counts.tickets}</strong><small>Tracked support cases</small></div><div class="metric"><span>Moderation cases</span><strong>${g.counts.cases}</strong><small>Recorded actions</small></div></div>
    <div class="section-heading"><div><p class="eyebrow">MODULES</p><h2>Everything has a place.</h2></div><p class="muted">Select a module to configure its behaviour for this server.</p></div>
    <div class="module-grid">
      ${moduleCard('moderation','Moderation','Cases, warnings, timeouts and channel controls.',true,'moderation')}
      ${moduleCard('automod','Automod','Link, spam, caps, mention and word filters.',s.automod?.enabled,'moderation')}
      ${moduleCard('welcome','Welcome & goodbye','Onboarding messages, autoroles and departure notices.',s.welcome?.enabled,'community')}
      ${moduleCard('levels','Levels & rewards','XP, rank cards, announcements and reward roles.',s.levels?.enabled,'levels')}
      ${moduleCard('reminders','Reminders','Durable scheduled cards with staff access controls.',true,'reminders')}
      ${moduleCard('tickets','Tickets','Staff panels, transcripts and ticket workflow.',s.tickets?.enabled,'community')}
      ${moduleCard('music','Music','Queue, DJ controls and player preferences.',true,'media')}
      ${moduleCard('logs','Audit logs','Configurable event logging for staff review.',s.logs?.enabled,'security')}
    </div>
    <div class="section-heading compact"><div><p class="eyebrow">RECENT CHANGES</p><h2>Server activity</h2></div></div>
    <div class="activity-list">${g.lastChanges?.length ? g.lastChanges.map(row => `<div class="activity-row"><span class="activity-dot"></span><div><strong>${escapeHtml(row.event)}</strong><p>${escapeHtml(row.detail)}</p></div><time>${new Date(row.at).toLocaleString()}</time></div>`).join('') : '<p class="empty-state">No dashboard changes have been recorded yet.</p>'}</div>`;
}

function renderView() {
  const g = state.guild, s = g.settings || {};
  if (state.view === 'overview') return renderOverview();
  $('#pageTitle').textContent = { moderation: 'Moderation', community: 'Community', levels: 'Levels & rewards', reminders: 'Reminders', automation: 'Automation', media: 'Media & music', security: 'Permissions & logs' }[state.view] || 'Overview';
  if (state.view === 'moderation') {
    $('#content').innerHTML = `<div class="section-heading"><div><p class="eyebrow">SAFETY</p><h2>Protect the conversation.</h2></div><p class="muted">Configure safe defaults here. Detailed action history remains visible to authorised staff only.</p></div><div class="settings-stack">${settingsCard('automod','Automod controls','Tune filters without forcing them on every server.',field('Enable automod','enabled',s.automod?.enabled,'checkbox') + field('Block links','links',s.automod?.links,'checkbox') + field('Block spam','spam',s.automod?.spam,'checkbox') + field('Block excessive capitals','caps',s.automod?.caps,'checkbox') + field('Mention limit','mentions',s.automod?.mentions || 5,'number','min="1" max="50"') + field('Log channel ID','logChannelId',s.automod?.logChannelId || ''))}</div>`;
  } else if (state.view === 'community') {
    $('#content').innerHTML = `<div class="section-heading"><div><p class="eyebrow">COMMUNITY</p><h2>Shape the member experience.</h2></div><p class="muted">Welcome, ticket and role systems can be configured independently.</p></div><div class="settings-stack">${settingsCard('welcome','Welcome messages','Choose whether and where onboarding messages appear.',field('Enable welcome','enabled',s.welcome?.enabled,'checkbox') + field('Channel ID','channelId',s.welcome?.channelId || '') + field('Message','message',s.welcome?.message || '', 'text'))}${settingsCard('tickets','Ticket workflow','Set the staff role and category used by ticket panels.',field('Enable tickets','enabled',s.tickets?.enabled,'checkbox') + field('Category ID','categoryId',s.tickets?.categoryId || '') + field('Staff role ID','staffRoleId',s.tickets?.staffRoleId || '') + field('Transcript channel ID','logChannelId',s.tickets?.logChannelId || ''))}</div>`;
  } else if (state.view === 'levels') {
    $('#content').innerHTML = `<div class="section-heading"><div><p class="eyebrow">PROGRESSION</p><h2>Make participation matter.</h2></div><p class="muted">Rank cards remain optional and never attach a member portrait unless enabled.</p></div><div class="settings-stack">${settingsCard('levels','XP and rank cards','Control the pace, announcement channel and reward experience.',field('Enable message XP','messageXp',s.levels?.messageXp ?? true,'checkbox') + field('Announce level-ups','announce',s.levels?.announce,'checkbox') + field('Announcement channel ID','channelId',s.levels?.channelId || '') + field('Minimum XP','xpMin',s.levels?.xpMin || 8,'number','min="0" max="1000"') + field('Maximum XP','xpMax',s.levels?.xpMax || 18,'number','min="0" max="1000"') + field('Cooldown seconds','cooldown',s.levels?.cooldown || 60,'number','min="5" max="3600"'))}</div>`;
  } else if (state.view === 'reminders') {
    $('#content').innerHTML = `<div class="section-heading"><div><p class="eyebrow">SCHEDULES</p><h2>Keep important moments visible.</h2></div><p class="muted">Create and manage card-based reminders in Discord; this panel controls access and timezone defaults.</p></div><div class="settings-stack">${settingsCard('reminders','Reminder access','Allow a selected staff role to manage reminders without granting Manage Server.',field('Staff role ID','staffRoleId',s.reminders?.staffRoleId || '') + field('Timezone','timezone',s.reminders?.timezone || s.timezone || 'Europe/London'))}</div><div class="info-panel"><strong>${g.counts.reminders} saved reminders</strong><p>Use <code>/reminders list</code> in Discord for the full card-based reminder list and controls.</p></div>`;
  } else if (state.view === 'automation') {
    $('#content').innerHTML = `<div class="section-heading"><div><p class="eyebrow">WORKFLOWS</p><h2>Make repetitive work disappear.</h2></div><p class="muted">Automation stays explicit, permission-checked and scoped to this server.</p></div><div class="module-grid">${moduleCard('server','Server rules','Set prefix, timezone, ignored channels and command rules.',true)}${moduleCard('roles','Role panels','Build member-facing role menus from Discord.',false)}${moduleCard('welcome','Feeds & forms','Publish controlled cards for feeds, forms and suggestions.',false)}</div>`;
  } else if (state.view === 'media') {
    $('#content').innerHTML = `<div class="section-heading"><div><p class="eyebrow">MEDIA</p><h2>Give members a clean media layer.</h2></div><p class="muted">GIFs, images, music, custom emoji and linked channels remain optional features.</p></div><div class="settings-stack">${settingsCard('music','Music controls','Set the DJ role, default volume and announcement behaviour.',field('DJ role ID','djRoleId',s.music?.djRoleId || '') + field('Default volume','volume',s.music?.volume ?? 100,'number','min="0" max="200"') + field('Announce player changes','announce',s.music?.announce ?? true,'checkbox'))}</div>`;
  } else {
    $('#content').innerHTML = `<div class="section-heading"><div><p class="eyebrow">CONTROL</p><h2>Keep access intentional.</h2></div><p class="muted">Server configuration belongs to authorised staff; member-facing commands remain governed by Discord permissions and your server rules.</p></div><div class="settings-stack">${settingsCard('logs','Audit logging','Choose where staff-facing events are recorded.',field('Enable logs','enabled',s.logs?.enabled,'checkbox') + field('Log channel ID','channelId',s.logs?.channelId || '') + field('Events (comma-separated)','events',(s.logs?.events || []).join(', ')))}${settingsCard('server','Server defaults','Set the prefix and timezone used by server utilities.',field('Prefix','prefix',s.prefix || '!','text','maxlength="3"') + field('Timezone','timezone',s.timezone || 'Europe/London'))}</div>`;
  }
  document.querySelectorAll('[data-view]').forEach(node => node.addEventListener('click', () => { state.view = node.dataset.view; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === state.view)); renderView(); }));
  document.querySelectorAll('form[data-module]').forEach(form => form.addEventListener('submit', saveSettings));
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget, settings = {};
  for (const input of form.elements) {
    if (!input.name) continue;
    if (input.type === 'checkbox') settings[input.name] = input.checked;
    else if (input.name === 'events') settings[input.name] = input.value.split(',').map(item => item.trim()).filter(Boolean);
    else if (input.type === 'number') settings[input.name] = Number(input.value);
    else settings[input.name] = input.value;
  }
  try {
    await api(`/api/guild/${state.guild.id}/settings`, { method: 'PATCH', body: JSON.stringify({ module: form.dataset.module, settings }) });
    state.guild = await api(`/api/guild/${state.guild.id}`);
    notice('Settings saved for this server.', 'success');
    renderView();
  } catch (error) { notice(error.message, 'error'); }
}

async function selectGuild(id) {
  try {
    state.guild = await api(`/api/guild/${id}`);
    $('#botStatus').textContent = state.guild.botPresent ? 'Bot connected' : 'Bot not installed';
    $('#botStatus').className = `status-chip ${state.guild.botPresent ? 'online' : 'offline'}`;
    renderView();
  } catch (error) { notice(error.message, 'error'); }
}

async function start() {
  const session = await api('/api/session');
  if (!session.authenticated) {
    $('#loginView').hidden = false;
    if (!session.configured) { $('#loginButton').textContent = 'OAuth setup required'; $('#loginButton').removeAttribute('href'); $('#loginButton').classList.add('disabled'); $('#loginError').textContent = 'The dashboard needs Discord OAuth credentials before sign-in can be enabled.'; $('#loginError').hidden = false; }
    return;
  }
  state.session = session;
  $('#app').hidden = false;
  const selectable = session.guilds.filter(guild => guild.manageable);
  $('#guildSelect').innerHTML = selectable.length ? selectable.map(guild => `<option value="${guild.id}">${escapeHtml(guild.name)}${guild.botPresent ? '' : ' · not installed'}</option>`).join('') : '<option>No manageable servers found</option>';
  if (selectable.length) await selectGuild(selectable[0].id);
  else { $('#pageTitle').textContent = 'No manageable servers'; $('#content').innerHTML = '<div class="empty-state large">Sign in with an account that has Manage Server or Administrator permission in at least one server.</div>'; }
}

$('#guildSelect').addEventListener('change', event => selectGuild(event.target.value));
document.querySelectorAll('.nav-item').forEach(node => node.addEventListener('click', () => { state.view = node.dataset.view; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === node)); renderView(); }));
start().catch(error => { $('#loginView').hidden = false; $('#loginError').textContent = error.message; $('#loginError').hidden = false; });
