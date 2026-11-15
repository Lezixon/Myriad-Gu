import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slashCommands, normalParts } from '../src/index.js';
import { card, reminderCard, levelCard } from '../src/publicbot/cards.js';

test('public command surface is grouped and finite', () => {
  assert.equal(slashCommands.length, 21);
  assert.ok(slashCommands.every(command => command.name.length <= 32));
  assert.ok(slashCommands.some(command => command.name === 'help'));
  assert.ok(slashCommands.some(command => command.name === 'automation'));
  assert.ok(slashCommands.some(command => command.name === 'tunnel'));
  assert.ok(slashCommands.some(command => command.name === 'forms'));
  for (const command of slashCommands) {
    const rootOptions = command.toJSON().options || [];
    const subcommands = rootOptions.filter(option => option.type === 1);
    assert.equal(new Set(subcommands.map(option => option.name)).size, subcommands.length, `${command.name} has duplicate subcommands`);
    for (const subcommand of subcommands) {
      const options = subcommand.options || [];
      assert.equal(new Set(options.map(option => option.name)).size, options.length, `${command.name} ${subcommand.name} has duplicate options`);
    }
  }
});

test('rich cards are used for reminders and levels', () => {
  const reminder = reminderCard({ id: 'r1', title: 'Daily reset', reason: 'A useful notice', channelId: '1', at: Date.now() + 60000, enabled: true });
  const rank = levelCard({ user: { username: 'Member', displayName: 'Member', displayAvatarURL: () => 'https://cdn.example/avatar.png' }, level: 4, xp: 450, nextXp: 900, rank: 2, progress: 0.5, rewards: [] });
  assert.equal(reminder.data.title, 'Daily reset · Active');
  assert.equal(rank.data.title, 'Level 4 · Member');
  const mediaReminder = reminderCard({ title: 'With media', reason: 'Attached', channelId: '1', at: Date.now() + 60000, enabled: true, imageAsset: { name: 'custom.gif' } });
  assert.equal(mediaReminder.data.image.url, 'attachment://custom.gif');
  assert.ok(card('Simple acknowledgement', 'Done').data.description.includes('Done'));
});

test('custom media options are exposed only where cards use them', () => {
  const json = Object.fromEntries(slashCommands.map(command => [command.name, command.toJSON()]));
  const sub = (root, name) => json[root].options.find(option => option.name === name);
  assert.ok(sub('welcome', 'set').options.some(option => option.name === 'image' && option.type === 11));
  assert.ok(sub('levels', 'settings').options.some(option => option.name === 'background' && option.type === 11));
  assert.ok(sub('levels', 'settings').options.some(option => option.name === 'levelup_image' && option.type === 11));
  assert.ok(sub('reminders', 'create').options.some(option => option.name === 'thumbnail' && option.type === 11));
  assert.ok(sub('events', 'create').options.some(option => option.name === 'image' && option.type === 11));
  assert.ok(sub('giveaways', 'create').options.some(option => option.name === 'image' && option.type === 11));
  assert.ok(sub('automation', 'custom-add').options.some(option => option.name === 'image' && option.type === 11));
  assert.ok(sub('roles', 'panel').options.some(option => option.name === 'image' && option.type === 11));
  assert.ok(sub('roles', 'panel').options.some(option => option.name === 'footer' && option.type === 3));
  assert.ok(sub('forms', 'create').options.some(option => option.name === 'questions' && option.type === 3));
  assert.ok(sub('forms', 'submissions').options.some(option => option.name === 'id' && option.type === 3));
  assert.ok(sub('reminders', 'settings').options.some(option => option.name === 'staff_role' && option.type === 8));
  assert.ok(sub('reminders', 'settings').options.some(option => option.name === 'timezone' && option.type === 3));
  assert.ok(sub('reminders', 'settings').options.some(option => option.name === 'clear_staff_role' && option.type === 5));
  assert.ok(sub('reminders', 'create').options.some(option => option.name === 'delete_previous' && option.type === 5));
  assert.ok(sub('reminders', 'create').options.some(option => option.name === 'expires' && option.type === 3));
  assert.ok(sub('reminders', 'create').options.some(option => option.name === 'skip_days' && option.type === 3));
  assert.ok(sub('levels', 'settings').options.some(option => option.name === 'thread_xp' && option.type === 5));
  assert.ok(sub('levels', 'leaderboard').options.some(option => option.name === 'scope' && option.type === 3));
  assert.ok(sub('levels', 'settings').options.some(option => option.name === 'remove_no_xp_channel' && option.type === 5));
  assert.ok(sub('levels', 'settings').options.some(option => option.name === 'show_avatar' && option.type === 5));
  assert.ok(sub('levels', 'settings').options.some(option => option.name === 'levelup_image' && option.type === 11));
  assert.ok(sub('automation', 'custom-add').options.some(option => option.name === 'allowed_role' && option.type === 8));
  assert.ok(sub('tunnel', 'create').options.some(option => option.name === 'copy_emoji' && option.type === 5));
  assert.ok(sub('tunnel', 'link').options.some(option => option.name === 'copy_stickers' && option.type === 5));
  assert.ok(sub('automod', 'exempt-channel-remove').options.some(option => option.name === 'channel' && option.type === 7));
  assert.ok(sub('automod', 'exempt-role-remove').options.some(option => option.name === 'role' && option.type === 8));
  assert.ok(sub('server', 'unignore').options.some(option => option.name === 'channel' && option.type === 7));
  assert.ok(sub('social', 'poll-vote').options.some(option => option.name === 'choice' && option.type === 4));
  assert.ok(sub('social', 'suggestion-status').options.some(option => option.name === 'status' && option.type === 3));
  assert.ok(sub('social', 'suggestion-delete').options.some(option => option.name === 'id' && option.type === 3));
  assert.ok(sub('music', 'clear'));
  assert.ok(sub('music', 'shuffle'));
  assert.ok(sub('music', 'leave'));
  assert.ok(!json.media.options.some(option => option.name === 'owo'), 'OwO actions should remain normal-message interactions');
});

test('rank cards do not attach a member avatar unless explicitly enabled', () => {
  const user = { username: 'Member', displayName: 'Member', displayAvatarURL: () => 'https://cdn.example/avatar.png' };
  const withoutAvatar = levelCard({ user, level: 1, xp: 50, nextXp: 100, rank: 1, progress: 0.5, rewards: [] });
  const withAvatar = levelCard({ user, level: 1, xp: 50, nextXp: 100, rank: 1, progress: 0.5, rewards: [], showAvatar: true });
  assert.equal(withoutAvatar.data.thumbnail, undefined);
  assert.equal(withAvatar.data.thumbnail.url, 'https://cdn.example/avatar.png');
});

test('normal message commands parse correctly', () => {
  assert.equal(normalParts('!owo hug @member', '!'), null);
  assert.equal(normalParts('!react hug @member', '!'), null);
  assert.deepEqual(normalParts('react hug @member', '!'), { action: 'react', rest: 'hug @member' });
  assert.deepEqual(normalParts('!rank', '!'), { action: 'rank', rest: '' });
  assert.deepEqual(normalParts('react gif anime', '!'), { action: 'react', rest: 'gif anime' });
  assert.equal(normalParts('owo gif anime', '!'), null);
  assert.equal(normalParts('!unknown', '!'), null);
});

test('normal interactions require a member mention and honour ignored channels', () => {
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /Mention a member, for example: react kiss @member/);
  assert.match(source, /g\.settings\.ignoredChannels\?\.includes\(message\.channel\.id\)/);
});

test('retired public branding is absent from shipped source and pages', () => {
  const files = [
    'README.md', 'INSTALL.md', 'package.json', 'src/index.js', 'src/publicbot/store.js',
    'src/publicbot/cards.js', 'public/site/index.html', 'public/site/commands.html',
    'public/site/customisation.html', 'public/site/faq.html', 'public/site/getting-started.html',
    'public/site/status.html', 'scripts/termux-update.sh', 'termux/start.sh', 'termux/run-forever.sh'
  ];
  const retiredTerms = new RegExp([
    ['myr', 'iad'].join(''),
    ['myr', 'aid'].join(''),
    ['cult', 'ivation'].join(''),
    ['heaven', 'bound'].join(''),
    ['noct', 'is'].join('')
  ].join('|'), 'i');
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, retiredTerms, file);
  }
});

test('public interactions do not mutate messages seen by other listeners', () => {
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /const interactionConsumedMessages = new WeakSet\(\)/);
  assert.match(source, /const INTERACTION_ACTIONS = \[/);
  assert.doesNotMatch(source, /!react/);
  assert.match(source, /'kill'/);
  assert.doesNotMatch(source, /message\.content\s*=\s*`\$\{configuredPrefix\}__/);
  assert.doesNotMatch(source, /legacy.*!owo/i);
  assert.match(source, /Replying to the original message/);
  assert.match(source, /const sendTunnelPayload = async/);
  assert.match(source, /sendTunnelPayload\(channel,\{content:body/);
  assert.match(source, /a custom reaction/);
});

test('marriage profiles are private card-based records with custom media', () => {
  const json = Object.fromEntries(slashCommands.map(command => [command.name, command.toJSON()]));
  const social = json.social.options;
  for (const name of ['marriage-profile', 'marriage-profile-edit', 'marriage-profile-reset']) assert.ok(social.some(option => option.name === name));
  const edit = social.find(option => option.name === 'marriage-profile-edit');
  assert.ok(edit.options.some(option => option.name === 'image' && option.type === 11));
  assert.ok(edit.options.some(option => option.name === 'thumbnail' && option.type === 11));
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /const marriageStats =/);
  assert.match(source, /const recordMarriageChat =/);
  assert.match(source, /marriageCard\(/);
});

test('event and reminder controls expose the implemented scheduling features', () => {
  const json = Object.fromEntries(slashCommands.map(command => [command.name, command.toJSON()]));
  const sub = (root, name) => json[root].options.find(option => option.name === name);
  const eventCreate = sub('events', 'create').options;
  assert.ok(eventCreate.some(option => option.name === 'capacity' && option.type === 4));
  assert.ok(eventCreate.some(option => option.name === 'restricted_role' && option.type === 8));
  assert.ok(eventCreate.some(option => option.name === 'reminder_minutes' && option.type === 4));
  assert.ok(sub('moderation', 'untimeout').options.some(option => option.name === 'member' && option.type === 6));
  assert.ok(sub('events', 'create').options.some(option => option.name === 'clear_restricted_role' && option.type === 5));
  const reminderCreate = sub('reminders', 'create').options.find(option => option.name === 'repeat');
  assert.match(reminderCreate.description, /monthly/i);
  assert.match(reminderCreate.description, /yearly/i);
});

test('public interaction paths retain their card and option behaviour', () => {
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /deleteTrigger:i\.options\.getBoolean\('delete_trigger'\)/);
  assert.match(source, /allowedRoleId:i\.options\.getRole\('allowed_role'\)/);
  assert.match(source, /member\.roles\.remove\(role\)/);
  assert.match(source, /card\('Action unavailable'/);
  assert.match(source, /Server expressions export/);
  assert.match(source, /Level export/);
  assert.match(source, /n === 'reset' \? 0 : Math\.max\(0, r\.xp \+ i\.options\.getInteger\('amount', true\)\)/);
  assert.match(source, /if \(\/\^https\?:\\\/\\\/\\S\+\$\/i\.test\(query\)\) return query/);
  assert.match(source, /rolesWithDeletion[\s\S]*access\(i, PermissionFlagsBits\.ManageRoles\)/);
});
