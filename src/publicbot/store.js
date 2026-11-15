import { mkdir, readFile, rename, copyFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_STATE = {
  publicBot: {
    guilds: {},
    users: {},
    reminders: {},
    jobs: {},
    tunnels: {},
    emoji: {},
    tickets: {},
    giveaways: {},
    feeds: {},
    music: {},
    audit: []
  }
};

function clone(value) {
  return structuredClone(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function ensureGuildShape(guild) {
  if (!isRecord(guild.settings)) guild.settings = {};
  const settings = guild.settings;
  settings.prefix ??= '!';
  settings.timezone ??= 'Europe/London';
  settings.welcome = { enabled: false, channelId: '', message: 'Welcome, {{user}}, to **{{server}}**.', ...(settings.welcome || {}) };
  settings.goodbye = { enabled: false, channelId: '', message: '{{user}} has left the server.', ...(settings.goodbye || {}) };
  settings.levels = { enabled: true, channelId: '', announce: false, xpMin: 8, xpMax: 18, cooldown: 60, messageXp: true, voiceXp: false, reactionXp: false, perWord: false, threadXp: true, voiceTextXp: false, antiSpam: true, voiceMinMembers: 2, antiAfk: true, decay: false, prestige: false, rankCard: {}, exclusions: { channels: [], roles: [] }, rewards: [], boosters: { roles: {}, channels: {} }, ...(settings.levels || {}) };
  settings.levels.rankCard = { showAvatar: false, ...(settings.levels.rankCard || {}) };
  settings.levels.levelUp = { message: 'Congratulations, {{user}} — you reached level {{level}}.', imageAsset: undefined, footer: '', ...(settings.levels.levelUp || {}) };
  settings.levels.exclusions = { channels: [], roles: [], ...(settings.levels.exclusions || {}) };
  if (!Array.isArray(settings.levels.rewards)) settings.levels.rewards = [];
  if (!Array.isArray(settings.levels.exclusions.channels)) settings.levels.exclusions.channels = [];
  if (!Array.isArray(settings.levels.exclusions.roles)) settings.levels.exclusions.roles = [];
  settings.levels.boosters = { roles: {}, channels: {}, ...(settings.levels.boosters || {}) };
  if (!isRecord(settings.levels.boosters.roles)) settings.levels.boosters.roles = {};
  if (!isRecord(settings.levels.boosters.channels)) settings.levels.boosters.channels = {};
  settings.automod = { enabled: false, links: false, spam: true, caps: false, mentions: 5, words: [], exemptChannels: [], exemptRoles: [], logChannelId: '', ...(settings.automod || {}) };
  if (!Array.isArray(settings.automod.words)) settings.automod.words = [];
  if (!Array.isArray(settings.automod.exemptChannels)) settings.automod.exemptChannels = [];
  if (!Array.isArray(settings.automod.exemptRoles)) settings.automod.exemptRoles = [];
  settings.starboard = { enabled: false, channelId: '', threshold: 3, emoji: '⭐', ...(settings.starboard || {}) };
  settings.reminders = { staffRoleId: '', timezone: settings.timezone || 'Europe/London', ...(settings.reminders || {}) };
  settings.tickets = { enabled: false, categoryId: '', staffRoleId: '', logChannelId: '', autoCloseHours: 0, ...(settings.tickets || {}) };
  settings.music = { djRoleId: '', volume: 100, announce: true, ...(settings.music || {}) };
  settings.autorole = { enabled: false, roleId: '', ...(settings.autorole || {}) };
  settings.feeds = Array.isArray(settings.feeds) ? settings.feeds : [];
  settings.commandRules = isRecord(settings.commandRules) ? settings.commandRules : {};
  for (const [name, rule] of Object.entries(settings.commandRules)) {
    if (!isRecord(rule)) { delete settings.commandRules[name]; continue; }
    for (const key of ['allowRoles', 'denyRoles', 'allowChannels', 'denyChannels']) {
      if (!Array.isArray(rule[key])) rule[key] = [];
    }
  }
  settings.logs = { enabled: false, channelId: '', events: [], ...(settings.logs || {}) };
  if (!Array.isArray(settings.logs.events)) settings.logs.events = [];
  if (!Array.isArray(settings.ignoredChannels)) settings.ignoredChannels = [];
  guild.xp = isRecord(guild.xp) ? Object.fromEntries(Object.entries(guild.xp).filter(([, entry]) => isRecord(entry))) : {};
  for (const key of ['warnings', 'cases', 'reminders', 'giveaways', 'tickets', 'rolePanels', 'autoresponders', 'autoMessages', 'feeds', 'audit', 'events', 'suggestions']) {
    if (!Array.isArray(guild[key])) guild[key] = [];
    guild[key] = guild[key].filter(item => isRecord(item));
  }
  guild.autoroles = Array.isArray(guild.autoroles) ? guild.autoroles.filter(roleId => typeof roleId === 'string') : [];
  guild.reminders = guild.reminders.filter(item => isRecord(item));
  guild.giveaways = guild.giveaways.filter(item => isRecord(item));
  if (Array.isArray(guild.polls)) guild.polls = Object.fromEntries(guild.polls.filter(item => isRecord(item) && item.id).map(item => [item.id, item]));
  guild.polls = isRecord(guild.polls) ? guild.polls : {};
  guild.customCommands = isRecord(guild.customCommands) ? guild.customCommands : {};
  for (const [name, command] of Object.entries(guild.customCommands)) if (!isRecord(command)) delete guild.customCommands[name];
  guild.starboard = isRecord(guild.starboard) ? guild.starboard : {};
  guild.counters = isRecord(guild.counters) ? guild.counters : {};
  guild.music = { queue: [], nowPlaying: null, lastQuery: '', loop: false, autoplay: false, twentyFourSeven: false, volume: 100, ...(isRecord(guild.music) ? guild.music : {}) };
  guild.relationships = isRecord(guild.relationships) ? guild.relationships : {};
  guild.marriageHistory = Array.isArray(guild.marriageHistory) ? guild.marriageHistory : [];
  guild.marriageProfiles = isRecord(guild.marriageProfiles) ? guild.marriageProfiles : {};
  guild.marriageChat = isRecord(guild.marriageChat) ? guild.marriageChat : {};
  guild.birthdays = isRecord(guild.birthdays) ? guild.birthdays : {};
  guild.tags = isRecord(guild.tags) ? guild.tags : {};
  guild.highlights = Array.isArray(guild.highlights) ? guild.highlights : [];
  guild.notes = isRecord(guild.notes) ? guild.notes : {};
  guild.forms = isRecord(guild.forms) ? guild.forms : {};
  for (const [id, form] of Object.entries(guild.forms)) {
    if (!isRecord(form)) { delete guild.forms[id]; continue; }
    form.questions = Array.isArray(form.questions) ? form.questions.filter(Boolean).map(question => String(question)) : [];
    form.submissions = Array.isArray(form.submissions) ? form.submissions.filter(item => isRecord(item)) : [];
  }
  guild.economy = isRecord(guild.economy) ? guild.economy : { quests: {}, shop: [], inventory: {} };
  guild.economy.quests = isRecord(guild.economy.quests) ? guild.economy.quests : {};
  guild.economy.inventory = isRecord(guild.economy.inventory) ? guild.economy.inventory : {};
  guild.economy.shop = Array.isArray(guild.economy.shop) ? guild.economy.shop.filter(item => isRecord(item) && item.id) : [];
  if (!guild.economy.shop.length && Array.isArray(guild.shop)) guild.economy.shop = guild.shop.filter(item => isRecord(item) && item.id);
  if (!guild.economy.shop.length) guild.economy.shop = [{ id: 'badge', name: 'Profile badge', price: 500 }, { id: 'boost', name: 'Server boost token', price: 1000 }];
  guild.shop = guild.economy.shop;
  return guild;
}

export class PublicStore {
  constructor(dir = process.env.DATA_DIR || './data') {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, 'state.json');
    this.data = clone(DEFAULT_STATE);
    this.loaded = false;
    this.saveTimer = null;
  }

  async load() {
    await mkdir(this.dir, { recursive: true });
    if (existsSync(this.file)) {
      try {
        const parsed = JSON.parse(await readFile(this.file, 'utf8'));
        const raw = isRecord(parsed) ? parsed : {};
        const publicBot = { ...clone(DEFAULT_STATE.publicBot), ...(isRecord(raw.publicBot) ? raw.publicBot : {}) };
        for (const key of ['guilds', 'users', 'reminders', 'jobs', 'tunnels', 'emoji', 'tickets', 'giveaways', 'feeds', 'music']) {
          if (!isRecord(publicBot[key])) publicBot[key] = {};
        }
        if (!Array.isArray(publicBot.audit)) publicBot.audit = [];
        this.data = { ...raw, publicBot };
      } catch (error) {
        const broken = `${this.file}.invalid-${Date.now()}`;
        await rename(this.file, broken).catch(() => {});
        console.error(`State file was invalid and was moved to ${path.basename(broken)}: ${error.message}`);
      }
    }
    this.loaded = true;
    return this.data;
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 250);
    this.saveTimer.unref?.();
  }

  async save() {
    await mkdir(this.dir, { recursive: true });
    const temp = `${this.file}.tmp-${process.pid}`;
    await import('node:fs/promises').then(fs => fs.writeFile(temp, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8'));
    await rename(temp, this.file);
  }

  async backup(label = 'manual') {
    await this.save();
    const backupDir = path.join(this.dir, 'backups');
    await mkdir(backupDir, { recursive: true });
    const destination = path.join(backupDir, `state-${label}-${new Date().toISOString().replaceAll(':', '-')}.json`);
    await copyFile(this.file, destination);
    return destination;
  }

  async pruneBackups(limit = 20) {
    const backupDir = path.join(this.dir, 'backups');
    if (!existsSync(backupDir)) return;
    const files = await readdir(backupDir);
    const rows = await Promise.all(files.filter(name => name.endsWith('.json')).map(async name => ({ name, time: (await stat(path.join(backupDir, name))).mtimeMs })));
    rows.sort((a, b) => b.time - a.time);
    for (const row of rows.slice(limit)) await import('node:fs/promises').then(fs => fs.unlink(path.join(backupDir, row.name)).catch(() => {}));
  }

  guild(guildId) {
    const root = this.data.publicBot.guilds;
    if (!isRecord(root[guildId])) root[guildId] = undefined;
    const guild = root[guildId] ||= {
      settings: {
        prefix: '!', timezone: 'Europe/London',
        welcome: { enabled: false, channelId: '', message: 'Welcome, {{user}}, to **{{server}}**.' },
        goodbye: { enabled: false, channelId: '', message: '{{user}} has left the server.' },
        levels: {
          enabled: true, channelId: '', announce: false, xpMin: 8, xpMax: 18, cooldown: 60,
          messageXp: true, voiceXp: false, reactionXp: false, perWord: false, antiSpam: true,
          voiceMinMembers: 2, antiAfk: true, decay: false, prestige: false,
          exclusions: { channels: [], roles: [] }, rewards: [], boosters: { roles: {}, channels: {} }, rankCard: { showAvatar: false }
        },
        automod: { enabled: false, links: false, spam: true, caps: false, mentions: 5, words: [], exemptChannels: [], exemptRoles: [], logChannelId: '' },
        logs: { enabled: false, channelId: '', events: [] },
        starboard: { enabled: false, channelId: '', threshold: 3, emoji: '⭐' },
        reminders: { staffRoleId: '', timezone: 'Europe/London' },
        tickets: { enabled: false, categoryId: '', staffRoleId: '', logChannelId: '', autoCloseHours: 0 },
        music: { djRoleId: '', volume: 100, announce: true },
        feeds: [],
        rolePanels: [],
        counters: [],
        customCommands: {},
        tags: {},
        autorole: { enabled: false, roleId: '' },
        levelRoles: [],
        afk: {},
        polls: {},
        eventSettings: {}, commandRules: {}
      },
      xp: {}, warnings: [], cases: [], reminders: [], giveaways: [], tickets: [], polls: {},
      rolePanels: [], customCommands: {}, autoresponders: [], autoMessages: [], feeds: [], audit: [], starboard: {},
      counters: {}, music: { queue: [], nowPlaying: null, lastQuery: '', loop: false, autoplay: false, twentyFourSeven: false, volume: 100 }, marriageProfiles: {}, marriageChat: {}, relationships: {}, marriageHistory: [],
      tags: {}, highlights: [], notes: {}, forms: {}, autoroles: [], economy: { quests: {}, shop: [], inventory: {} }
    };
    return ensureGuildShape(guild);
  }

  log(guild, event, detail, actorId = '') {
    const row = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now(), event, detail: String(detail).slice(0, 700), actorId };
    guild.audit.unshift(row);
    guild.audit = guild.audit.slice(0, 500);
    this.data.publicBot.audit.unshift({ guildId: guild.id, ...row });
    this.data.publicBot.audit = this.data.publicBot.audit.slice(0, 2000);
    this.scheduleSave();
    return row;
  }
}

export function ensureMap(root, key) {
  root[key] ||= {};
  return root[key];
}
