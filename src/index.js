import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, PermissionFlagsBits, ChannelType, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import play from 'play-dl';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { PublicStore } from './publicbot/store.js';
import { COLOURS, card, replyCard, levelCard, renderLevelCard, reminderCard, giveawayCard, eventCard, marriageCard, nowPlayingCard, clean, safeMentionText } from './publicbot/cards.js';
import { saveAttachment, fileForAsset, embedAssetUrl } from './publicbot/assets.js';

const token = process.env.DISCORD_TOKEN;
if (!token && process.env.COMMAND_ONLY !== '1') { console.error('Set DISCORD_TOKEN in .env.'); process.exit(1); }
export const store = new PublicStore(process.env.DATA_DIR || './data');
export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildEmojisAndStickers], partials: [Partials.Message, Partials.Channel] });
client.setMaxListeners(32);
process.on('unhandledRejection', error => console.error('[Discord Bot] unhandled asynchronous error:', error?.message || error));
const assetDir = path.resolve(process.env.DATA_DIR || './data', 'assets');
const uploadedAsset = async (attachment, prefix) => attachment ? saveAttachment(attachment, assetDir, prefix) : undefined;
const assetOnDisk = asset => asset?.name ? { ...asset, path: existsSync(asset.path || '') ? asset.path : path.join(assetDir, asset.name) } : asset;
const assetFiles = (...assets) => assets.map(assetOnDisk).map(fileForAsset).filter(Boolean);
const spamWindows = new Map();
const musicSessions = new Map();

const categories = {
  moderation: ['warn','warnings','cases','modlogs','kick','ban','softban','unban','timeout','untimeout','purge','slowmode','lock','unlock'], automod: ['status','enable','disable','links','spam','caps','mentions','word','unword','exempt-channel','exempt-channel-remove','exempt-role','exempt-role-remove'],
  server: ['info','permissions','audit','backup','prefix','ignore','unignore','command-rule','command-rules','command-reset','logs'], welcome: ['status','set','disable','autorole','autorole-clear','test'], roles: ['panel','add','remove','list','clear','autorole','autorole-clear'],
  levels: ['rank','leaderboard','settings','reward-add','reward-remove','rewards','xp','reset','voice','export'], reminders: ['create','list','edit','delete','pause','resume','duplicate','pause-all','resume-all','settings'],
  events: ['create','list','edit','rsvp','cancel','announce','attendee-role'], giveaways: ['create','enter','list','status','end','reroll'], economy: ['balance','daily','pay','leaderboard','shop','buy','quest','checklist','roll','choose','coinflip','slots','blackjack'],
  music: ['play','queue','skip','pause','resume','stop','clear','shuffle','leave','volume','now','lyrics','loop','autoplay','247','settings'], tickets: ['panel','open','claim','close','reopen','transcript','add','remove','rename','priority','settings'],
  social: ['afk','birthday','suggest','suggestions','suggestion-status','suggestion-delete','poll','poll-vote','starboard','marriage','marriage-accept','marriage-decline','marriage-divorce','marriage-status','marriage-history','marriage-relationship','marriage-profile','marriage-profile-edit','marriage-profile-reset'],
  media: ['gif','image','translate','meme'], emoji: ['info','copy','sticker-copy','list','export','snipe'], tunnel: ['create','link','view','close','privacy'],
  feeds: ['add','list','remove','test'], forms: ['create','publish','list','delete'], automation: ['custom-add','custom-remove','custom-list','autoresponder-add','autoresponder-remove','autoresponder-list','auto-message','auto-message-remove','tag-add','tag-remove','tag-list'], utility: ['ping','userinfo','avatar','serverinfo','channelinfo','roleinfo','invite','botinfo']
};
categories.forms.push('submissions');
const rootText = { moderation:'Moderation and channel actions', automod:'Automated safety rules', server:'Server settings and diagnostics', welcome:'Welcome and onboarding', roles:'Role panels', levels:'XP and rank cards', reminders:'Scheduled reminder cards', events:'Events and RSVP', giveaways:'Giveaways', economy:'Public economy', music:'Music queue', tickets:'Support tickets', social:'Community tools and consent-based relationships', media:'GIF and normal-message interactions', emoji:'Emoji and sticker tools', tunnel:'Cross-server channel bridges', feeds:'Social feed notifications', forms:'Card-based forms and submissions', automation:'Custom commands and automations', utility:'Public utilities' };
function root(name, description) { return new SlashCommandBuilder().setName(name).setDescription(description).setDMPermission(false); }
function user(s, required = false) { return s.addUserOption(o => o.setName('member').setDescription('Member').setRequired(required)); }
function reason(s) { return s.addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500)); }
function addSubs(command, list, fn) { for (const [name, description] of list) command.addSubcommand(s => { s.setName(name).setDescription(description); fn?.(s, name); return s; }); return command; }
export const slashCommands = [
  root('help','Browse grouped public commands').addStringOption(o=>o.setName('category').setDescription('Category').setAutocomplete(true)),
  addSubs(root('moderation',rootText.moderation), categories.moderation.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{ if(['warn','warnings','kick','ban','softban','timeout','untimeout'].includes(n)) user(s,n==='warn'||n==='warnings'||n==='kick'||n==='ban'||n==='softban'||n==='timeout'||n==='untimeout'); if(['warn','kick','ban','softban','timeout'].includes(n)) reason(s); if(n==='purge') s.addIntegerOption(o=>o.setName('count').setDescription('Messages').setMinValue(1).setMaxValue(100).setRequired(true)); if(n==='unban') s.addStringOption(o=>o.setName('user_id').setDescription('Discord ID').setRequired(true)); if(['timeout','ban','softban'].includes(n)) s.addIntegerOption(o=>o.setName('minutes').setDescription('Duration').setMinValue(1).setMaxValue(40320)); if(n==='slowmode') s.addIntegerOption(o=>o.setName('seconds').setDescription('Seconds').setMinValue(0).setMaxValue(21600).setRequired(true)); }),
  addSubs(root('automod',rootText.automod), categories.automod.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{ if(['word','unword'].includes(n)) s.addStringOption(o=>o.setName('value').setDescription('Word or phrase').setRequired(true)); if(n.startsWith('exempt-channel')) s.addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true)); if(n.startsWith('exempt-role')) s.addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)); if(n==='mentions') s.addIntegerOption(o=>o.setName('limit').setDescription('Maximum mentions per message').setMinValue(1).setMaxValue(50).setRequired(true)); }),
  addSubs(root('server',rootText.server), categories.server.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{ if(n==='prefix') s.addStringOption(o=>o.setName('value').setDescription('Prefix').setMinLength(1).setMaxLength(3).setRequired(true)); if(['ignore','unignore'].includes(n)) s.addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true)); if(n==='command-rule'){s.addStringOption(o=>o.setName('command').setDescription('Root command, for example reminders').setRequired(true));s.addRoleOption(o=>o.setName('role').setDescription('Role to allow or deny'));s.addChannelOption(o=>o.setName('channel').setDescription('Channel to allow or deny'));s.addBooleanOption(o=>o.setName('allow').setDescription('Allow this role or channel'));} if(['command-rules','command-reset'].includes(n))s.addStringOption(o=>o.setName('command').setDescription('Root command, or leave empty for all rules').setRequired(n==='command-reset')); if(n==='logs'){s.addChannelOption(o=>o.setName('channel').setDescription('Log destination'));s.addStringOption(o=>o.setName('events').setDescription('Comma-separated events, or all'));s.addBooleanOption(o=>o.setName('enabled').setDescription('Enable event logging'));} }),
  addSubs(root('welcome',rootText.welcome), categories.welcome.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{ if(['set','disable','test'].includes(n)) s.addStringOption(o=>o.setName('kind').setDescription('welcome or goodbye').addChoices({name:'Welcome',value:'welcome'},{name:'Goodbye',value:'goodbye'}).setRequired(true)); if(n==='set'){s.addChannelOption(o=>o.setName('channel').setDescription('Destination').setRequired(true));s.addStringOption(o=>o.setName('message').setDescription('Message').setMaxLength(1800).setRequired(true));s.addStringOption(o=>o.setName('title').setDescription('Optional card title'));s.addStringOption(o=>o.setName('color').setDescription('Hex colour'));s.addStringOption(o=>o.setName('footer').setDescription('Optional footer'));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional card image'));s.addAttachmentOption(o=>o.setName('thumbnail').setDescription('Optional card thumbnail'));s.addBooleanOption(o=>o.setName('timestamp').setDescription('Show the Discord timestamp'));s.addBooleanOption(o=>o.setName('dm').setDescription('Also send a direct message'));s.addBooleanOption(o=>o.setName('remove_image').setDescription('Remove the saved image'));s.addBooleanOption(o=>o.setName('remove_thumbnail').setDescription('Remove the saved thumbnail'));} if(['autorole','autorole-clear'].includes(n))s.addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(n==='autorole')); }),
  addSubs(root('roles',rootText.roles), categories.roles.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{ if(n==='panel'){s.addChannelOption(o=>o.setName('channel').setDescription('Destination').setRequired(true));s.addStringOption(o=>o.setName('title').setDescription('Title').setRequired(true));s.addStringOption(o=>o.setName('description').setDescription('Description').setRequired(true));s.addStringOption(o=>o.setName('footer').setDescription('Optional footer'));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional card image'));s.addAttachmentOption(o=>o.setName('thumbnail').setDescription('Optional card thumbnail'));} if(['add','remove'].includes(n)){s.addStringOption(o=>o.setName('panel_id').setDescription('Panel ID').setRequired(true));s.addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true));} if(n==='clear')s.addStringOption(o=>o.setName('panel_id').setDescription('Panel ID').setRequired(true)); if(n==='autorole')s.addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)); }),
  addSubs(root('levels',rootText.levels), categories.levels.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{ if(['rank','xp','reset'].includes(n))user(s); if(n==='leaderboard')s.addStringOption(o=>o.setName('scope').setDescription('Ranking to display').addChoices({name:'All XP',value:'all'},{name:'This week',value:'weekly'},{name:'Voice XP',value:'voice'},{name:'Reaction XP',value:'reactions'})); if(n==='xp')s.addIntegerOption(o=>o.setName('amount').setDescription('XP').setMinValue(-1000000).setMaxValue(1000000).setRequired(true)); if(['reward-add','reward-remove'].includes(n)){s.addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true));s.addIntegerOption(o=>o.setName('level').setDescription('Level').setMinValue(1).setMaxValue(1000).setRequired(true));} if(n==='settings'){s.addBooleanOption(o=>o.setName('enabled').setDescription('Message XP'));s.addIntegerOption(o=>o.setName('cooldown').setDescription('Cooldown seconds').setMinValue(5).setMaxValue(3600));s.addIntegerOption(o=>o.setName('minimum_xp').setDescription('Minimum XP per message').setMinValue(0).setMaxValue(1000));s.addIntegerOption(o=>o.setName('maximum_xp').setDescription('Maximum XP per message').setMinValue(0).setMaxValue(1000));s.addBooleanOption(o=>o.setName('announcements').setDescription('Level-up cards'));s.addChannelOption(o=>o.setName('channel').setDescription('Announcement channel'));s.addBooleanOption(o=>o.setName('reactions').setDescription('Award XP for reactions'));s.addBooleanOption(o=>o.setName('per_word').setDescription('Award XP per valid word'));s.addBooleanOption(o=>o.setName('thread_xp').setDescription('Allow XP in threads'));s.addBooleanOption(o=>o.setName('voice_text_xp').setDescription('Allow XP in voice text channels'));s.addChannelOption(o=>o.setName('no_xp_channel').setDescription('Add a channel to the XP blacklist'));s.addRoleOption(o=>o.setName('no_xp_role').setDescription('Add a role to the XP blacklist'));s.addBooleanOption(o=>o.setName('remove_no_xp_channel').setDescription('Clear the entire XP channel blacklist'));s.addBooleanOption(o=>o.setName('remove_no_xp_role').setDescription('Clear the entire XP role blacklist'));s.addAttachmentOption(o=>o.setName('background').setDescription('Optional rank-card background'));s.addBooleanOption(o=>o.setName('remove_background').setDescription('Remove the rank-card background'));s.addStringOption(o=>o.setName('accent').setDescription('Rank-card accent hex colour'));s.addBooleanOption(o=>o.setName('show_avatar').setDescription('Show the member avatar on the rank card'));s.addAttachmentOption(o=>o.setName('levelup_image').setDescription('Optional level-up image'));s.addBooleanOption(o=>o.setName('remove_levelup_image').setDescription('Remove the level-up image'));s.addStringOption(o=>o.setName('levelup_message').setDescription('Optional level-up message'));s.addStringOption(o=>o.setName('levelup_footer').setDescription('Optional level-up footer'));} if(n==='voice'){s.addBooleanOption(o=>o.setName('enabled').setDescription('Voice XP'));s.addIntegerOption(o=>o.setName('minimum_members').setDescription('Minimum active members').setMinValue(1).setMaxValue(99));} }),
  addSubs(root('reminders',rootText.reminders), categories.reminders.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{ if(['edit','delete','pause','resume','duplicate'].includes(n))s.addStringOption(o=>o.setName('id').setDescription('Reminder ID').setRequired(true)); if(n==='list')s.addIntegerOption(o=>o.setName('page').setDescription('Page number').setMinValue(1).setMaxValue(100)); if(['create','edit'].includes(n)){s.addChannelOption(o=>o.setName('channel').setDescription('Channel'));s.addStringOption(o=>o.setName('time').setDescription('ISO time, 3pm, or 2h 30m').setRequired(n==='create'));s.addStringOption(o=>o.setName('repeat').setDescription('once, hourly, daily, weekly, monthly, yearly or a duration such as 2h'));s.addStringOption(o=>o.setName('title').setDescription('Title'));s.addStringOption(o=>o.setName('message').setDescription('Description'));s.addRoleOption(o=>o.setName('role').setDescription('Optional role ping'));for(let p=1;p<=4;p++)s.addMentionableOption(o=>o.setName(`ping_${p}`).setDescription(`Optional user or role ping ${p}`));s.addStringOption(o=>o.setName('color').setDescription('Hex colour'));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional card image'));s.addAttachmentOption(o=>o.setName('thumbnail').setDescription('Optional card thumbnail'));s.addStringOption(o=>o.setName('footer').setDescription('Optional footer'));s.addBooleanOption(o=>o.setName('timestamp').setDescription('Show the Discord timestamp'));s.addStringOption(o=>o.setName('expires').setDescription('Optional end time'));s.addStringOption(o=>o.setName('skip_days').setDescription('Up to three weekdays to skip'));s.addBooleanOption(o=>o.setName('delete_previous').setDescription('Delete the previous card when the next one is sent'));s.addBooleanOption(o=>o.setName('clear_pings').setDescription('Remove existing pings when editing'));s.addBooleanOption(o=>o.setName('remove_image').setDescription('Remove the saved image'));s.addBooleanOption(o=>o.setName('remove_thumbnail').setDescription('Remove the saved thumbnail'));}if(n==='settings'){s.addRoleOption(o=>o.setName('staff_role').setDescription('Optional role allowed to manage reminders'));s.addBooleanOption(o=>o.setName('clear_staff_role').setDescription('Remove the configured reminder staff role'));s.addStringOption(o=>o.setName('timezone').setDescription('IANA timezone such as Europe/London'));}}),
  addSubs(root('events',rootText.events), categories.events.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{ if(['edit','rsvp','cancel','announce','attendee-role'].includes(n))s.addStringOption(o=>o.setName('id').setDescription('Event ID').setRequired(true)); if(['create','edit'].includes(n)){s.addStringOption(o=>o.setName('title').setDescription('Title'));s.addStringOption(o=>o.setName('time').setDescription('ISO time or duration').setRequired(n==='create'));s.addStringOption(o=>o.setName('description').setDescription('Description'));s.addStringOption(o=>o.setName('color').setDescription('Hex colour'));s.addStringOption(o=>o.setName('footer').setDescription('Optional footer'));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional card image'));s.addAttachmentOption(o=>o.setName('thumbnail').setDescription('Optional card thumbnail'));s.addBooleanOption(o=>o.setName('timestamp').setDescription('Show a timestamp'));s.addIntegerOption(o=>o.setName('capacity').setDescription('Maximum attendees; zero means unlimited').setMinValue(0).setMaxValue(100000));s.addRoleOption(o=>o.setName('restricted_role').setDescription('Role required to RSVP'));s.addBooleanOption(o=>o.setName('clear_restricted_role').setDescription('Remove the RSVP role restriction'));s.addIntegerOption(o=>o.setName('reminder_minutes').setDescription('Minutes before the event to remind attendees').setMinValue(0).setMaxValue(10080));s.addBooleanOption(o=>o.setName('remove_image').setDescription('Remove the saved image'));s.addBooleanOption(o=>o.setName('remove_thumbnail').setDescription('Remove the saved thumbnail'));} if(n==='attendee-role')s.addRoleOption(o=>o.setName('role').setDescription('Role granted to attendees')); }),
  addSubs(root('giveaways',rootText.giveaways), categories.giveaways.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{ if(['enter','status','end','reroll'].includes(n))s.addStringOption(o=>o.setName('id').setDescription('Giveaway ID').setRequired(true)); if(n==='create'){s.addStringOption(o=>o.setName('prize').setDescription('Prize').setRequired(true));s.addStringOption(o=>o.setName('description').setDescription('Optional giveaway description').setMaxLength(1800));s.addIntegerOption(o=>o.setName('minutes').setDescription('Minutes').setMinValue(1).setMaxValue(10080).setRequired(true));s.addIntegerOption(o=>o.setName('winners').setDescription('Winners').setMinValue(1).setMaxValue(20));s.addRoleOption(o=>o.setName('required_role').setDescription('Optional role required to enter'));s.addRoleOption(o=>o.setName('blocked_role').setDescription('Optional role blocked from entering'));s.addStringOption(o=>o.setName('requirement').setDescription('Optional entry note'));s.addIntegerOption(o=>o.setName('minimum_level').setDescription('Minimum server level').setMinValue(0).setMaxValue(1000));s.addRoleOption(o=>o.setName('winner_role').setDescription('Role granted to winners'));s.addRoleOption(o=>o.setName('bonus_role').setDescription('Role receiving bonus entries'));s.addIntegerOption(o=>o.setName('bonus_entries').setDescription('Extra entries for the bonus role').setMinValue(1).setMaxValue(10));s.addIntegerOption(o=>o.setName('max_entries').setDescription('Maximum entries per member').setMinValue(1).setMaxValue(20));s.addIntegerOption(o=>o.setName('account_age_days').setDescription('Minimum Discord account age in days').setMinValue(0).setMaxValue(3650));s.addIntegerOption(o=>o.setName('server_age_days').setDescription('Minimum membership age in days').setMinValue(0).setMaxValue(3650));s.addRoleOption(o=>o.setName('ping_role').setDescription('Role pinged when the giveaway ends'));s.addBooleanOption(o=>o.setName('dm_winners').setDescription('Attempt to DM winners'));s.addBooleanOption(o=>o.setName('hide_requirements').setDescription('Hide detailed requirements from the public card'));s.addStringOption(o=>o.setName('color').setDescription('Hex colour'));s.addStringOption(o=>o.setName('footer').setDescription('Optional footer'));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional card image'));s.addAttachmentOption(o=>o.setName('thumbnail').setDescription('Optional card thumbnail'));} }),
  addSubs(root('economy',rootText.economy), categories.economy.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(n==='pay'){user(s,true);s.addIntegerOption(o=>o.setName('amount').setDescription('Amount').setMinValue(1).setRequired(true));}if(n==='buy')s.addStringOption(o=>o.setName('item').setDescription('Item ID').setRequired(true));if(['choose','coinflip'].includes(n))s.addStringOption(o=>o.setName('choice').setDescription('Your choice').setRequired(true));if(n==='roll')s.addIntegerOption(o=>o.setName('sides').setDescription('Number of sides').setMinValue(2).setMaxValue(100).setRequired(true));if(['slots','blackjack'].includes(n))s.addIntegerOption(o=>o.setName('stake').setDescription('Coins to stake').setMinValue(1).setMaxValue(10000).setRequired(true));}),
  addSubs(root('music',rootText.music), categories.music.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(n==='play')s.addStringOption(o=>o.setName('query').setDescription('URL or search').setRequired(true));if(n==='volume')s.addIntegerOption(o=>o.setName('value').setDescription('0–200').setMinValue(0).setMaxValue(200).setRequired(true));if(n==='settings'){s.addRoleOption(o=>o.setName('dj_role').setDescription('DJ role'));s.addBooleanOption(o=>o.setName('clear_dj').setDescription('Remove the configured DJ role'));}if(['loop','autoplay','247'].includes(n))s.addBooleanOption(o=>o.setName('enabled').setDescription('Enable this player setting'));}),
  addSubs(root('tickets',rootText.tickets), categories.tickets.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(n==='panel'){s.addChannelOption(o=>o.setName('channel').setDescription('Panel channel').setRequired(true));s.addStringOption(o=>o.setName('title').setDescription('Title').setRequired(true));s.addStringOption(o=>o.setName('description').setDescription('Description').setRequired(true));s.addStringOption(o=>o.setName('footer').setDescription('Optional footer'));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional card image'));s.addAttachmentOption(o=>o.setName('thumbnail').setDescription('Optional card thumbnail'));}if(n==='settings'){s.addRoleOption(o=>o.setName('staff_role').setDescription('Staff role'));s.addChannelOption(o=>o.setName('category').setDescription('Ticket category'));}if(['add','remove'].includes(n))user(s,true);if(n==='rename')s.addStringOption(o=>o.setName('name').setDescription('New channel name').setRequired(true));if(n==='priority')s.addBooleanOption(o=>o.setName('enabled').setDescription('Mark this ticket as priority').setRequired(true));}),
  addSubs(root('social',rootText.social), categories.social.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(n==='afk')s.addStringOption(o=>o.setName('message').setDescription('AFK note'));if(n==='birthday'){s.addStringOption(o=>o.setName('date').setDescription('DD/MM').setRequired(true));s.addChannelOption(o=>o.setName('channel').setDescription('Optional birthday announcement channel'));}if(n==='suggest'){s.addStringOption(o=>o.setName('idea').setDescription('Suggestion').setRequired(true));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional suggestion image'));}if(n==='suggestion-status'){s.addStringOption(o=>o.setName('id').setDescription('Suggestion ID').setRequired(true));s.addStringOption(o=>o.setName('status').setDescription('Review status').addChoices({name:'Pending',value:'pending'},{name:'Considering',value:'considering'},{name:'Approved',value:'approved'},{name:'Denied',value:'denied'}).setRequired(true));}if(n==='suggestion-delete')s.addStringOption(o=>o.setName('id').setDescription('Suggestion ID').setRequired(true));if(n==='poll'){s.addStringOption(o=>o.setName('question').setDescription('Question').setRequired(true));s.addStringOption(o=>o.setName('options').setDescription('Option 1 | Option 2').setRequired(true));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional poll image'));}if(n==='poll-vote'){s.addStringOption(o=>o.setName('id').setDescription('Poll ID').setRequired(true));s.addIntegerOption(o=>o.setName('choice').setDescription('Option number').setMinValue(1).setMaxValue(10).setRequired(true));}if(n==='starboard'){s.addChannelOption(o=>o.setName('channel').setDescription('Starboard destination'));s.addIntegerOption(o=>o.setName('threshold').setDescription('Stars required').setMinValue(1).setMaxValue(50));s.addStringOption(o=>o.setName('emoji').setDescription('Reaction name or Unicode emoji'));}if(n==='marriage')user(s,true);if(['marriage-relationship','marriage-profile'].includes(n))user(s);if(['marriage-accept','marriage-decline','marriage-divorce'].includes(n))s.addStringOption(o=>o.setName('user_id').setDescription('User ID').setRequired(n!=='marriage-divorce'));if(n==='marriage-profile-edit'){s.addStringOption(o=>o.setName('title').setDescription('Optional couple-profile title').setMaxLength(100));s.addStringOption(o=>o.setName('bio').setDescription('Optional couple-profile biography').setMaxLength(1000));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional couple photo'));s.addAttachmentOption(o=>o.setName('thumbnail').setDescription('Optional couple thumbnail'));s.addBooleanOption(o=>o.setName('remove_image').setDescription('Remove the couple photo'));s.addBooleanOption(o=>o.setName('remove_thumbnail').setDescription('Remove the couple thumbnail'));}}),
  addSubs(root('media',rootText.media), categories.media.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(['gif','image','translate','meme'].includes(n))s.addStringOption(o=>o.setName('query').setDescription('Search').setRequired(true));}),
  addSubs(root('emoji',rootText.emoji), categories.emoji.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(['info','copy','sticker-copy'].includes(n))s.addStringOption(o=>o.setName('value').setDescription('Markup, ID or HTTPS URL').setRequired(true));}),
  addSubs(root('tunnel',rootText.tunnel), categories.tunnel.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(['create','link'].includes(n)){s.addBooleanOption(o=>o.setName('copy_emoji').setDescription('Forward custom emoji as attachments'));s.addBooleanOption(o=>o.setName('copy_stickers').setDescription('Forward stickers as attachments'));}if(n==='link')s.addStringOption(o=>o.setName('code').setDescription('Bridge code').setRequired(true));}),
  addSubs(root('feeds',rootText.feeds), categories.feeds.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(n==='add'){s.addStringOption(o=>o.setName('url').setDescription('HTTPS RSS or Atom feed').setRequired(true));s.addChannelOption(o=>o.setName('channel').setDescription('Destination').setRequired(true));s.addStringOption(o=>o.setName('title').setDescription('Optional card title'));}if(['remove','test'].includes(n))s.addStringOption(o=>o.setName('id').setDescription('Feed ID').setRequired(true));}),
  addSubs(root('forms',rootText.forms), categories.forms.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(n==='create'){s.addStringOption(o=>o.setName('name').setDescription('Form name').setRequired(true));s.addStringOption(o=>o.setName('description').setDescription('Short description').setMaxLength(1000).setRequired(true));s.addStringOption(o=>o.setName('questions').setDescription('Question 1 | Question 2 | Question 3').setMaxLength(1000).setRequired(true));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional card image'));s.addAttachmentOption(o=>o.setName('thumbnail').setDescription('Optional card thumbnail'));}if(n==='publish'){s.addStringOption(o=>o.setName('id').setDescription('Form ID').setRequired(true));s.addChannelOption(o=>o.setName('channel').setDescription('Panel channel').setRequired(true));}if(['delete','submissions'].includes(n))s.addStringOption(o=>o.setName('id').setDescription('Form ID').setRequired(true));}),
  addSubs(root('automation',rootText.automation), categories.automation.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(['custom-add','autoresponder-add'].includes(n)){s.addStringOption(o=>o.setName('trigger').setDescription('Name or phrase').setRequired(true));s.addStringOption(o=>o.setName('response').setDescription('Card response').setMaxLength(1800).setRequired(true));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional card image'));s.addRoleOption(o=>o.setName('allowed_role').setDescription('Optional role allowed to trigger it'));s.addChannelOption(o=>o.setName('allowed_channel').setDescription('Optional channel allowed to trigger it'));s.addBooleanOption(o=>o.setName('wildcard').setDescription('Match anywhere in the message'));s.addBooleanOption(o=>o.setName('delete_trigger').setDescription('Delete the triggering message'));s.addBooleanOption(o=>o.setName('silent').setDescription('Send without mentioning users'));}if(['custom-remove','autoresponder-remove'].includes(n))s.addStringOption(o=>o.setName('trigger').setDescription('Name or phrase').setRequired(true));if(n==='auto-message'){s.addChannelOption(o=>o.setName('channel').setDescription('Destination').setRequired(true));s.addStringOption(o=>o.setName('message').setDescription('Message card description').setMaxLength(1800).setRequired(true));s.addStringOption(o=>o.setName('repeat').setDescription('Duration such as 1h or 1d').setRequired(true));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional card image'));}if(n==='auto-message-remove')s.addStringOption(o=>o.setName('id').setDescription('Auto-message ID').setRequired(true));if(['tag-add','tag-remove'].includes(n)){s.addStringOption(o=>o.setName('name').setDescription('Tag name').setRequired(true));if(n==='tag-add'){s.addStringOption(o=>o.setName('response').setDescription('Tag card response').setMaxLength(1800).setRequired(true));s.addAttachmentOption(o=>o.setName('image').setDescription('Optional tag image'));}} }),
  addSubs(root('utility',rootText.utility), categories.utility.map(x=>[x,x.replaceAll('-',' ')]), (s,n)=>{if(['userinfo','avatar'].includes(n))user(s);if(n==='channelinfo')s.addChannelOption(o=>o.setName('channel').setDescription('Channel'));if(n==='roleinfo')s.addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true));})
];

const access = (i, permission) => { if (permission===PermissionFlagsBits.ManageGuild && i.commandName==='reminders' && i.options.getSubcommand(false)!=='settings') { const rg=store.guild(i.guild.id),roleId=rg.settings.reminders?.staffRoleId; if (roleId && i.member?.roles?.cache?.has(roleId)) return; } if (!i.memberPermissions?.has(permission)) throw new Error(`You need ${permission} to use this action.`); };
const reminderAccess = (i, g) => { if (i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true; const roleId = g.settings.reminders?.staffRoleId; return Boolean(roleId && i.member?.roles?.cache?.has(roleId)); };
const ticketStaff = (i, g) => i.memberPermissions?.has(PermissionFlagsBits.ManageMessages) || (g.settings.tickets.staffRoleId && i.member?.roles?.cache?.has(g.settings.tickets.staffRoleId));
const commandRuleAllowed = (i, g) => {
  if (i.commandName === 'help' || i.commandName === 'server' || i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const rule = g.settings.commandRules?.[i.commandName];
  if (!rule) return true;
  const roles = i.member?.roles?.cache;
  if (rule.denyChannels?.includes(i.channelId)) return false;
  if (rule.allowChannels?.length && !rule.allowChannels.includes(i.channelId)) return false;
  if (rule.denyRoles?.some(id => roles?.has(id))) return false;
  if (rule.allowRoles?.length && !rule.allowRoles.some(id => roles?.has(id))) return false;
  return true;
};
const guild = id => { const g = store.guild(id); g.id = id; return g; };
const marriageKey = (leftId, rightId) => [String(leftId), String(rightId)].sort().join(':');
const marriedPair = (g, userId) => {
  const relation = g.relationships?.[userId];
  if (relation?.status !== 'married' || !relation.with) return null;
  const reciprocal = g.relationships?.[relation.with];
  return reciprocal?.status === 'married' && reciprocal.with === userId
    ? { spouseId: relation.with, marriedAt: Number(relation.at || reciprocal.at || Date.now()) }
    : null;
};
const marriageStats = (leftId, rightId) => {
  const key = marriageKey(leftId, rightId), rows = [];
  let totalMessages = 0;
  for (const server of client.guilds.cache.values()) {
    if (!server.members.cache.has(leftId) || !server.members.cache.has(rightId)) continue;
    const stat = guild(server.id).marriageChat?.[key];
    const messages = Number(stat?.messages || 0);
    totalMessages += messages;
    rows.push({ name: server.name, messages });
  }
  rows.sort((a, b) => b.messages - a.messages || a.name.localeCompare(b.name));
  return { totalMessages, serverRows: rows.slice(0, 10) };
};
const recordMarriageChat = message => {
  if (!message.guild || message.author.bot) return;
  const g = guild(message.guild.id), pair = marriedPair(g, message.author.id);
  if (!pair || !message.guild.members.cache.has(pair.spouseId)) return;
  const key = marriageKey(message.author.id, pair.spouseId);
  const stat = g.marriageChat[key] ||= { messages: 0, byUser: {}, updatedAt: 0 };
  stat.messages += 1;
  stat.byUser[message.author.id] = Number(stat.byUser[message.author.id] || 0) + 1;
  stat.updatedAt = Date.now();
  store.scheduleSave();
};
const level = xp => Math.floor(Math.sqrt(Math.max(0, xp) / 100));
const xpAt = n => n * n * 100;
const weekKey = () => {
  const date = new Date();
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
};
const row = (g, u) => {
  const existing = g.xp[u.id];
  const entry = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? existing
    : (g.xp[u.id] = { id:u.id, name:u.username, xp:0, weeklyXp:0, voiceXp:0, reactionXp:0, weekKey:weekKey(), coins:0, last:0, daily:0 });
  if (entry.weekKey !== weekKey()) { entry.weekKey = weekKey(); entry.weeklyXp = 0; }
  entry.weeklyXp ??= 0;
  entry.voiceXp ??= 0;
  entry.reactionXp ??= 0;
  return entry;
};
const giveawayMemberEligible = (x, g, member) => Boolean(member && (!x.requiredRoleId || member.roles?.cache?.has(x.requiredRoleId)) && (!x.blockedRoleId || !member.roles?.cache?.has(x.blockedRoleId)) && (x.minimumLevel == null || level(row(g, member.user).xp) >= x.minimumLevel) && (!x.accountAgeDays || member.user.createdTimestamp <= Date.now() - x.accountAgeDays * 86400000) && (!x.serverAgeDays || !member.joinedTimestamp || member.joinedTimestamp <= Date.now() - x.serverAgeDays * 86400000));
const addGiveawayEntry = (x, member) => { x.entries ||= []; x.entryCounts ||= {}; const maximum = Math.max(1, Number(x.maxEntries || 1)), count = Number(x.entryCounts[member.id] || 0); if (count >= maximum) return false; const requested = count === 0 ? 1 + (member.roles?.cache?.has(x.bonusRoleId) ? (x.bonusEntries || 0) : 0) : 1, amount = Math.min(requested, maximum - count); if (amount < 1) return false; x.entryCounts[member.id] = count + amount; for (let index = 0; index < amount; index += 1) x.entries.push(member.id); return true; };
const chooseGiveawayWinners = async (server, g, giveaway) => { const unique=[...new Set(giveaway.entries||[])],eligible=[]; for(const id of unique){const member=await server.members.fetch(id).catch(()=>null);if(member&&giveawayMemberEligible(giveaway,g,member))eligible.push({id,member});} eligible.sort(()=>Math.random()-.5); giveaway.winnerIds=eligible.slice(0,giveaway.winners||1).map(x=>x.id); if(giveaway.winnerRoleId){const role=server.roles.cache.get(giveaway.winnerRoleId);for(const item of eligible.slice(0,giveaway.winners||1)){if(role?.editable)await item.member.roles.add(role).catch(()=>{});}} return eligible; };
const durationMs = value => { const text = String(value || '').trim().replace(/^in\s+/i, ''); const m = text.match(/^(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\s*)?$/i); return m && m.slice(1).some(Boolean) ? ((+m[1]||0)*86400000+(+m[2]||0)*3600000+(+m[3]||0)*60000+(+m[4]||0)*1000) : 0; };
const parseAt = value => { const duration = durationMs(value); if (duration > 0) return Date.now() + duration; const text = String(value || '').trim(); const clock = text.match(/^(today|tomorrow)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i); if (clock) { const date = new Date(); if (clock[1]?.toLowerCase() === 'tomorrow') date.setDate(date.getDate() + 1); let hour = Number(clock[2]) % 12; if (clock[4].toLowerCase() === 'pm') hour += 12; date.setHours(hour, Number(clock[3] || 0), 0, 0); if (date.getTime() <= Date.now() + 5000 && !clock[1]) date.setDate(date.getDate() + 1); return date.getTime(); } const t=Date.parse(text); if(!Number.isFinite(t)||t<=Date.now()+5000)throw new Error('Use a future ISO time, a clock time such as `3pm`, or a duration such as `2h 30m`.'); return t; };
const parseColour = (value, fallback = COLOURS.info) => { const text = String(value || '').trim().replace(/^#/, ''); return /^[0-9a-f]{6}$/i.test(text) ? Number.parseInt(text, 16) : fallback; };
const reminderPings = i => { const values=[];for(let p=1;p<=4;p++){const value=i.options.getMentionable(`ping_${p}`);if(value)values.push({id:value.user?.id||value.id,type:value.name?'role':'user'});}const role=i.options.getRole('role');if(role&&!values.some(value=>value.id===role.id))values.push({id:role.id,type:'role'});return values.slice(0,4); };
const reminderPingsFor = (i, old) => { const selected=reminderPings(i); return i.options.getBoolean('clear_pings') ? [] : (selected.length ? selected : (old?.pings || [])); };
const reminderPingText = reminder => reminder.pings?.length ? reminder.pings.map(ping=>ping.type==='role'?`<@&${ping.id}>`:`<@${ping.id}>`).join(' ') : (reminder.mentionRoleId?`<@&${reminder.mentionRoleId}>`:undefined);
const reminderAllowedMentions = reminder => ({roles:(reminder.pings||[]).filter(ping=>ping.type==='role').map(ping=>ping.id).concat(reminder.mentionRoleId||[]).filter(Boolean),users:(reminder.pings||[]).filter(ping=>ping.type!=='role').map(ping=>ping.id)});
const repeatAt = (at, r) => { const repeat=String(r||'once').trim().toLowerCase(); if(repeat==='once')return null; if(repeat==='hourly')return at+3600000; if(repeat==='daily')return at+86400000; if(repeat==='weekly')return at+604800000; if(repeat==='monthly'){const next=new Date(at);next.setMonth(next.getMonth()+1);return next.getTime();} if(repeat==='yearly'||repeat==='annually'){const next=new Date(at);next.setFullYear(next.getFullYear()+1);return next.getTime();} const duration=durationMs(repeat); return duration>0?at+duration:null; };
const list = (a, empty='Nothing configured.') => a.length?a.join('\n'):empty;
async function emitLog(server, g, event, detail){const config=g.settings.logs;if(!config?.enabled||!config.channelId)return;if(config.events?.length&&!config.events.includes('all')&&!config.events.includes(event))return;const channel=await server.channels.fetch(config.channelId).catch(()=>null);if(channel?.isTextBased())await channel.send({embeds:[card(`Log · ${event}`,detail,COLOURS.neutral)],allowedMentions:{parse:[]}}).catch(()=>{});}
const sendTunnelPayload = async (channel, payload) => {
  const files = Array.isArray(payload.files) ? payload.files : [];
  if (files.length <= 10) return channel.send(payload).catch(() => null);
  let first = null;
  for (let index = 0; index < files.length; index += 10) {
    const sent = await channel.send({
      ...payload,
      content: index === 0 ? payload.content : undefined,
      embeds: index === 0 ? payload.embeds : [],
      files: files.slice(index, index + 10).map(file => ({ ...file }))
    }).catch(() => null);
    if (!first) first = sent;
  }
  return first;
};

async function moderation(i,g) { const n=i.options.getSubcommand(); if(['warn','warnings','cases','modlogs','kick','ban','softban','unban','timeout','untimeout','purge','slowmode','lock','unlock'].includes(n))access(i,PermissionFlagsBits.ManageMessages); if(['kick','ban','softban','timeout'].includes(n))access(i, n==='timeout'?PermissionFlagsBits.ModerateMembers:n==='kick'?PermissionFlagsBits.KickMembers:PermissionFlagsBits.BanMembers); if(n==='untimeout'){access(i,PermissionFlagsBits.ModerateMembers);const u=i.options.getUser('member',true),m=await i.guild.members.fetch(u.id).catch(()=>null);if(!m)throw new Error('Member not found.');await m.timeout(null,'Timeout removed by staff.');store.scheduleSave();return replyCard(i,'Timeout removed',`<@${u.id}> may speak again.`,COLOURS.success,{ephemeral:true});} if(n==='modlogs')return replyCard(i,'Moderation logs',list(g.cases.slice(0,30).map(x=>`#${x.number} · ${x.action} · <@${x.userId}> · ${x.reason} · <t:${Math.floor(x.at/1000)}:R>`)),COLOURS.warning,{ephemeral:true}); if(n==='purge'){const d=await i.channel.bulkDelete(i.options.getInteger('count',true),true);return replyCard(i,'Messages removed',`${d.size} messages were removed.`,COLOURS.success,{ephemeral:true});} if(n==='slowmode'){access(i,PermissionFlagsBits.ManageChannels);await i.channel.setRateLimitPerUser(i.options.getInteger('seconds',true));return replyCard(i,'Slowmode updated','The channel cooldown was changed.',COLOURS.success,{ephemeral:true});} if(n==='lock'||n==='unlock'){access(i,PermissionFlagsBits.ManageChannels);await i.channel.permissionOverwrites.edit(i.guild.roles.everyone,{SendMessages:n==='unlock'?null:false});return replyCard(i,`Channel ${n}ed`,'The channel permissions were updated.',COLOURS.success,{ephemeral:true});} if(n==='unban'){access(i,PermissionFlagsBits.BanMembers);await i.guild.members.unban(i.options.getString('user_id',true));return replyCard(i,'User unbanned','The ban was removed.',COLOURS.success,{ephemeral:true});} if(n==='warnings'||n==='warn'){const u=i.options.getUser('member',true);const w=g.warnings.filter(x=>x.userId===u.id);if(n==='warnings')return replyCard(i,`Warnings · ${u.username}`,list(w.map((x,k)=>`**${k+1}.** ${x.reason} · <t:${Math.floor(x.at/1000)}:R>`)),COLOURS.warning,{ephemeral:true});g.warnings.unshift({userId:u.id,moderatorId:i.user.id,reason:i.options.getString('reason')||'No reason supplied.',at:Date.now()});store.scheduleSave();return replyCard(i,'Warning recorded',`<@${u.id}> has received a staff warning.`,COLOURS.warning,{ephemeral:true});} if(n==='cases')return replyCard(i,'Moderation cases',list(g.cases.slice(0,20).map(x=>`#${x.number} · ${x.action} · <@${x.userId}> · ${x.reason}`)),COLOURS.warning,{ephemeral:true}); const u=i.options.getUser('member',true),m=await i.guild.members.fetch(u.id).catch(()=>null);if(!m)throw new Error('Member not found.');if(m.roles.highest.position>=i.member.roles.highest.position)throw new Error('Discord role hierarchy prevents this action.');const reasonText=i.options.getString('reason')||'No reason supplied.',number=g.cases.length+1;g.cases.unshift({number,action:n,userId:u.id,moderatorId:i.user.id,reason:reasonText,at:Date.now()});if(n==='kick')await m.kick(reasonText);if(n==='ban')await m.ban({reason:reasonText,deleteMessageSeconds:86400});if(n==='softban'){await m.ban({reason:reasonText,deleteMessageSeconds:86400});await i.guild.members.unban(u.id,reasonText);}if(n==='timeout')await m.timeout((i.options.getInteger('minutes')||10)*60000,reasonText);store.scheduleSave();return replyCard(i,`Case #${number} · ${n}`,`<@${u.id}> was processed.\n**Reason:** ${reasonText}`,COLOURS.warning,{ephemeral:true}); }

async function levels(i, g) {
  const n = i.options.getSubcommand();
  const u = i.options.getUser('member') || i.user;
  const r = row(g, u);
  const l = level(r.xp);
  if (n === 'rank') {
    const next = xpAt(l + 1), base = xpAt(l);
    return i.reply({
      embeds: [levelCard({
        user: u,
        level: l,
        xp: r.xp,
        nextXp: next,
        rank: Object.values(g.xp).sort((a, b) => b.xp - a.xp).findIndex(x => x.id === u.id) + 1,
        progress: (r.xp - base) / Math.max(1, next - base),
        rewards: g.settings.levels.rewards.filter(x => x.level <= l).map(x => x.roleId)
      })],
      allowedMentions: { parse: [] }
    });
  }
  if (n === 'leaderboard') {
    const scope = i.options.getString('scope') || 'all';
    const label = { all: 'All XP', weekly: 'This week', voice: 'Voice XP', reactions: 'Reaction XP' }[scope] || 'All XP';
    const value = x => scope === 'weekly'
      ? (x.weekKey === weekKey() ? (x.weeklyXp || 0) : 0)
      : scope === 'voice' ? (x.voiceXp || 0)
        : scope === 'reactions' ? (x.reactionXp || 0)
          : (x.xp || 0);
    const rows = Object.values(g.xp).sort((a, b) => value(b) - value(a)).slice(0, 15);
    return replyCard(i, `${label} leaderboard`, list(rows.map((x, k) => `**${k + 1}.** <@${x.id}> · Level ${level(x.xp)} · ${value(x).toLocaleString()} XP`), 'No XP records have been created yet.'), COLOURS.level);
  }
  if (n === 'rewards') return replyCard(i, 'Level rewards', list(g.settings.levels.rewards.sort((a, b) => a.level - b.level).map(x => `Level **${x.level}** · <@&${x.roleId}>`)), COLOURS.level);
  access(i, PermissionFlagsBits.ManageGuild);
  if (n === 'settings') {
    const c = g.settings.levels;
    if (i.options.getBoolean('enabled') !== null) c.messageXp = i.options.getBoolean('enabled');
    if (i.options.getInteger('cooldown') !== null) c.cooldown = i.options.getInteger('cooldown');
    if (i.options.getBoolean('announcements') !== null) c.announce = i.options.getBoolean('announcements');
    if (i.options.getChannel('channel')) c.channelId = i.options.getChannel('channel').id;
    store.scheduleSave();
    return replyCard(i, 'Level settings saved', `Message XP: **${c.messageXp ? 'on' : 'off'}** · cooldown: **${c.cooldown}s** · announcements: **${c.announce ? 'on' : 'off'}**`, COLOURS.level, { ephemeral: true });
  }
  if (n === 'reward-add' || n === 'reward-remove') {
    const role = i.options.getRole('role', true);
    const lv = i.options.getInteger('level', true);
    if (n === 'reward-add') g.settings.levels.rewards.push({ roleId: role.id, level: lv });
    else g.settings.levels.rewards = g.settings.levels.rewards.filter(x => x.roleId !== role.id || x.level !== lv);
    store.scheduleSave();
    return replyCard(i, 'Reward roles updated', `${role} was updated at level ${lv}.`, COLOURS.success, { ephemeral: true });
  }
  if (n === 'xp' || n === 'reset') {
    r.xp = n === 'reset' ? 0 : Math.max(0, r.xp + i.options.getInteger('amount', true));
    store.scheduleSave();
    return replyCard(i, 'XP updated', `<@${u.id}> now has ${r.xp.toLocaleString()} XP.`, COLOURS.success, { ephemeral: true });
  }
  if (n === 'voice') {
    g.settings.levels.voiceXp = i.options.getBoolean('enabled') ?? g.settings.levels.voiceXp;
    g.settings.levels.voiceMinMembers = i.options.getInteger('minimum_members') ?? g.settings.levels.voiceMinMembers;
    store.scheduleSave();
    return replyCard(i, 'Voice XP saved', `Voice XP: **${g.settings.levels.voiceXp ? 'on' : 'off'}** · minimum members: ${g.settings.levels.voiceMinMembers}`, COLOURS.success, { ephemeral: true });
  }
  const rows = ['user_id,xp,level', ...Object.values(g.xp).map(x => `${x.id},${x.xp},${level(x.xp)}`)];
  return i.reply({
    embeds: [card('Level export', `The current level table contains **${rows.length - 1}** member record(s). A CSV copy is attached for staff use.`, COLOURS.level)],
    files: [{ attachment: Buffer.from(`${rows.join('\n')}\n`, 'utf8'), name: `levels-${i.guild.id}.csv` }],
    flags: 64,
    allowedMentions: { parse: [] }
  });
}
const levelsBase = levels;
levels = async function levelsWithCards(i,g){const n=i.options.getSubcommand(),u=i.options.getUser('member')||i.user;if(n==='settings'){access(i,PermissionFlagsBits.ManageGuild);g.settings.levels.rankCard||={};const background=await uploadedAsset(i.options.getAttachment('background'),'rank-background');if(i.options.getBoolean('remove_background'))delete g.settings.levels.rankCard.backgroundAsset;if(background)g.settings.levels.rankCard.backgroundAsset=background;const accent=i.options.getString('accent');if(accent)g.settings.levels.rankCard.accent=parseColour(accent,COLOURS.level);store.scheduleSave();}if(n!=='rank')return levelsBase(i,g);const r=row(g,u),l=level(r.xp),next=xpAt(l+1),base=xpAt(l),rank=Object.values(g.xp).sort((a,b)=>b.xp-a.xp).findIndex(x=>x.id===u.id)+1,backgroundAsset=assetOnDisk(g.settings.levels.rankCard?.backgroundAsset),accent=g.settings.levels.rankCard?.accent,values={user:u,level:l,xp:r.xp,nextXp:next,rank,progress:(r.xp-base)/Math.max(1,next-base),rewards:g.settings.levels.rewards.filter(x=>x.level<=l).map(x=>x.roleId),backgroundAsset,accent},rendered=await renderLevelCard(values);return i.reply({embeds:[levelCard({...values,cardImage:rendered?'attachment://rank-card.png':undefined})],files:rendered?[rendered]:assetFiles(backgroundAsset),allowedMentions:{parse:[]}});};
const levelsMediaBase = levels;
levels = async function levelsWithLevelUpMedia(i,g){
  if(i.options.getSubcommand()==='settings'){
    access(i,PermissionFlagsBits.ManageGuild);
    const config=g.settings.levels.levelUp||={message:'Congratulations, {{user}} — you reached level {{level}}.',footer:''};
    const image=await uploadedAsset(i.options.getAttachment('levelup_image'),'level-up-image');
    if(i.options.getBoolean('remove_levelup_image'))delete config.imageAsset;
    if(image)config.imageAsset=image;
    const message=i.options.getString('levelup_message');
    const footer=i.options.getString('levelup_footer');
    if(message!==null)config.message=message;
    if(footer!==null)config.footer=footer;
    store.scheduleSave();
  }
  return levelsMediaBase(i,g);
};
const levelsWithAvatarBase = levels;
levels = async function levelsWithAvatar(i, g) {
  const subcommand = i.options.getSubcommand();
  if (subcommand === 'settings') {
    const showAvatar = i.options.getBoolean('show_avatar');
    if (showAvatar !== null) {
      access(i, PermissionFlagsBits.ManageGuild);
      g.settings.levels.rankCard = { showAvatar: false, ...(g.settings.levels.rankCard || {}), showAvatar };
      store.scheduleSave();
    }
    return levelsWithAvatarBase(i, g);
  }
  if (subcommand !== 'rank') return levelsWithAvatarBase(i, g);
  const user = i.options.getUser('member') || i.user;
  const entry = row(g, user), current = level(entry.xp), next = xpAt(current + 1), base = xpAt(current);
  const rank = Object.values(g.xp).sort((a, b) => b.xp - a.xp).findIndex(item => item.id === user.id) + 1;
  const values = { user, level: current, xp: entry.xp, nextXp: next, rank, progress: (entry.xp - base) / Math.max(1, next - base), rewards: g.settings.levels.rewards.filter(item => item.level <= current).map(item => item.roleId), backgroundAsset: assetOnDisk(g.settings.levels.rankCard?.backgroundAsset), accent: g.settings.levels.rankCard?.accent, showAvatar: g.settings.levels.rankCard?.showAvatar === true };
  const rendered = await renderLevelCard(values);
  return i.reply({ embeds: [levelCard({ ...values, cardImage: rendered ? 'attachment://rank-card.png' : undefined })], files: rendered ? [rendered] : assetFiles(values.backgroundAsset), allowedMentions: { parse: [] } });
};
const levelsSettingsBase = levels;
levels = async function levelsWithActivitySettings(i, g) {
  if (i.options.getSubcommand() === 'settings') {
    access(i, PermissionFlagsBits.ManageGuild);
    const settings = g.settings.levels;
    const reactions = i.options.getBoolean('reactions');
    const perWord = i.options.getBoolean('per_word');
    const threadXp = i.options.getBoolean('thread_xp');
    const voiceTextXp = i.options.getBoolean('voice_text_xp');
    const minimumXp = i.options.getInteger('minimum_xp');
    const maximumXp = i.options.getInteger('maximum_xp');
    const noXpChannel = i.options.getChannel('no_xp_channel');
    const noXpRole = i.options.getRole('no_xp_role');
    if (reactions !== null) settings.reactionXp = reactions;
    if (perWord !== null) settings.perWord = perWord;
    if (threadXp !== null) settings.threadXp = threadXp;
    if (voiceTextXp !== null) settings.voiceTextXp = voiceTextXp;
    if (minimumXp !== null) settings.xpMin = minimumXp;
    if (maximumXp !== null) settings.xpMax = Math.max(minimumXp ?? settings.xpMin, maximumXp);
    if (noXpChannel) { settings.exclusions.channels ||= []; if (!settings.exclusions.channels.includes(noXpChannel.id)) settings.exclusions.channels.push(noXpChannel.id); }
    if (noXpRole) { settings.exclusions.roles ||= []; if (!settings.exclusions.roles.includes(noXpRole.id)) settings.exclusions.roles.push(noXpRole.id); }
    if (i.options.getBoolean('remove_no_xp_channel')) settings.exclusions.channels = [];
    if (i.options.getBoolean('remove_no_xp_role')) settings.exclusions.roles = [];
    store.scheduleSave();
  }
  const result = await levelsSettingsBase(i, g);
  return result;
};

const reminderSelector = (reminders, page = 0) => { const pages=Math.max(1,Math.ceil(reminders.length/25)),current=Math.max(0,Math.min(page,pages-1)),options=reminders.slice(current*25,current*25+25).map(x=>new StringSelectMenuOptionBuilder().setLabel(clean(`${x.title||'Reminder'} · ${x.id.slice(0,8)}`,100)).setValue(x.id).setDescription(clean(x.repeat||'once',100))); const rows=options.length?[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`reminder:select:${current}`).setPlaceholder(`Select a reminder · page ${current+1}/${pages}`).addOptions(options))]:[]; if(pages>1)rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`reminder-page:prev:${current}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(current===0),new ButtonBuilder().setCustomId(`reminder-page:next:${current}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(current>=pages-1))); return rows; };
const reminderActions = id => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`reminder:delete:${id}`).setLabel('Delete').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`reminder:pause:${id}`).setLabel('Pause').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`reminder:resume:${id}`).setLabel('Resume').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`reminder:duplicate:${id}`).setLabel('Duplicate').setStyle(ButtonStyle.Primary))];
async function reminders(i,g){const n=i.options.getSubcommand();if(n==='list'){access(i,PermissionFlagsBits.ManageGuild);const page=Math.max(0,(i.options.getInteger('page')||1)-1),rows=g.reminders.slice(page*10,page*10+10);return i.reply({embeds:rows.map(x=>reminderCard(x,`<#${x.channelId}>`)),files:rows.flatMap(x=>assetFiles(x.imageAsset,x.thumbnailAsset)),components:reminderSelector(g.reminders,Math.floor(page/3)),flags:64,allowedMentions:{parse:[]}});}if(['create','edit'].includes(n)){access(i,PermissionFlagsBits.ManageGuild);const old=n==='edit'?g.reminders.find(x=>x.id===i.options.getString('id',true)):null;if(n==='edit'&&!old)throw new Error('Reminder not found.');const at=parseAt(i.options.getString('time',true)),ch=i.options.getChannel('channel')||i.channel,r=old||{id:randomUUID(),ownerId:i.user.id,enabled:true};Object.assign(r,{channelId:ch.id,title:i.options.getString('title')||old?.title||'Scheduled notice',content:i.options.getString('message')||old?.content||'Reminder',reason:i.options.getString('message')||old?.content||'Reminder',at,nextAt:at,repeat:i.options.getString('repeat')||old?.repeat||'once',mentionRoleId:i.options.getRole('role')?.id||old?.mentionRoleId||''});if(!old)g.reminders.push(r);store.scheduleSave();return i.reply({embeds:[reminderCard(r,`<#${ch.id}>`)],allowedMentions:{parse:[]}});}if(n==='pause-all'||n==='resume-all'){if(!reminderAccess(i,g))access(i,PermissionFlagsBits.ManageGuild);for(const reminder of g.reminders)reminder.enabled=n==='resume-all';store.scheduleSave();return replyCard(i,n==='pause-all'?'Reminders paused':'Reminders resumed',`${g.reminders.length} schedules were updated.`,COLOURS.success,{ephemeral:true});}const r=g.reminders.find(x=>x.id===i.options.getString('id',true));if(!r)throw new Error('Reminder not found.');if(r.ownerId!==i.user.id&&!reminderAccess(i,g))throw new Error('Only the reminder owner, Manage Server, or the configured reminder staff role may manage it.');if(n==='delete')g.reminders=g.reminders.filter(x=>x!==r);if(n==='pause')r.enabled=false;if(n==='resume')r.enabled=true;if(n==='duplicate'){const d=structuredClone(r);d.id=randomUUID();d.ownerId=i.user.id;d.nextAt=d.at=Math.max(Date.now()+60000,Number(d.nextAt||d.at||Date.now()));d.enabled=true;g.reminders.push(d);}store.scheduleSave();return replyCard(i,`Reminder ${n}d`,n==='delete'?'The schedule was deleted.':n==='duplicate'?'A fresh active copy was created with the same card design.':'The current card settings were retained.',COLOURS.success,{ephemeral:true});}
const remindersBase = reminders;
reminders = async function remindersWithAssets(i,g){const n=i.options.getSubcommand();if(!['create','edit'].includes(n))return remindersBase(i,g);access(i,PermissionFlagsBits.ManageGuild);const old=n==='edit'?g.reminders.find(x=>x.id===i.options.getString('id',true)):null;if(n==='edit'&&!old)throw new Error('Reminder not found.');const time=i.options.getString('time')||old?.at;if(!time)throw new Error('Create a reminder with a future time or duration.');const at=typeof time==='number'?time:parseAt(time),ch=i.options.getChannel('channel')||i.channel,r=old||{id:randomUUID(),ownerId:i.user.id,enabled:true};const repeat=i.options.getString('repeat')||old?.repeat||'once';if(!['once','hourly','daily','weekly','monthly','yearly','annually'].includes(repeat.toLowerCase())&&!durationMs(repeat))throw new Error('Repeat must be once, hourly, daily, weekly, monthly, yearly, or a duration such as `2h`.');const image=await uploadedAsset(i.options.getAttachment('image'),'reminder-image'),thumbnail=await uploadedAsset(i.options.getAttachment('thumbnail'),'reminder-thumbnail');Object.assign(r,{channelId:ch.id,title:i.options.getString('title')||old?.title||'Scheduled notice',content:i.options.getString('message')||old?.content||'Reminder',reason:i.options.getString('message')||old?.content||'Reminder',color:parseColour(i.options.getString('color'),old?.color||COLOURS.info),at,nextAt:at,repeat,mentionRoleId:i.options.getRole('role')?.id||old?.mentionRoleId||'',pings:reminderPingsFor(i,old),footer:i.options.getString('footer')||old?.footer||'',showTimestamp:i.options.getBoolean('timestamp')??old?.showTimestamp??false,expiresAt:i.options.getString('expires')?parseAt(i.options.getString('expires')):old?.expiresAt||0});if(i.options.getBoolean('remove_image'))delete r.imageAsset;if(i.options.getBoolean('remove_thumbnail'))delete r.thumbnailAsset;if(image)r.imageAsset=image;if(thumbnail)r.thumbnailAsset=thumbnail;if(!old)g.reminders.push(r);store.scheduleSave();return i.reply({content:reminderPingText(r),embeds:[reminderCard(r,`<#${ch.id}>`)],files:assetFiles(r.imageAsset,r.thumbnailAsset),allowedMentions:reminderAllowedMentions(r)});};

const remindersAssetBase = reminders;
reminders = async function remindersAssetTransactional(i, g) {
  const n = i.options.getSubcommand();
  if (!['create', 'edit'].includes(n)) return remindersAssetBase(i, g);
  const before = structuredClone(g.reminders);
  try {
    return await remindersAssetBase(i, g);
  } catch (error) {
    g.reminders = before;
    store.scheduleSave();
    throw error;
  }
};
const remindersWithStaffBase = reminders;
reminders = async function remindersWithStaff(i,g){
  const n=i.options.getSubcommand();
  if(n==='settings'){
    access(i,PermissionFlagsBits.ManageGuild);
    g.settings.reminders ||= {staffRoleId:'',timezone:g.settings.timezone||'Europe/London'};
    if (i.options.getBoolean('clear_staff_role')) g.settings.reminders.staffRoleId = '';
    else if (i.options.getRole('staff_role')) g.settings.reminders.staffRoleId = i.options.getRole('staff_role').id;
    store.scheduleSave();
    const role=g.settings.reminders.staffRoleId;
    return replyCard(i,'Reminder access saved',role?`Members with <@&${role}> may manage reminders in this server.`:'Only members with Manage Server may manage reminders.',COLOURS.success,{ephemeral:true});
  }
  return remindersWithStaffBase(i,g);
};
const reminderWeekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const normaliseSkipDays = value => {
  const raw = String(value || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const invalid = raw.filter(day => !reminderWeekdays.includes(day));
  if (invalid.length) throw new Error(`Unknown skip day: ${invalid[0]}. Use weekday names.`);
  const unique = [...new Set(raw)];
  if (unique.length > 3) throw new Error('Reminder Pro-style schedules allow at most three skipped weekdays.');
  return unique;
};
const reminderWeekday = (at, timezone = 'UTC') => { try { return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(new Date(at)).toLowerCase(); } catch { return reminderWeekdays[new Date(at).getDay()]; } };
const reminderShouldSkip = (reminder, at) => (reminder.skipDays || []).includes(reminderWeekday(at, reminder.timezone));
const nextReminderTime = (reminder, at) => {
  let next = repeatAt(at, reminder.repeat);
  let guard = 0;
  while (next && reminderShouldSkip(reminder, next) && guard++ < 8) next = repeatAt(next, reminder.repeat);
  return next;
};
const remindersAfterScheduling = reminders;
reminders = async function remindersWithSchedulingOptions(i, g) {
  const n = i.options.getSubcommand();
  if (!['create', 'edit'].includes(n)) return remindersAfterScheduling(i, g);
  const skipDays = i.options.getString('skip_days');
  const expires = i.options.getString('expires');
  // Validate values before the wrapped handler replies. Otherwise Discord receives
  // a success response and the follow-up validation error is discarded.
  if (skipDays !== null) normaliseSkipDays(skipDays);
  if (expires) {
    const expiresAt = parseAt(expires);
    const time = i.options.getString('time');
    if (time && expiresAt <= parseAt(time)) throw new Error('The expiry must be after the first scheduled run.');
  }
  const before = new Set(g.reminders.map(x => x.id));
  const result = await remindersAfterScheduling(i, g);
  const id = n === 'edit' ? i.options.getString('id', true) : [...g.reminders].reverse().find(x => !before.has(x.id))?.id;
  const reminder = id ? g.reminders.find(x => x.id === id) : null;
  if (reminder) {
    if (skipDays !== null) reminder.skipDays = normaliseSkipDays(skipDays);
    if (i.options.getBoolean('delete_previous') !== null) reminder.deletePrevious = i.options.getBoolean('delete_previous');
    reminder.timezone ||= g.settings.reminders?.timezone || g.settings.timezone || 'UTC';
    store.scheduleSave();
  }
  return result;
};
const remindersWithTimezoneBase = reminders;
reminders = async function remindersWithTimezone(i, g) {
  if (i.options.getSubcommand() === 'settings') {
    access(i, PermissionFlagsBits.ManageGuild);
    const timezone = i.options.getString('timezone');
    if (timezone) {
      try { new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(); } catch { throw new Error('Use a valid IANA timezone such as Europe/London or America/New_York.'); }
      g.settings.timezone = timezone;
      g.settings.reminders ||= {};
      g.settings.reminders.timezone = timezone;
      store.scheduleSave();
    }
  }
  return remindersWithTimezoneBase(i, g);
};

async function social(i,g){const n=i.options.getSubcommand();g.relationships||={};g.marriageHistory||=[];if(n.startsWith('marriage')){if(n==='marriage'){const u=i.options.getUser('member',true);if(u.id===i.user.id)throw new Error('You cannot propose to yourself.');if(g.relationships[i.user.id]?.status==='married'||g.relationships[u.id]?.status==='married')throw new Error('One of you is already married.');g.relationships[i.user.id]={status:'pending',to:u.id,at:Date.now()};store.scheduleSave();return i.reply({embeds:[card('Marriage proposal',`<@${i.user.id}> has proposed to <@${u.id}>.\nThe recipient must explicitly accept or decline.`,COLOURS.info)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`marriage:accept:${i.user.id}:${u.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`marriage:decline:${i.user.id}:${u.id}`).setLabel('Decline').setStyle(ButtonStyle.Danger))],allowedMentions:{users:[i.user.id,u.id]}});}if(n==='marriage-accept'||n==='marriage-decline'){const id=i.options.getString('user_id',true),p=g.relationships[id];if(!p||p.to!==i.user.id||p.status!=='pending')throw new Error('No pending proposal from that member.');if(n==='marriage-decline'){delete g.relationships[id];store.scheduleSave();return replyCard(i,'Proposal declined','No relationship was created.',COLOURS.neutral,{ephemeral:true});}g.relationships[id]={status:'married',with:i.user.id,at:Date.now()};g.relationships[i.user.id]={status:'married',with:id,at:Date.now()};g.marriageHistory.unshift({a:id,b:i.user.id,at:Date.now(),action:'married'});store.scheduleSave();return replyCard(i,'Relationship confirmed',`<@${id}> and <@${i.user.id}> are now marked as married by mutual consent.`,COLOURS.success);}if(n==='marriage-divorce'){const relation=g.relationships[i.user.id];if(!relation||relation.status!=='married')throw new Error('You are not marked as married.');g.marriageHistory.unshift({a:i.user.id,b:relation.with,at:Date.now(),action:'divorced'});delete g.relationships[relation.with];delete g.relationships[i.user.id];store.scheduleSave();return replyCard(i,'Relationship ended','The relationship record has been removed.',COLOURS.warning,{ephemeral:true});}if(n==='marriage-history'){return replyCard(i,'Marriage history',list(g.marriageHistory.filter(x=>x.a===i.user.id||x.b===i.user.id).slice(0,10).map(x=>`${x.action==='married'?'Married':'Divorced'} · <@${x.a}> and <@${x.b}> · <t:${Math.floor(x.at/1000)}:D>`),'No marriage history is recorded.'),COLOURS.info,{ephemeral:true});}if(n==='marriage-relationship'){const u=i.options.getUser('member')||i.user;const relation=g.relationships[u.id];return replyCard(i,'Relationship status',relation?.status==='married'?`<@${u.id}> is married to <@${relation.with}> since <t:${Math.floor(relation.at/1000)}:D>.`:relation?.status==='pending'?'A proposal is awaiting a response.':'No relationship is recorded.',COLOURS.info,{ephemeral:true});}const relation=g.relationships[i.user.id];return replyCard(i,'Relationship status',relation?.status==='married'?`Married to <@${relation.with}> since <t:${Math.floor(relation.at/1000)}:D>.`:relation?.status==='pending'?'A proposal is awaiting a response.':'No relationship is recorded.',COLOURS.info,{ephemeral:true});}if(n==='afk'){g.afk||={};g.afk[i.user.id]=i.options.getString('message')||'AFK';store.scheduleSave();return replyCard(i,'AFK status set','Your AFK note is now active.',COLOURS.info,{ephemeral:true});}if(n==='birthday'){g.birthdays||={};g.birthdays[i.user.id]=i.options.getString('date',true);store.scheduleSave();return replyCard(i,'Birthday saved','Birthday announcements remain off until enabled by staff.',COLOURS.success,{ephemeral:true});}if(n==='suggest'){const image=await uploadedAsset(i.options.getAttachment('image'),'suggestion-image');g.suggestions||=[];const suggestion={id:randomUUID().slice(0,8),userId:i.user.id,text:i.options.getString('idea',true),at:Date.now(),imageAsset:image};g.suggestions.unshift(suggestion);store.scheduleSave();return i.reply({embeds:[card('Suggestion received','Your suggestion has been recorded for staff review.',COLOURS.info,{image:embedAssetUrl(image)})],files:assetFiles(image),allowedMentions:{parse:[]}});}if(n==='starboard'){access(i,PermissionFlagsBits.ManageGuild);const s=g.settings.starboard;s.enabled=!s.enabled;if(i.options.getChannel('channel'))s.channelId=i.options.getChannel('channel').id;if(i.options.getInteger('threshold'))s.threshold=i.options.getInteger('threshold');if(i.options.getString('emoji'))s.emoji=i.options.getString('emoji');store.scheduleSave();return replyCard(i,'Starboard updated',`Featured messages are now **${s.enabled?'enabled':'disabled'}**${s.enabled?` in <#${s.channelId}> at ${s.threshold} ${s.emoji}`:''}.`,COLOURS.success,{ephemeral:true});}return replyCard(i,'Poll',`**${i.options.getString('question',true)}**\n${i.options.getString('options',true).split('|').map((x,k)=>`**${k+1}.** ${x.trim()}`).join('\n')}`,COLOURS.info);}

async function media(i){const n=i.options.getSubcommand();if(n==='translate')return replyCard(i,'Translation link',`[Open the translation tool](https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(i.options.getString('query',true))})`,COLOURS.info);const url=await liveMedia(i.options.getString('query',true));return url?i.reply({embeds:[card(n==='gif'?'GIF result':n==='image'?'Image result':'Meme result','A live result from the configured media provider.',COLOURS.music,{image:url})],allowedMentions:{parse:[]}}):replyCard(i,'Media source unavailable','Add TENOR_API_KEY or GIPHY_API_KEY to .env for live GIF and image results. No unrelated local art is substituted.',COLOURS.warning,{ephemeral:true});}
async function automation(i,g){access(i,PermissionFlagsBits.ManageGuild);const n=i.options.getSubcommand();g.customCommands||={};g.autoresponders||=[];g.autoMessages||=[];g.tags||={};if(n==='tag-add'){const name=i.options.getString('name',true).trim().toLowerCase();g.tags[name]={name,response:i.options.getString('response',true),ownerId:i.user.id,at:Date.now()};store.scheduleSave();return replyCard(i,'Tag saved',`Use **${g.settings.prefix||'!'}tag ${name}** in a channel.`,COLOURS.success,{ephemeral:true});}if(n==='tag-remove'){const name=i.options.getString('name',true).trim().toLowerCase();delete g.tags[name];store.scheduleSave();return replyCard(i,'Tag removed','The saved tag was deleted.',COLOURS.warning,{ephemeral:true});}if(n==='tag-list')return replyCard(i,'Saved tags',list(Object.keys(g.tags).map(name=>`${g.settings.prefix||'!'}tag ${name}`)),COLOURS.info,{ephemeral:true});if(n==='custom-add'){const trigger=i.options.getString('trigger',true).trim().toLowerCase();g.customCommands[trigger]={trigger,response:i.options.getString('response',true),ownerId:i.user.id,at:Date.now()};store.scheduleSave();return replyCard(i,'Custom command saved',`Use **${g.settings.prefix||'!'}${trigger}** in a channel.`,COLOURS.success,{ephemeral:true});}if(n==='custom-remove'){const trigger=i.options.getString('trigger',true).trim().toLowerCase();delete g.customCommands[trigger];store.scheduleSave();return replyCard(i,'Custom command removed','The response was deleted.',COLOURS.warning,{ephemeral:true});}if(n==='custom-list')return replyCard(i,'Custom commands',list(Object.keys(g.customCommands).map(trigger=>`${g.settings.prefix||'!'}${trigger}`)),COLOURS.info,{ephemeral:true});if(n==='autoresponder-add'){const trigger=i.options.getString('trigger',true).trim().toLowerCase();g.autoresponders=g.autoresponders.filter(x=>x.trigger!==trigger);g.autoresponders.push({id:randomUUID().slice(0,8),trigger,response:i.options.getString('response',true),ownerId:i.user.id,at:Date.now()});store.scheduleSave();return replyCard(i,'Autoresponder saved',`The phrase **${trigger}** will receive a card response.`,COLOURS.success,{ephemeral:true});}if(n==='autoresponder-remove'){const trigger=i.options.getString('trigger',true).trim().toLowerCase();g.autoresponders=g.autoresponders.filter(x=>x.trigger!==trigger);store.scheduleSave();return replyCard(i,'Autoresponder removed','The matching response was deleted.',COLOURS.warning,{ephemeral:true});}if(n==='autoresponder-list')return replyCard(i,'Autoresponders',list(g.autoresponders.map(x=>`${x.id} · ${x.trigger}`)),COLOURS.info,{ephemeral:true});if(n==='auto-message'){const repeat=parseAt(i.options.getString('repeat',true));const x={id:randomUUID().slice(0,8),channelId:i.options.getChannel('channel',true).id,message:i.options.getString('message',true),interval:repeat-Date.now(),nextAt:repeat,ownerId:i.user.id,enabled:true};if(x.interval<60000)throw new Error('Use a repeat interval of at least one minute.');g.autoMessages.push(x);store.scheduleSave();return replyCard(i,'Automatic message scheduled',`ID: **${x.id}** · next delivery <t:${Math.floor(x.nextAt/1000)}:R>`,COLOURS.success,{ephemeral:true});}const id=i.options.getString('id',true),before=g.autoMessages.length;g.autoMessages=g.autoMessages.filter(x=>x.id!==id);if(g.autoMessages.length===before)throw new Error('Automatic message not found.');store.scheduleSave();return replyCard(i,'Automatic message removed','The schedule was deleted.',COLOURS.warning,{ephemeral:true});}
async function tunnel(i,g){access(i,PermissionFlagsBits.ManageGuild);const n=i.options.getSubcommand(),root=store.data.publicBot.tunnels||={};if(n==='create'){const code=randomUUID().replaceAll('-','').slice(0,12).toUpperCase(),channelId=i.channel.id;root[code]={code,channels:[channelId],createdBy:i.user.id,createdAt:Date.now(),privacy:'linked-only'};g.tunnel={code,channelId};store.scheduleSave();return replyCard(i,'Tunnel created',`Bridge code: **${code}**\nLink the other server with **/tunnel link code:${code}** in its destination channel.`,COLOURS.success,{ephemeral:true});}if(n==='link'){const code=i.options.getString('code',true).trim().toUpperCase(),bridge=root[code];if(!bridge)throw new Error('Tunnel code not found.');if(!bridge.channels.includes(i.channel.id))bridge.channels.push(i.channel.id);g.tunnel={code,channelId:i.channel.id};store.scheduleSave();return replyCard(i,'Tunnel linked',`This channel is now connected to **${code}**. Custom emoji are forwarded as image attachments, and stickers, GIFs and other attachments remain visible.`,COLOURS.success,{ephemeral:true});}if(n==='view'){const bridge=g.tunnel?.code?root[g.tunnel.code]:null;return replyCard(i,'Tunnel status',bridge?`Code: **${bridge.code}**\nLinked channels: ${bridge.channels.map(id=>`<#${id}>`).join(', ')}\nPrivacy: **${bridge.privacy||'linked-only'}**`:'This server has no linked tunnel.',COLOURS.info,{ephemeral:true});}if(n==='privacy'){const bridge=g.tunnel?.code?root[g.tunnel.code]:null;if(!bridge)throw new Error('This server has no linked tunnel.');bridge.privacy=bridge.privacy==='linked-only'?'staff-managed':'linked-only';store.scheduleSave();return replyCard(i,'Tunnel privacy updated',`Mode: **${bridge.privacy}**. Only linked channels can relay messages.`,COLOURS.success,{ephemeral:true});}const bridge=g.tunnel?.code?root[g.tunnel.code]:null;if(!bridge)throw new Error('This server has no linked tunnel.');bridge.channels=bridge.channels.filter(id=>id!==i.channel.id);delete g.tunnel;if(bridge.channels.length<2)delete root[bridge.code];store.scheduleSave();return replyCard(i,'Tunnel closed','This channel has been removed from the bridge.',COLOURS.warning,{ephemeral:true});}
const tunnelWithExpressionSettingsBase = tunnel;
tunnel = async function tunnelWithExpressionSettings(i, g) {
  const result = await tunnelWithExpressionSettingsBase(i, g);
  const subcommand = i.options.getSubcommand();
  if (subcommand === 'create' || subcommand === 'link') {
    const bridge = g.tunnel?.code ? (store.data.publicBot.tunnels || {})[g.tunnel.code] : null;
    if (bridge) {
      bridge.copyEmoji = i.options.getBoolean('copy_emoji') ?? bridge.copyEmoji ?? true;
      bridge.copyStickers = i.options.getBoolean('copy_stickers') ?? bridge.copyStickers ?? true;
      store.scheduleSave();
    }
  }
  return result;
};
const automationBase = automation;
automation = async function automationWithAssets(i,g){const n=i.options.getSubcommand();if(!['custom-add','autoresponder-add','auto-message','tag-add'].includes(n))return automationBase(i,g);access(i,PermissionFlagsBits.ManageGuild);const image=await uploadedAsset(i.options.getAttachment('image'),'automation-image');if(n==='tag-add'){const name=i.options.getString('name',true).trim().toLowerCase();g.tags||={};g.tags[name]={name,response:i.options.getString('response',true),ownerId:i.user.id,at:Date.now(),imageAsset:image};store.scheduleSave();return replyCard(i,'Tag saved',`Use **${g.settings.prefix||'!'}tag ${name}** in a channel.`,COLOURS.success,{ephemeral:true,image:embedAssetUrl(image),files:assetFiles(image)});}if(n==='custom-add'){const trigger=i.options.getString('trigger',true).trim().toLowerCase();g.customCommands||={};g.customCommands[trigger]={trigger,response:i.options.getString('response',true),ownerId:i.user.id,at:Date.now(),imageAsset:image,allowedRoleId:i.options.getRole('allowed_role')?.id||'',allowedChannelId:i.options.getChannel('allowed_channel')?.id||'',wildcard:i.options.getBoolean('wildcard')??false,deleteTrigger:i.options.getBoolean('delete_trigger')??false,silent:i.options.getBoolean('silent')??false};store.scheduleSave();return replyCard(i,'Custom command saved',`Use **${g.settings.prefix||'!'}${trigger}** in a channel.`,COLOURS.success,{ephemeral:true,image:embedAssetUrl(image),files:assetFiles(image)});}if(n==='autoresponder-add'){const trigger=i.options.getString('trigger',true).trim().toLowerCase();g.autoresponders=(g.autoresponders||[]).filter(x=>x.trigger!==trigger);g.autoresponders.push({id:randomUUID().slice(0,8),trigger,response:i.options.getString('response',true),ownerId:i.user.id,at:Date.now(),imageAsset:image,allowedRoleId:i.options.getRole('allowed_role')?.id||'',allowedChannelId:i.options.getChannel('allowed_channel')?.id||'',wildcard:i.options.getBoolean('wildcard')??false,deleteTrigger:i.options.getBoolean('delete_trigger')??false,silent:i.options.getBoolean('silent')??false});store.scheduleSave();return replyCard(i,'Autoresponder saved',`The phrase **${trigger}** will receive a card response.`,COLOURS.success,{ephemeral:true,image:embedAssetUrl(image),files:assetFiles(image)});}const repeat=parseAt(i.options.getString('repeat',true)),x={id:randomUUID().slice(0,8),channelId:i.options.getChannel('channel',true).id,message:i.options.getString('message',true),interval:repeat-Date.now(),nextAt:repeat,ownerId:i.user.id,enabled:true,imageAsset:image};if(x.interval<60000)throw new Error('Use a repeat interval of at least one minute.');g.autoMessages=(g.autoMessages||[]).concat(x);store.scheduleSave();return replyCard(i,'Automatic message scheduled',`ID: **${x.id}** · next delivery <t:${Math.floor(x.nextAt/1000)}:R>`,COLOURS.success,{ephemeral:true,image:embedAssetUrl(image),files:assetFiles(image)});};
async function liveMedia(q) {
  const query = String(q || '').trim();
  if (/^https?:\/\/\S+$/i.test(query)) return query;
  if (/\b(?:lesbian|gay)\b/i.test(query)) return null;
  if (process.env.TENOR_API_KEY) {
    const d = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${process.env.TENOR_API_KEY}&limit=10&media_filter=gif`).then(r => r.ok ? r.json() : null).catch(() => null);
    const url = d?.results?.[0]?.media_formats?.gif?.url || null;
    if (url) return url;
  }
  if (process.env.GIPHY_API_KEY) {
    const d = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=10&rating=pg`).then(r => r.ok ? r.json() : null).catch(() => null);
    const url = d?.data?.[0]?.images?.original?.url || null;
    if (url) return url;
  }
  const term = query.toLowerCase().match(/hug|kiss|kill|pat|slap|ship|bite|cuddle|punch|poke|highfive|wave|cry|dance|wink|smile|tickle|nom|reaction|meme|anime/)?.[0] || 'reaction';
  const endpoint = ({ kill: 'punch', highfive: 'wave', ship: 'waifu', reaction: 'waifu', meme: 'waifu', anime: 'waifu' })[term] || term;
  const d = await fetch(`https://nekos.best/api/v2/${endpoint}`, { signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : null).catch(() => null);
  return d?.results?.[0]?.url || null;
}
const pollButtons = poll => {
  const options = (poll.options || []).slice(0, 10);
  const rows = [];
  for (let start = 0; start < options.length; start += 5) {
    rows.push(new ActionRowBuilder().addComponents(...options.slice(start, start + 5).map((option, offset) => new ButtonBuilder()
      .setCustomId(`poll:vote:${poll.id}:${start + offset}`)
      .setLabel(`${start + offset + 1}. ${clean(option, 70)}`)
      .setStyle(ButtonStyle.Primary))));
  }
  return rows;
};
const pollCard = poll => {
  const votes = poll.votes || {};
  const counts = (poll.options || []).map((_, index) => Object.values(votes).filter(vote => Number(vote?.choice ?? -1) === index).length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  return card(`Poll · ${poll.id}`, `${poll.question}\n\n${(poll.options || []).map((option, index) => `**${index + 1}.** ${option} · **${counts[index]}** vote${counts[index] === 1 ? '' : 's'}`).join('\n')}\n\nTotal votes: **${total}**`, COLOURS.info, { image: embedAssetUrl(assetOnDisk(poll.imageAsset)) });
};
const pollFiles = poll => assetFiles(poll.imageAsset);
const refreshPoll = async (guildObject, poll) => {
  if (!poll.channelId || !poll.messageId) return;
  const channel = await guildObject.channels.fetch(poll.channelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(poll.messageId).catch(() => null) : null;
  if (message) await message.edit({ embeds: [pollCard(poll)], components: pollButtons(poll), files: pollFiles(poll), allowedMentions: { parse: [] } }).catch(() => {});
};
const suggestionCard = suggestion => {
  const status = suggestion.status || 'pending';
  const votes = suggestion.votes || { up: [], down: [] };
  return card('Suggestion · ' + suggestion.id, safeMentionText(suggestion.text) + '\n\n**Status:** ' + status[0].toUpperCase() + status.slice(1) + '\n**Support:** ' + (votes.up?.length || 0) + ' · **Oppose:** ' + (votes.down?.length || 0) + '\n\nSubmitted by <@' + suggestion.userId + '>', status === 'approved' ? COLOURS.success : status === 'denied' ? COLOURS.danger : COLOURS.info, { image: embedAssetUrl(assetOnDisk(suggestion.imageAsset)) });
};
const suggestionButtons = suggestion => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('suggestion:up:' + suggestion.id).setLabel('Support').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('suggestion:down:' + suggestion.id).setLabel('Oppose').setStyle(ButtonStyle.Secondary)
)];
const refreshSuggestion = async (guildObject, suggestion) => {
  if (!suggestion.channelId || !suggestion.messageId) return;
  const channel = await guildObject.channels.fetch(suggestion.channelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(suggestion.messageId).catch(() => null) : null;
  if (message) await message.edit({ embeds: [suggestionCard(suggestion)], files: assetFiles(suggestion.imageAsset), components: suggestionButtons(suggestion), allowedMentions: { parse: [] } }).catch(() => {});
};
const socialBase = social;
social = async function socialWithPolling(i,g){
  const n = i.options.getSubcommand();
  if (n === 'birthday') {
    g.birthdays ||= {};
    const date = i.options.getString('date', true).trim();
    if (!/^\d{1,2}[/-]\d{1,2}$/.test(date)) throw new Error('Use a day and month such as `25/12`.');
    const [day, month] = date.split(/[/-]/).map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error('That birthday date is not valid.');
    const previous = typeof g.birthdays[i.user.id] === 'object' ? g.birthdays[i.user.id] : {};
    g.birthdays[i.user.id] = { date: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`, channelId: i.options.getChannel('channel')?.id || previous.channelId || '', lastAnnounced: previous.lastAnnounced || '' };
    store.scheduleSave();
    return replyCard(i, 'Birthday saved', g.birthdays[i.user.id].channelId ? `Your birthday is recorded and announcements will be posted in <#${g.birthdays[i.user.id].channelId}> when the date arrives.` : 'Your birthday is recorded. Add an announcement channel if you want a public birthday card.', COLOURS.success, { ephemeral: true });
  }
  if (n === 'poll') {
    g.polls ||= {};
    const image = await uploadedAsset(i.options.getAttachment('image'), 'poll-image');
    const id = randomUUID().slice(0, 8);
    const question = i.options.getString('question', true).trim();
    const options = i.options.getString('options', true).split('|').map(value => value.trim()).filter(Boolean).slice(0, 10);
    if (options.length < 2) throw new Error('Provide at least two poll options separated with |.');
    const poll = g.polls[id] = { id, question, options, votes: {}, ownerId: i.user.id, at: Date.now(), imageAsset: image, channelId: i.channel.id, messageId: '' };
    const response = await i.reply({ embeds: [pollCard(poll)], files: pollFiles(poll), components: pollButtons(poll), allowedMentions: { parse: [] }, fetchReply: true });
    poll.messageId = response.id;
    store.scheduleSave();
    return response;
  }
  if (n === 'poll-vote') {
    const id = i.options.getString('id', true), poll = g.polls?.[id];
    if (!poll) throw new Error('Poll not found.');
    const choice = i.options.getInteger('choice', true) - 1;
    if (choice < 0 || choice >= poll.options.length) throw new Error(`Choose a number from 1 to ${poll.options.length}.`);
    poll.votes ||= {};
    poll.votes[i.user.id] = { choice, at: Date.now() };
    await refreshPoll(i.guild, poll);
    store.scheduleSave();
    return replyCard(i, 'Vote recorded', `Your vote for **${poll.question}** is recorded as **${poll.options[choice]}**.`, COLOURS.success, { ephemeral: true });
  }
  return socialBase(i,g);
};
const socialWithSuggestionsBase = social;
social = async function socialWithSuggestions(i, g) {
  const n = i.options.getSubcommand();
  g.suggestions ||= [];
  if (n === 'suggest') {
    const image = await uploadedAsset(i.options.getAttachment('image'), 'suggestion-image');
    const suggestion = { id: randomUUID().slice(0, 8), userId: i.user.id, text: i.options.getString('idea', true), at: Date.now(), imageAsset: image, status: 'pending', votes: { up: [], down: [] }, channelId: i.channel.id, messageId: '' };
    g.suggestions.unshift(suggestion);
    const response = await i.reply({ embeds: [suggestionCard(suggestion)], files: assetFiles(image), components: suggestionButtons(suggestion), allowedMentions: { users: [i.user.id] }, fetchReply: true });
    suggestion.messageId = response.id;
    store.scheduleSave();
    return response;
  }
  if (n === 'suggestions') {
    access(i, PermissionFlagsBits.ManageGuild);
    return replyCard(i, 'Suggestion review', list(g.suggestions.slice(0, 25).map(item => item.id + ' · ' + (item.status || 'pending') + ' · ' + clean(item.text, 140)), 'No suggestions have been submitted.'), COLOURS.info, { ephemeral: true });
  }
  if (n === 'suggestion-status') {
    access(i, PermissionFlagsBits.ManageGuild);
    const suggestion = g.suggestions.find(item => item.id === i.options.getString('id', true));
    if (!suggestion) throw new Error('Suggestion not found.');
    suggestion.status = i.options.getString('status', true);
    await refreshSuggestion(i.guild, suggestion);
    store.scheduleSave();
    return replyCard(i, 'Suggestion status updated', suggestion.id + ' is now **' + suggestion.status + '**.', COLOURS.success, { ephemeral: true });
  }
  if (n === 'suggestion-delete') {
    access(i, PermissionFlagsBits.ManageGuild);
    const index = g.suggestions.findIndex(item => item.id === i.options.getString('id', true));
    if (index < 0) throw new Error('Suggestion not found.');
    const [suggestion] = g.suggestions.splice(index, 1);
    const channel = await i.guild.channels.fetch(suggestion.channelId).catch(() => null);
    const message = channel?.isTextBased() ? await channel.messages.fetch(suggestion.messageId).catch(() => null) : null;
    await message?.delete().catch(() => {});
    store.scheduleSave();
    return replyCard(i, 'Suggestion deleted', 'The suggestion and its public card were removed.', COLOURS.warning, { ephemeral: true });
  }
  return socialWithSuggestionsBase(i, g);
};

const socialWithSuggestionsAndMarriageBase = social;
social = async function socialWithMarriageProfiles(i, g) {
  const n = i.options.getSubcommand();
  if (!['marriage-relationship', 'marriage-profile', 'marriage-profile-edit', 'marriage-profile-reset'].includes(n)) return socialWithSuggestionsAndMarriageBase(i, g);
  const pair = marriedPair(g, i.user.id);
  if (!pair) throw new Error('A shared couple profile is available only while you are married and the relationship remains mutual.');
  const requested = i.options.getUser('member')?.id || i.user.id;
  if (requested !== i.user.id && requested !== pair.spouseId) throw new Error('Couple profiles are private to the two married members.');
  const key = marriageKey(i.user.id, pair.spouseId);
  g.marriageProfiles ||= {};
  if (n === 'marriage-profile-edit') {
    const profile = g.marriageProfiles[key] ||= { title: '', bio: '', updatedAt: 0 };
    const image = await uploadedAsset(i.options.getAttachment('image'), 'marriage-photo');
    const thumbnail = await uploadedAsset(i.options.getAttachment('thumbnail'), 'marriage-thumbnail');
    if (i.options.getBoolean('remove_image')) delete profile.imageAsset;
    if (i.options.getBoolean('remove_thumbnail')) delete profile.thumbnailAsset;
    if (i.options.getString('title') !== null) profile.title = i.options.getString('title').trim();
    if (i.options.getString('bio') !== null) profile.bio = i.options.getString('bio').trim();
    if (image) profile.imageAsset = image;
    if (thumbnail) profile.thumbnailAsset = thumbnail;
    profile.updatedBy = i.user.id;
    profile.updatedAt = Date.now();
    store.scheduleSave();
  }
  if (n === 'marriage-profile-reset') {
    delete g.marriageProfiles[key];
    store.scheduleSave();
    return replyCard(i, 'Couple profile reset', 'The custom couple title, biography and media were removed.', COLOURS.warning, { ephemeral: true });
  }
  const left = await i.client.users.fetch(i.user.id).catch(() => ({ id: i.user.id, username: i.user.username, displayName: i.user.globalName || i.user.username }));
  const right = await i.client.users.fetch(pair.spouseId).catch(() => ({ id: pair.spouseId, username: pair.spouseId, displayName: pair.spouseId }));
  const profile = g.marriageProfiles[key] || {};
  const stats = marriageStats(i.user.id, pair.spouseId);
  return i.reply({ embeds: [marriageCard({ left, right, marriedAt: pair.marriedAt, profile, ...stats })], files: assetFiles(profile.imageAsset, profile.thumbnailAsset), flags: 64, allowedMentions: { users: [i.user.id, pair.spouseId] } });
};
const remindersTransactionalBase = reminders;
reminders = async function remindersTransactional(i, g) {
  const n = i.options.getSubcommand();
  if (!['create', 'edit'].includes(n)) return remindersTransactionalBase(i, g);
  const before = structuredClone(g.reminders);
  try {
    return await remindersTransactionalBase(i, g);
  } catch (error) {
    g.reminders = before;
    store.scheduleSave();
    throw error;
  }
};

async function economy(i,g){
  const n=i.options.getSubcommand(),r=row(g,i.user);g.economy ||= {quests:{},shop:[],inventory:{}};g.economy.quests ||= {};g.economy.inventory ||= {};if(!g.economy.shop?.length)g.economy.shop=g.shop?.length?g.shop:[{id:'badge',name:'Profile badge',price:500},{id:'boost',name:'Server boost token',price:1000}];g.shop=g.economy.shop;
  if(n==='balance')return replyCard(i,'Public balance',`You hold **${r.coins||0}** coins.`,COLOURS.success);
  if(n==='daily'){if(Date.now()-r.daily<86400000)throw new Error(`Next reward <t:${Math.floor((r.daily+86400000)/1000)}:R>.`);r.coins+=100;r.daily=Date.now();store.scheduleSave();return replyCard(i,'Daily reward','You received **100** coins.',COLOURS.success);}
  if(n==='pay'){const u=i.options.getUser('member',true),amount=i.options.getInteger('amount',true);if(u.id===i.user.id)throw new Error('Choose another member for a transfer.');if(r.coins<amount)throw new Error('Insufficient coins.');r.coins-=amount;row(g,u).coins+=amount;store.scheduleSave();return replyCard(i,'Transfer complete',`Transferred **${amount}** coins to <@${u.id}>.`,COLOURS.success,{allowedMentions:{users:[i.user.id,u.id]}});}
  if(n==='leaderboard')return replyCard(i,'Coin leaderboard',list(Object.values(g.xp).sort((a,b)=>(b.coins||0)-(a.coins||0)).slice(0,10).map((x,k)=>`**${k+1}.** <@${x.id}> · ${x.coins||0}`)),COLOURS.success);
  if(n==='quest'){const key=`${i.user.id}:${new Date().toISOString().slice(0,10)}`,entry=g.economy.quests[key]||={count:0,claimed:false};entry.count+=1;if(entry.count>=5&&!entry.claimed){entry.claimed=true;r.coins+=75;store.scheduleSave();return replyCard(i,'Quest complete','Your daily quest is complete. **75** coins have been added.',COLOURS.success);}store.scheduleSave();return replyCard(i,'Daily quest',`Progress: **${Math.min(5,entry.count)}/5** qualifying actions.`,COLOURS.info);}
  if(n==='checklist')return replyCard(i,'Public checklist','Use `/economy daily` for the daily reward, `/economy quest` to advance today’s quest, and `/economy balance` to view your balance.',COLOURS.info);
  if(n==='roll'){const sides=i.options.getInteger('sides',true),result=1+Math.floor(Math.random()*sides);return replyCard(i,'Dice roll',`You rolled **${result}** on a d${sides}.`,COLOURS.info);}
  if(n==='choose'){const raw=i.options.getString('choice',true),choices=raw.split('|').map(x=>x.trim()).filter(Boolean);return replyCard(i,'Choice',choices.length?`The result is **${choices[Math.floor(Math.random()*choices.length)]}**.`:'Provide choices separated by `|`.',COLOURS.info);}
  if(n==='coinflip'){const choice=i.options.getString('choice',true).toLowerCase(),result=Math.random()<.5?'heads':'tails';return replyCard(i,'Coin flip',`The coin shows **${result}**. ${['heads','tails'].includes(choice)?(choice===result?'You called it correctly.':'Your call was incorrect.'):'Choose heads or tails next time.'}`,choice===result?COLOURS.success:COLOURS.info);}
  if(n==='shop')return replyCard(i,'Public shop',g.economy.shop.map(x=>`**${x.id}** · ${x.name} · ${x.price} coins`).join('\n'),COLOURS.success);
  if(n==='buy'){const item=g.economy.shop.find(x=>x.id===i.options.getString('item',true));if(!item||r.coins<item.price)throw new Error('Shop item unavailable or balance too low.');r.coins-=item.price;g.economy.inventory[i.user.id]||=[];g.economy.inventory[i.user.id].push(item.id);store.scheduleSave();return replyCard(i,'Purchase complete',`You acquired **${item.name}**.`,COLOURS.success);}
  if(n==='slots'){const stake=i.options.getInteger('stake',true);if(r.coins<stake)throw new Error('You do not have enough coins for that stake.');const symbols=['◆','●','★','✦'],result=[0,1,2].map(()=>symbols[Math.floor(Math.random()*symbols.length)]),won=result.every(x=>x===result[0]),payout=won?stake*4:0;r.coins=r.coins-stake+payout;store.scheduleSave();return replyCard(i,'Slots',`${result.join('  ')}\n${won?`You won **${payout}** coins.`:`The stake of **${stake}** coins was lost.`}`,won?COLOURS.success:COLOURS.warning);}
  if(n==='blackjack'){const stake=i.options.getInteger('stake',true);if(r.coins<stake)throw new Error('You do not have enough coins for that stake.');const draw=()=>1+Math.floor(Math.random()*11),player=draw()+draw(),dealer=draw()+draw(),won=player<=21&&(dealer>21||player>dealer),push=player===dealer&&player<=21,payout=won?stake*2:push?stake:0;r.coins=r.coins-stake+payout;store.scheduleSave();return replyCard(i,'Blackjack',`Your hand: **${player}** · House: **${dealer}**\n${won?`You won **${payout}** coins.`:push?'The hand is a push.':`The stake of **${stake}** coins was lost.`}`,won?COLOURS.success:push?COLOURS.info:COLOURS.warning);}
  throw new Error('This economy action is not available.');
}

async function dispatch(i){const g=guild(i.guild.id),n=i.commandName,s=i.options.getSubcommand(false);if(!commandRuleAllowed(i,g))throw new Error(`This server has restricted /${n} in this channel or for your role.`);if(n==='help'){const c=i.options.getString('category');const text=c&&categories[c]?`**/${c}** · ${rootText[c]}\n${categories[c].join(' · ')}`:Object.entries(rootText).map(([k,v])=>`**/${k}** · ${v}\n${categories[k].join(' · ')}`).join('\n\n');return replyCard(i,'Public command catalogue',text,COLOURS.brand);}if(n==='moderation')return moderation(i,g);if(n==='levels')return levels(i,g);if(n==='reminders')return reminders(i,g);if(n==='social')return social(i,g);if(n==='media')return media(i);if(n==='automod'){access(i,PermissionFlagsBits.ManageGuild);const c=g.settings.automod;if(s==='status')return replyCard(i,'Automod status',`Enabled: **${c.enabled?'yes':'no'}** · links: **${c.links?'blocked':'allowed'}** · spam: **${c.spam?'blocked':'allowed'}**\nWords: ${c.words.length}`,COLOURS.info,{ephemeral:true});if(s==='enable'||s==='disable')c.enabled=s==='enable';if(s==='links')c.links=!c.links;if(s==='spam')c.spam=!c.spam;if(s==='caps')c.caps=!c.caps;if(s==='mentions')c.mentions=i.options.getInteger('limit',true);if(s==='word')c.words.push(i.options.getString('value',true).toLowerCase());if(s==='unword')c.words=c.words.filter(x=>x!==i.options.getString('value',true).toLowerCase());if(s==='exempt-channel'){c.exemptChannels ||= [];const id=i.options.getChannel('channel',true).id;if(!c.exemptChannels.includes(id))c.exemptChannels.push(id);}if(s==='exempt-channel-remove')c.exemptChannels=(c.exemptChannels||[]).filter(id=>id!==i.options.getChannel('channel',true).id);if(s==='exempt-role'){c.exemptRoles ||= [];const id=i.options.getRole('role',true).id;if(!c.exemptRoles.includes(id))c.exemptRoles.push(id);}if(s==='exempt-role-remove')c.exemptRoles=(c.exemptRoles||[]).filter(id=>id!==i.options.getRole('role',true).id);store.scheduleSave();return replyCard(i,'Automod updated','The safety setting was saved.',COLOURS.success,{ephemeral:true});}if(n==='economy')return economy(i,g);if(n==='emoji')return emoji(i,g);if(n==='tunnel')return tunnel(i,g);if(n==='music')return music(i,g);if(n==='giveaways')return giveaways(i,g);if(n==='events')return events(i,g);if(n==='utility')return utility(i,g);if(n==='server')return server(i,g);if(n==='welcome')return welcome(i,g);if(n==='roles')return roles(i,g);if(n==='tickets')return tickets(i,g);if(n==='feeds')return feeds(i,g);if(n==='forms')return forms(i,g);if(n==='automation')return automation(i,g);throw new Error('This category is not available.');}

async function emoji(i,g){const n=i.options.getSubcommand(),v=i.options.getString('value');if(n==='list')return replyCard(i,'Server expressions',`Emoji: ${i.guild.emojis.cache.size}\nStickers: ${i.guild.stickers.cache.size}`,COLOURS.info);if(n==='export'){const rows=[...[...i.guild.emojis.cache.values()].map(x=>`${x.animated?'a':''}:${x.name}:${x.id}`),...[...i.guild.stickers.cache.values()].map(x=>`sticker:${x.name}:${x.id}`)];return i.reply({embeds:[card('Server expressions export',`The export contains **${rows.length}** emoji and sticker record(s). A text copy is attached for staff use.`,COLOURS.info)],files:[{attachment:Buffer.from(`${rows.join('\n')}\n`,'utf8'),name:`expressions-${i.guild.id}.txt`}],flags:64,allowedMentions:{parse:[]}});}if(n==='snipe'){access(i,PermissionFlagsBits.ManageGuild);return replyCard(i,'Emoji audit',list(g.audit.filter(x=>x.event==='emoji-copy').map(x=>x.detail),'No emoji records.'),COLOURS.info,{ephemeral:true});}const m=String(v||'').match(/<a?:([\w~]+):(\d{15,22})>/),id=m?.[2]||String(v||'').match(/\d{15,22}/)?.[0],oldEmoji=id?i.guild.emojis.cache.get(id):null,oldSticker=id?i.guild.stickers.cache.get(id):null;if(n==='info'){const old=oldEmoji||oldSticker;return replyCard(i,'Expression information',old?`**${old.name}** · ${old.id}\n${old.url}`:'Expression not found in this server.',COLOURS.info);}access(i,PermissionFlagsBits.ManageGuild);const explicitUrl=/^https:\/\//.test(v||'')?v:null,extension=m?.[0]?.startsWith('<a:')?'gif':'png',url=n==='sticker-copy'?(oldSticker?.url||explicitUrl||(id?`https://media.discordapp.net/stickers/${id}.png?size=512`:null)):(oldEmoji?.url||explicitUrl||(id?`https://cdn.discordapp.com/emojis/${id}.${extension}?size=128&quality=lossless`:null));if(!url)throw new Error('Provide a Discord markup, ID, or HTTPS media URL.');if(n==='copy'){access(i,PermissionFlagsBits.CreateGuildExpressions);const created=await i.guild.emojis.create({attachment:url,name:(m?.[1]||`shared_${Date.now()}`).replace(/[^a-zA-Z0-9_]/g,'_').slice(0,32)});g.audit.unshift({event:'emoji-copy',detail:`Copied ${created.name}`,at:Date.now()});store.scheduleSave();return replyCard(i,'Emoji copied',`Uploaded ${created}.`,COLOURS.success,{ephemeral:true});}access(i,PermissionFlagsBits.CreateGuildExpressions);const created=await i.guild.stickers.create({file:url,name:`shared_${Date.now()}`,description:'Imported sticker',tags:'import'});return replyCard(i,'Sticker copied',`Uploaded **${created.name}**.`,COLOURS.success,{ephemeral:true});}
const emojiBase = emoji;
emoji = async function emojiWithCardExport(i, g) {
  if (i.options.getSubcommand() !== 'export') return emojiBase(i, g);
  const rows = [
    ...[...i.guild.emojis.cache.values()].map(x => `${x.animated ? 'a' : ''}:${x.name}:${x.id}`),
    ...[...i.guild.stickers.cache.values()].map(x => `sticker:${x.name}:${x.id}`)
  ];
  const pages = Math.max(1, Math.ceil(rows.length / 35));
  const page = 0;
  const chunk = rows.slice(0, 35);
  return i.reply({ embeds: [card('Server expressions', chunk.length ? chunk.join('\n') : 'No custom emoji are configured.', COLOURS.info, { footer: `Page ${page + 1} of ${pages}` })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('emoji-export:prev:0').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(true), new ButtonBuilder().setCustomId(`emoji-export:next:${Math.min(pages - 1, 1)}`).setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(pages <= 1))], flags: 64, allowedMentions: { parse: [] } });
};
const eventButtons = event => {
  const capacity = Number(event.capacity || 0);
  const full = capacity > 0 && (event.attendees?.length || 0) >= capacity;
  const label = full ? `Join waitlist · ${(event.waitlist || []).length}` : `RSVP · ${(event.attendees || []).length}${capacity ? `/${capacity}` : ''}`;
  return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`event:rsvp:${event.id}`).setLabel(label).setStyle(full ? ButtonStyle.Secondary : ButtonStyle.Primary))];
};
const eventListComponents = events => {
  const options = events.slice(0, 25).map(event => new StringSelectMenuOptionBuilder()
    .setLabel(clean(`${event.title || 'Event'} · ${event.id}`, 100))
    .setValue(event.id)
    .setDescription(clean(`<t:${Math.floor(Number(event.startsAt || Date.now()) / 1000)}:R> · ${(event.attendees || []).length} attending`, 100)));
  return options.length ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('event:select').setPlaceholder('Select an event to view or RSVP').addOptions(options))] : [];
};
const eventRole = (server, event) => event.attendeeRoleId ? server.roles.cache.get(event.attendeeRoleId) : null;
const setEventRole = async (server, event, userId, enabled) => {
  const role = eventRole(server, event);
  if (!role?.editable) return;
  const member = await server.members.fetch(userId).catch(() => null);
  if (!member) return;
  if (enabled) await member.roles.add(role).catch(() => {});
  else await member.roles.remove(role).catch(() => {});
};
const refreshEventMessage = async (server, event) => {
  if (!event.channelId || !event.messageId) return null;
  const channel = await server.channels.fetch(event.channelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(event.messageId).catch(() => null) : null;
  if (!message) return null;
  await message.edit({embeds:[eventCard(event)],files:assetFiles(event.imageAsset,event.thumbnailAsset),components:event.status==='cancelled'?[]:eventButtons(event),allowedMentions:{parse:[]}}).catch(() => {});
  return message;
};
const eventFromOptions = async (i, old = null) => {
  const event = structuredClone(old || { id: randomUUID().slice(0, 8), hostId: i.user.id, attendees: [], waitlist: [], attendeeRoleId: '', reminderSent: false, status: 'active', channelId: i.channel.id, messageId: '' });
  event.title = i.options.getString('title') || event.title;
  event.description = i.options.getString('description') ?? event.description ?? '';
  if (i.options.getString('time')) { event.startsAt = parseAt(i.options.getString('time')); event.reminderSent = false; }
  event.color = parseColour(i.options.getString('color'), event.color || COLOURS.info);
  if (i.options.getString('footer') !== null) event.footer = i.options.getString('footer');
  if (i.options.getBoolean('timestamp') !== null) event.showTimestamp = i.options.getBoolean('timestamp');
  if (i.options.getInteger('capacity') !== null) event.capacity = i.options.getInteger('capacity');
  if (i.options.getBoolean('clear_restricted_role')) delete event.restrictedRoleId;
  else if (i.options.getRole('restricted_role')) event.restrictedRoleId = i.options.getRole('restricted_role').id;
  if (i.options.getInteger('reminder_minutes') !== null) event.reminderMinutes = i.options.getInteger('reminder_minutes');
  if (i.options.getBoolean('remove_image')) delete event.imageAsset;
  if (i.options.getBoolean('remove_thumbnail')) delete event.thumbnailAsset;
  const image = await uploadedAsset(i.options.getAttachment('image'), 'event-image');
  const thumbnail = await uploadedAsset(i.options.getAttachment('thumbnail'), 'event-thumbnail');
  if (image) event.imageAsset = image;
  if (thumbnail) event.thumbnailAsset = thumbnail;
  event.waitlist ||= [];
  event.status ||= 'active';
  event.reminderMinutes ??= 60;
  return event;
};
async function events(i,g){
  g.events ||= [];
  for (const event of g.events) { event.attendees ||= []; event.waitlist ||= []; event.status ||= 'active'; event.reminderMinutes ??= 60; }
  const n = i.options.getSubcommand();
  if (n === 'create') {
    access(i, PermissionFlagsBits.ManageGuild);
    if (!i.options.getString('title') || !i.options.getString('time')) throw new Error('Provide an event title and a future time.');
    parseAt(i.options.getString('time', true));
    const x = await eventFromOptions(i);
    if (!x.title || !x.startsAt || x.startsAt <= Date.now()) throw new Error('Provide an event title and a future time.');
    g.events.push(x);
    const response = await i.reply({embeds:[eventCard(x)],files:assetFiles(x.imageAsset,x.thumbnailAsset),components:eventButtons(x),allowedMentions:{parse:[]},fetchReply:true});
    x.messageId = response.id;
    store.scheduleSave();
    return response;
  }
  if (n === 'list') {
    const rows = g.events.filter(x => x.status !== 'cancelled' && x.startsAt > Date.now()).slice(0, 10);
    if (!rows.length) return replyCard(i, 'Upcoming events', 'No active future events are scheduled.', COLOURS.info);
    if (rows.length === 1) return i.reply({embeds:[eventCard(rows[0])],files:assetFiles(rows[0].imageAsset,rows[0].thumbnailAsset),components:eventButtons(rows[0]),allowedMentions:{parse:[]}});
    return i.reply({embeds:[card('Upcoming events', rows.map(x=>`**${x.id}** · **${clean(x.title,100)}** · <t:${Math.floor(x.startsAt/1000)}:R> · ${(x.attendees||[]).length}${x.capacity?`/${x.capacity}`:''} attending`).join('\n'), COLOURS.info)],components:eventListComponents(rows),allowedMentions:{parse:[]} });
  }
  const x = g.events.find(z => z.id === i.options.getString('id'));
  if (!x) throw new Error('Event not found.');
  if (n === 'edit') {
    access(i, PermissionFlagsBits.ManageGuild);
    const updated = await eventFromOptions(i, x);
    if (!updated.startsAt || updated.startsAt <= Date.now()) throw new Error('An edited event must have a future time.');
    Object.assign(x, updated);
    await refreshEventMessage(i.guild, x);
    store.scheduleSave();
    return i.reply({embeds:[eventCard(x)],files:assetFiles(x.imageAsset,x.thumbnailAsset),components:eventButtons(x),allowedMentions:{parse:[]}});
  }
  if (n === 'rsvp') {
    if (x.status === 'cancelled' || x.startsAt < Date.now()) throw new Error('This event is no longer accepting RSVPs.');
    if (x.restrictedRoleId && !i.member?.roles?.cache?.has(x.restrictedRoleId)) throw new Error('You do not have the role required for this event.');
    const index = x.attendees.indexOf(i.user.id);
    if (index >= 0) {
      x.attendees.splice(index, 1);
      x.waitlist = (x.waitlist || []).filter(id => id !== i.user.id);
      await setEventRole(i.guild, x, i.user.id, false);
      let promotedId = '';
      while (x.waitlist.length && !promotedId) {
        const candidateId = x.waitlist.shift();
        const candidate = await i.guild.members.fetch(candidateId).catch(() => null);
        if (!candidate || (x.restrictedRoleId && !candidate.roles.cache.has(x.restrictedRoleId))) continue;
        promotedId = candidateId;
        x.attendees.push(candidateId);
        await setEventRole(i.guild, x, candidateId, true);
      }
      store.scheduleSave();
      await refreshEventMessage(i.guild, x);
      return replyCard(i, 'RSVP withdrawn', `You are no longer attending **${x.title}**.${promotedId ? ` <@${promotedId}> has been promoted from the waitlist.` : ''}`, COLOURS.info, { ephemeral: true, allowedMentions: promotedId ? { users: [promotedId] } : { parse: [] } });
    }
    const capacity = Number(x.capacity || 0);
    if (capacity > 0 && x.attendees.length >= capacity) {
      if (!(x.waitlist || []).includes(i.user.id)) x.waitlist.push(i.user.id);
      store.scheduleSave();
      await refreshEventMessage(i.guild, x);
      return replyCard(i, 'Added to the waitlist', `The event is full. You are **${x.waitlist.indexOf(i.user.id) + 1}** on the waitlist.`, COLOURS.warning, { ephemeral: true });
    }
    x.attendees.push(i.user.id);
    x.waitlist = (x.waitlist || []).filter(id => id !== i.user.id);
    await setEventRole(i.guild, x, i.user.id, true);
    store.scheduleSave();
    await refreshEventMessage(i.guild, x);
    return replyCard(i, 'RSVP recorded', `You are attending **${x.title}**.`, COLOURS.success, { ephemeral: true });
  }
  access(i, PermissionFlagsBits.ManageGuild);
  if (n === 'attendee-role') { const previousRoleId = x.attendeeRoleId || ''; x.attendeeRoleId = i.options.getRole('role')?.id || ''; for (const attendee of x.attendees || []) { if (previousRoleId && previousRoleId !== x.attendeeRoleId) { const previousRole = i.guild.roles.cache.get(previousRoleId); const member = await i.guild.members.fetch(attendee).catch(() => null); if (previousRole?.editable && member) await member.roles.remove(previousRole).catch(() => {}); } await setEventRole(i.guild, x, attendee, Boolean(x.attendeeRoleId)); } store.scheduleSave(); return replyCard(i, 'Attendee role saved', x.attendeeRoleId ? `Current and future attendees will receive <@&${x.attendeeRoleId}> when they RSVP.` : 'The attendee role was removed from future RSVPs; existing role assignments were also cleared where Discord permits.', COLOURS.success, { ephemeral: true }); }
  if (n === 'cancel') { x.status = 'cancelled'; for (const attendee of x.attendees || []) await setEventRole(i.guild, x, attendee, false); await refreshEventMessage(i.guild, x); }
  else if (n === 'announce') await i.channel.send({embeds:[eventCard(x)],files:assetFiles(x.imageAsset,x.thumbnailAsset),components:eventButtons(x),allowedMentions:{users:x.attendees}});
  store.scheduleSave();
  return replyCard(i, n === 'cancel' ? 'Event cancelled' : 'Event announced', n === 'cancel' ? 'The event card was marked as cancelled.' : 'The event card was published with its RSVP control.', COLOURS.success, { ephemeral: true });
}
const eventsWithButtonBase = events;
events = async function eventsWithButtons(i, g) {
  return eventsWithButtonBase(i, g);
};
const giveawayListComponents = giveaways => {
  const options = giveaways.slice(0, 25).map(giveaway => new StringSelectMenuOptionBuilder()
    .setLabel(clean(`${giveaway.prize || 'Giveaway'} · ${giveaway.id}`, 100))
    .setValue(giveaway.id)
    .setDescription(clean(`<t:${Math.floor(Number(giveaway.endsAt || Date.now()) / 1000)}:R> · ${giveaway.entries?.length || 0} entries`, 100)));
  return options.length ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('giveaway:select').setPlaceholder('Select a giveaway to enter or inspect').addOptions(options))] : [];
};
const giveawayEntryComponents = giveaway => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway:' + giveaway.id).setLabel('Enter giveaway').setStyle(ButtonStyle.Primary))];
const refreshGiveawayMessage = async (server, giveaway) => {
  if (!giveaway.channelId || !giveaway.messageId) return null;
  const channel = await server.channels.fetch(giveaway.channelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(giveaway.messageId).catch(() => null) : null;
  if (!message) return null;
  await message.edit({ embeds: [giveawayCard(giveaway)], files: assetFiles(giveaway.imageAsset, giveaway.thumbnailAsset), components: giveaway.ended ? [] : giveawayEntryComponents(giveaway), allowedMentions: { parse: [] } }).catch(() => {});
  return message;
};
async function giveaways(i,g){
  const n=i.options.getSubcommand();g.giveaways||=[];
  const eligible=(x,member)=>{if(!member)return false;if(x.requiredRoleId&&!member.roles?.cache?.has(x.requiredRoleId))return false;if(x.blockedRoleId&&member.roles?.cache?.has(x.blockedRoleId))return false;if(x.minimumLevel!=null&&level(row(g,member.user).xp)<x.minimumLevel)return false;if(x.accountAgeDays&&member.user.createdTimestamp>Date.now()-x.accountAgeDays*86400000)return false;if(x.serverAgeDays&&member.joinedTimestamp&&member.joinedTimestamp>Date.now()-x.serverAgeDays*86400000)return false;return true;};
  const addEntry=(x,member)=>{x.entries||=[];x.entryCounts||={};const maximum=Math.max(1,Number(x.maxEntries||1)),count=Number(x.entryCounts[member.id]||0);if(count>=maximum)return false;const requested=count===0?1+(member.roles?.cache?.has(x.bonusRoleId)?(x.bonusEntries||0):0):1,amount=Math.min(requested,maximum-count);if(amount<1)return false;x.entryCounts[member.id]=count+amount;for(let k=0;k<amount;k++)x.entries.push(member.id);return true;};
  if(n==='create'){
    access(i,PermissionFlagsBits.ManageGuild);const image=await uploadedAsset(i.options.getAttachment('image'),'giveaway-image'),thumbnail=await uploadedAsset(i.options.getAttachment('thumbnail'),'giveaway-thumbnail'),requiredRole=i.options.getRole('required_role'),blockedRole=i.options.getRole('blocked_role'),winnerRole=i.options.getRole('winner_role'),bonusRole=i.options.getRole('bonus_role'),pingRole=i.options.getRole('ping_role');
    const x={id:randomUUID().slice(0,8),channelId:i.channel.id,prize:i.options.getString('prize',true),description:i.options.getString('description')||'',endsAt:Date.now()+i.options.getInteger('minutes',true)*60000,winners:i.options.getInteger('winners')||1,hostId:i.user.id,entries:[],entryCounts:{},ended:false,requiredRoleId:requiredRole?.id||'',blockedRoleId:blockedRole?.id||'',winnerRoleId:winnerRole?.id||'',minimumLevel:i.options.getInteger('minimum_level'),requirement:i.options.getString('requirement')||'',accountAgeDays:i.options.getInteger('account_age_days')||0,serverAgeDays:i.options.getInteger('server_age_days')||0,bonusRoleId:bonusRole?.id||'',bonusEntries:i.options.getInteger('bonus_entries')||0,maxEntries:i.options.getInteger('max_entries')||1,pingRoleId:pingRole?.id||'',dmWinners:i.options.getBoolean('dm_winners')??false,hideRequirements:i.options.getBoolean('hide_requirements')??false,color:parseColour(i.options.getString('color'),COLOURS.warning),footer:i.options.getString('footer')||'',imageAsset:image,thumbnailAsset:thumbnail};
    g.giveaways.push(x);const response=await i.reply({embeds:[giveawayCard(x)],files:assetFiles(image,thumbnail),components:giveawayEntryComponents(x),fetchReply:true});x.messageId=response.id;store.scheduleSave();return response;
  }
  if(n==='list'){const rows=g.giveaways.filter(x=>!x.ended).slice(0,25);if(!rows.length)return replyCard(i,'Giveaways','No active giveaways are running.',COLOURS.info);if(rows.length===1)return i.reply({embeds:[giveawayCard(rows[0])],files:assetFiles(rows[0].imageAsset,rows[0].thumbnailAsset),components:giveawayEntryComponents(rows[0]),allowedMentions:{parse:[]}});return i.reply({embeds:[card('Active giveaways',rows.map(x=>`**${x.id}** · **${clean(x.prize,100)}** · ends <t:${Math.floor(x.endsAt/1000)}:R> · ${x.entries?.length||0} entries`).join('\n'),COLOURS.warning)],components:giveawayListComponents(rows),allowedMentions:{parse:[]}});}
  const x=g.giveaways.find(z=>z.id===i.options.getString('id',true));if(!x)throw new Error('Giveaway not found.');
  if(n==='status')return i.reply({embeds:[giveawayCard(x)],files:assetFiles(x.imageAsset,x.thumbnailAsset),allowedMentions:{parse:[]},flags:64});
  if(n==='enter'){if(x.ended)throw new Error('That giveaway has ended.');if(!eligible(x,i.member))throw new Error('You do not meet this giveaway’s eligibility requirements.');if(!addEntry(x,i.member))throw new Error('You have reached the entry limit for this giveaway.');store.scheduleSave();return replyCard(i,'Entry recorded','Your entry for **'+x.prize+'** is recorded.',COLOURS.success,{ephemeral:true});}
  access(i,PermissionFlagsBits.ManageGuild);if(n==='reroll'){if(!x.ended)throw new Error('End the giveaway before rerolling.');const previous=new Set(x.winnerIds||[]),candidates=x.entries.filter(id=>!previous.has(id));x.winnerIds=candidates.sort(()=>Math.random()-.5).slice(0,x.winners);store.scheduleSave();return replyCard(i,'Giveaway rerolled',x.winnerIds.length?x.winnerIds.map(id=>'<@'+id+'>').join(', '):'No unused eligible entries remain.',COLOURS.success);}
  if(x.ended)throw new Error('That giveaway has already ended.');x.ended=true;const eligibleWinners=await chooseGiveawayWinners(i.guild,g,x);const winnerText=x.winnerIds.length?x.winnerIds.map(id=>'<@'+id+'>').join(', '):'No eligible entries.';const rolePing=x.pingRoleId?'<@&'+x.pingRoleId+'>':undefined;await refreshGiveawayMessage(i.guild,x);await i.channel.send({content:rolePing,embeds:[giveawayCard(x),card('Giveaway result',winnerText,COLOURS.success)],files:assetFiles(x.imageAsset,x.thumbnailAsset),allowedMentions:{users:x.winnerIds,roles:x.pingRoleId?[x.pingRoleId]:[]}}).catch(()=>{});if(x.dmWinners){for(const item of eligibleWinners.slice(0,x.winners||1))await item.member.send({embeds:[card('Giveaway won',`You won **${x.prize}** in **${i.guild.name}**.`,COLOURS.success)],allowedMentions:{parse:[]}}).catch(()=>{});}store.scheduleSave();return replyCard(i,'Giveaway ended',winnerText,COLOURS.success,{ephemeral:true});
}
async function resolveTrack(query){const value=String(query||'').trim();if(!value)throw new Error('Provide a search term or a supported music URL.');if(/^https?:\/\//i.test(value))return {title:value, url:value, query:value};const results=await play.search(value,{limit:1});const hit=results?.[0];if(!hit?.url)throw new Error('No playable result was found.');return {title:hit.title||value,url:hit.url,thumbnail:hit.thumbnails?.[0]?.url||'',query:value};}
async function resolveAutoplayTrack(query,currentUrl){const value=String(query||'').trim();if(!value||/^https?:\/\//i.test(value))return null;const results=await play.search(value,{limit:5});const hit=results?.find(item=>item?.url&&item.url!==currentUrl)||results?.[0];return hit?.url?{title:hit.title||value,url:hit.url,thumbnail:hit.thumbnails?.[0]?.url||'',query:value}:null;}
async function playMusicTrack(server,g,track){
  const voice=server.channels.cache.get(track.voiceChannelId);
  if(!voice?.isVoiceBased())throw new Error('Join a voice channel before starting music.');
  let session=musicSessions.get(server.id);
  if(!session||session.voiceChannelId!==voice.id){
    session?.connection?.destroy();
    const connection=joinVoiceChannel({channelId:voice.id,guildId:server.id,adapterCreator:server.voiceAdapterCreator});
    const player=createAudioPlayer({behaviors:{noSubscriber:NoSubscriberBehavior.Pause}});
    connection.subscribe(player);
    session={connection,player,voiceChannelId:voice.id,manualSkip:false,resource:null};
    musicSessions.set(server.id,session);
    connection.on(VoiceConnectionStatus.Disconnected,()=>{void entersState(connection,VoiceConnectionStatus.Signalling,5000).catch(()=>{if(!g.music.twentyFourSeven)connection.destroy();});});
    player.on(AudioPlayerStatus.Idle,()=>{
      if(session.manualSkip){session.manualSkip=false;return;}
      if(g.music.loop&&g.music.nowPlaying){void playMusicTrack(server,g,g.music.nowPlaying).catch(()=>{});return;}
      const next=g.music.queue.shift();
      if(next){g.music.nowPlaying=next;void playMusicTrack(server,g,next).catch(()=>{g.music.nowPlaying=null;store.scheduleSave();});return;}
      if(g.music.autoplay&&g.music.lastQuery){
        const currentUrl=g.music.nowPlaying?.url;
        void resolveAutoplayTrack(g.music.lastQuery,currentUrl).then(auto=>{
          if(!auto){g.music.nowPlaying=null;return;}
          auto.id=randomUUID();auto.requestedBy=client.user?.id||'';auto.voiceChannelId=voice.id;g.music.nowPlaying=auto;
          return playMusicTrack(server,g,auto);
        }).catch(()=>{g.music.nowPlaying=null;}).finally(()=>store.scheduleSave());
        return;
      }
      g.music.nowPlaying=null;if(!g.music.twentyFourSeven)musicSessions.delete(server.id);store.scheduleSave();
    });
  }
  const stream=await play.stream(track.url,{quality:2,discordPlayerCompatibility:true});
  const resource=createAudioResource(stream.stream,{inputType:stream.type,inlineVolume:true});
  resource.volume?.setVolume(Math.max(0,Math.min(2,(Number(g.music.volume)||100)/100)));
  session.resource=resource;session.player.play(resource);g.music.nowPlaying=track;g.music.lastQuery=track.query||track.title||'';store.scheduleSave();
}
async function music(i,g){
  const n=i.options.getSubcommand(),m=g.music;m.queue||=[];
  if(n==='play'){const voice=i.member?.voice?.channel;if(!voice)throw new Error('Join a voice channel before using music.');const track={id:randomUUID(),...(await resolveTrack(i.options.getString('query',true))),requestedBy:i.user.id,voiceChannelId:voice.id};const liveSession=musicSessions.get(i.guild.id);if(m.nowPlaying&&liveSession){m.queue.push(track);store.scheduleSave();return i.reply({embeds:[nowPlayingCard(m.nowPlaying,m.queue)],allowedMentions:{parse:[]}});}if(m.nowPlaying&&!liveSession)m.nowPlaying=null;await playMusicTrack(i.guild,g,track);return i.reply({embeds:[nowPlayingCard(m.nowPlaying,m.queue)],allowedMentions:{parse:[]}});}
  if(n==='queue')return replyCard(i,'Music queue',list(m.queue.map((x,k)=>`${k+1}. ${x.title}`)),COLOURS.music);
  if(n==='clear'){const permitted=!m.djRoleId||i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)||i.member?.roles?.cache?.has(m.djRoleId);if(!permitted)throw new Error('This server requires the configured DJ role for player controls.');m.queue=[];store.scheduleSave();return replyCard(i,'Music queue cleared','All waiting tracks were removed.',COLOURS.music,{ephemeral:true});}
  if(n==='shuffle'){const permitted=!m.djRoleId||i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)||i.member?.roles?.cache?.has(m.djRoleId);if(!permitted)throw new Error('This server requires the configured DJ role for player controls.');for(let index=m.queue.length-1;index>0;index-=1){const swap=Math.floor(Math.random()*(index+1));[m.queue[index],m.queue[swap]]=[m.queue[swap],m.queue[index]];}store.scheduleSave();return replyCard(i,'Music queue shuffled',`${m.queue.length} queued track(s) were rearranged.`,COLOURS.music,{ephemeral:true});}
  if(n==='leave'){const permitted=!m.djRoleId||i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)||i.member?.roles?.cache?.has(m.djRoleId);if(!permitted)throw new Error('This server requires the configured DJ role for player controls.');const session=musicSessions.get(i.guild.id);m.queue=[];m.nowPlaying=null;session?.connection?.destroy();musicSessions.delete(i.guild.id);store.scheduleSave();return replyCard(i,'Music disconnected','The player left the voice channel and cleared its queue.',COLOURS.music,{ephemeral:true});}
  if(n==='now')return i.reply({embeds:[nowPlayingCard(m.nowPlaying,m.queue)]});
  if(n==='settings'){access(i,PermissionFlagsBits.ManageGuild);if(i.options.getBoolean('clear_dj'))m.djRoleId='';else if(i.options.getRole('dj_role'))m.djRoleId=i.options.getRole('dj_role').id;store.scheduleSave();return replyCard(i,'Music settings saved',m.djRoleId?`DJ access is limited to <@&${m.djRoleId}>.`:'DJ role access is not configured.',COLOURS.music,{ephemeral:true});}
  if(['loop','autoplay','247'].includes(n)){const permitted=!m.djRoleId||i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)||i.member?.roles?.cache?.has(m.djRoleId);if(!permitted)throw new Error('This server requires the configured DJ role for player settings.');const enabled=i.options.getBoolean('enabled')??!(n==='loop'?m.loop:n==='autoplay'?m.autoplay:m.twentyFourSeven);if(n==='loop')m.loop=enabled;if(n==='autoplay')m.autoplay=enabled;if(n==='247')m.twentyFourSeven=enabled;store.scheduleSave();return replyCard(i,'Music setting updated',`${n}: **${enabled?'enabled':'disabled'}**.`,COLOURS.music,{ephemeral:true});}
  if(['skip','pause','resume','stop','volume'].includes(n)){const permitted=!m.djRoleId||i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)||i.member?.roles?.cache?.has(m.djRoleId);if(!permitted)throw new Error('This server requires the configured DJ role for player controls.');const session=musicSessions.get(i.guild.id);if(n==='skip'){if(session)session.manualSkip=true;session?.player.stop(true);const next=m.queue.shift()||null;m.nowPlaying=next;if(next)await playMusicTrack(i.guild,g,next);}if(n==='pause')session?.player.pause();if(n==='resume')session?.player.unpause();if(n==='stop'){m.queue=[];m.nowPlaying=null;if(session){session.manualSkip=true;session.player.stop(true);session.connection.destroy();}musicSessions.delete(i.guild.id);}if(n==='volume'){m.volume=i.options.getInteger('value',true);session?.resource?.volume?.setVolume(Math.max(0,Math.min(2,m.volume/100)));}store.scheduleSave();return replyCard(i,'Music updated',`Player action: **${n}**.`,COLOURS.music);}
  return replyCard(i,'Lyrics search',`https://www.google.com/search?q=${encodeURIComponent(`${m.nowPlaying?.title||''} lyrics`)}`,COLOURS.music);
}

async function utility(i,g){const n=i.options.getSubcommand();if(n==='ping')return replyCard(i,'Gateway status',`${client.ws.ping}ms`,COLOURS.info);if(n==='botinfo')return replyCard(i,'Discord Bot','A public modular Discord bot with grouped commands, durable state, privacy-aware permissions, level cards, reminders, media, music and moderation.',COLOURS.brand);if(n==='serverinfo')return replyCard(i,'Server information',`${i.guild.name}\nMembers: ${i.guild.memberCount}\nChannels: ${i.guild.channels.cache.size}\nRoles: ${i.guild.roles.cache.size}`,COLOURS.info);const u=i.options.getUser('member')||i.user;if(n==='avatar')return replyCard(i,`Avatar · ${u.username}`,'The selected member’s current Discord avatar.',COLOURS.info,{image:u.displayAvatarURL({extension:'png',size:1024})});if(n==='userinfo')return replyCard(i,`User information · ${u.username}`,`ID: ${u.id}\nCreated: <t:${Math.floor(u.createdTimestamp/1000)}:F>`,COLOURS.info,{thumbnail:u.displayAvatarURL({extension:'png',size:256})});if(n==='channelinfo'){const c=i.options.getChannel('channel')||i.channel;return replyCard(i,'Channel information',`${c.name}\nID: ${c.id}\nType: ${c.type}`,COLOURS.info);}const r=i.options.getRole('role',true);return replyCard(i,'Role information',`${r.name}\nMembers: ${r.members.size}\nManaged: ${r.managed?'yes':'no'}`,COLOURS.info);}
const utilityBase = utility;
utility = async function utilityWithInvite(i,g){const n=i.options.getSubcommand();if(n==='invite')return replyCard(i,'Invite the bot',`[Add the bot to a server](${client.generateInvite({scopes:['bot','applications.commands'],permissions:['ViewChannel','SendMessages','EmbedLinks','ReadMessageHistory','ManageMessages','ManageChannels','ManageRoles','ManageGuild','Connect','Speak']})})`,COLOURS.brand);if(n==='info')return replyCard(i,'Server information',`${i.guild.name}\nMembers: ${i.guild.memberCount}\nChannels: ${i.guild.channels.cache.size}\nRoles: ${i.guild.roles.cache.size}`,COLOURS.info);return utilityBase(i,g);};
async function server(i,g){const n=i.options.getSubcommand();if(n==='info')return utility(Object.assign(i,{commandName:'utility'}),g);access(i,PermissionFlagsBits.ManageGuild);if(n==='permissions')return replyCard(i,'Permission readiness','View Channels · Send Messages · Embed Links · Read Message History · Manage Messages · Manage Roles · Manage Expressions · Connect · Speak',COLOURS.info,{ephemeral:true});if(n==='audit')return replyCard(i,'Recent audit entries',list(g.audit.slice(0,20).map(x=>`${x.event} · ${x.detail}`)),COLOURS.info,{ephemeral:true});if(n==='backup'){const f=await store.backup(`guild-${i.guild.id}`);return replyCard(i,'State backup created',path.basename(f),COLOURS.success,{ephemeral:true});}if(n==='prefix'){g.settings.prefix=i.options.getString('value',true);store.scheduleSave();return replyCard(i,'Prefix saved',`Normal-message actions use **${g.settings.prefix}**.`,COLOURS.success,{ephemeral:true});}if(n==='logs'){const s=g.settings.logs||={enabled:false,channelId:'',events:[]};s.enabled=i.options.getBoolean('enabled')??s.enabled;s.channelId=i.options.getChannel('channel')?.id||s.channelId;s.events=(i.options.getString('events')||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);store.scheduleSave();return replyCard(i,'Logging settings saved',`Logging is **${s.enabled?'enabled':'disabled'}**${s.channelId?` in <#${s.channelId}>`:''}. Events: ${s.events.length?s.events.join(', '):'all'}.`,COLOURS.success,{ephemeral:true});}if(n==='command-rules'){const selected=i.options.getString('command');const names=selected?[selected.replace(/^\//,'').toLowerCase()]:Object.keys(g.settings.commandRules||{});const text=names.filter(name=>g.settings.commandRules?.[name]).map(name=>{const rule=g.settings.commandRules[name];return `/${name} · allow roles: ${rule.allowRoles?.length?rule.allowRoles.map(id=>`<@&${id}>`).join(', '):'none'} · deny roles: ${rule.denyRoles?.length?rule.denyRoles.map(id=>`<@&${id}>`).join(', '):'none'} · allow channels: ${rule.allowChannels?.length?rule.allowChannels.map(id=>`<#${id}>`).join(', '):'none'} · deny channels: ${rule.denyChannels?.length?rule.denyChannels.map(id=>`<#${id}>`).join(', '):'none'}`;});return replyCard(i,'Command rules',list(text,'No command-specific rules have been configured.'),COLOURS.info,{ephemeral:true});}if(n==='command-rule'){const name=i.options.getString('command',true).trim().toLowerCase().replace(/^\//,'');if(!categories[name])throw new Error('That is not a grouped command root.');const role=i.options.getRole('role'),channel=i.options.getChannel('channel'),allow=i.options.getBoolean('allow');if(!role&&!channel)throw new Error('Choose a role or channel to configure.');const rule=g.settings.commandRules[name]||={allowRoles:[],denyRoles:[],allowChannels:[],denyChannels:[]};const setRule=(allowList,denyList,id,allowed)=>{const source=allowed?allowList:denyList,target=allowed?denyList:allowList;const index=target.indexOf(id);if(index>=0)target.splice(index,1);if(!source.includes(id))source.push(id);};if(role)setRule(rule.allowRoles,rule.denyRoles,role.id,allow===true);if(channel)setRule(rule.allowChannels,rule.denyChannels,channel.id,allow===true);store.scheduleSave();return replyCard(i,'Command rule saved',`/${name} is now restricted by the selected ${role?'role':'channel'} as an **${allow===true?'allow':'deny'}** rule.`,COLOURS.success,{ephemeral:true});}if(n==='command-reset'){const name=i.options.getString('command',true).trim().toLowerCase().replace(/^\//,'');delete g.settings.commandRules[name];store.scheduleSave();return replyCard(i,'Command rules reset',`/${name} now uses its normal permission boundary.`,COLOURS.success,{ephemeral:true});}g.settings.ignoredChannels||=[];const id=i.options.getChannel('channel',true).id;if(n==='ignore'){if(!g.settings.ignoredChannels.includes(id))g.settings.ignoredChannels.push(id);store.scheduleSave();return replyCard(i,'Channel excluded','Automations and XP are disabled there.',COLOURS.success,{ephemeral:true});}if(n==='unignore'){g.settings.ignoredChannels=g.settings.ignoredChannels.filter(channelId=>channelId!==id);store.scheduleSave();return replyCard(i,'Channel restored','Automations and XP will run there again.',COLOURS.success,{ephemeral:true});}throw new Error('This server action is not available.');}
async function welcome(i,g){const n=i.options.getSubcommand();if(n==='status')return replyCard(i,'Onboarding status',`Welcome: ${g.settings.welcome.enabled?'on':'off'}\nGoodbye: ${g.settings.goodbye.enabled?'on':'off'}\nAutoroles: ${(g.autoroles||[]).length|| (g.settings.autorole.enabled?1:0)}`,COLOURS.info);if(n==='test'){const k=i.options.getString('kind',true),c=g.settings[k],description=(c.message||'This is a preview.').replaceAll('{{user}}',`<@${i.user.id}>`).replaceAll('{{server}}',i.guild.name).replaceAll('{{count}}',String(i.guild.memberCount));return i.reply({...onboardingPayload(c,description,i.user.id),flags:64});}access(i,PermissionFlagsBits.ManageGuild);if(n==='set'){const k=i.options.getString('kind',true),c=g.settings[k] ||= {enabled:false,channelId:'',message:'',color:COLOURS.info};c.enabled=true;c.channelId=i.options.getChannel('channel',true).id;c.message=i.options.getString('message',true);store.scheduleSave();return replyCard(i,`${k} saved`,'Automatic delivery is now enabled.',COLOURS.success,{ephemeral:true});}if(n==='disable'){g.settings[i.options.getString('kind',true)].enabled=false;store.scheduleSave();return replyCard(i,'Automatic message disabled','No automatic message will be sent.',COLOURS.success,{ephemeral:true});}if(n==='autorole'){g.autoroles||=[];const role=i.options.getRole('role',true);if(!g.autoroles.includes(role.id))g.autoroles.push(role.id);g.settings.autorole={enabled:true,roleId:role.id};store.scheduleSave();return replyCard(i,'Autorole saved','The selected role will be assigned when Discord permits it.',COLOURS.success,{ephemeral:true});}if(n==='autorole-clear'){g.autoroles=[];g.settings.autorole={enabled:false,roleId:''};store.scheduleSave();return replyCard(i,'Autoroles cleared','New members will no longer receive an automatic role.',COLOURS.success,{ephemeral:true});}return replyCard(i,'Welcome preview','No forced image, footer, quote, font or private message is added.',COLOURS.info,{ephemeral:true});}
const welcomeBase = welcome;
welcome = async function welcomeWithAssets(i,g){const n=i.options.getSubcommand();if(n!=='set')return welcomeBase(i,g);access(i,PermissionFlagsBits.ManageGuild);const k=i.options.getString('kind',true),c=g.settings[k],image=await uploadedAsset(i.options.getAttachment('image'),`${k}-background`),thumbnail=await uploadedAsset(i.options.getAttachment('thumbnail'),`${k}-thumbnail`);c.enabled=true;c.channelId=i.options.getChannel('channel',true).id;c.message=i.options.getString('message',true);c.title=i.options.getString('title')||c.title||(k==='goodbye'?'Goodbye':'Welcome');c.color=parseColour(i.options.getString('color'),c.color||(k==='goodbye'?COLOURS.warning:COLOURS.info));c.footer=i.options.getString('footer')??c.footer??'';c.showTimestamp=i.options.getBoolean('timestamp')??c.showTimestamp??false;c.dm=i.options.getBoolean('dm')??c.dm??false;if(i.options.getBoolean('remove_image'))delete c.imageAsset;if(i.options.getBoolean('remove_thumbnail'))delete c.thumbnailAsset;if(image)c.imageAsset=image;if(thumbnail)c.thumbnailAsset=thumbnail;store.scheduleSave();return replyCard(i,`${k} saved`,`${c.imageAsset?'Custom image stored. ':''}${c.thumbnailAsset?'Custom thumbnail stored. ':''}The card will use only the options you configured.`,COLOURS.success,{ephemeral:true});};
const rolePanelComponents = (x, server) => { const roles=(x.roles||[]).map(id=>server.roles.cache.get(id)).filter(role=>role?.editable).slice(0,25); if(!roles.length)return []; return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`rolepanel:${x.id}`).setPlaceholder('Choose your roles').setMinValues(0).setMaxValues(roles.length).addOptions(roles.map(role=>new StringSelectMenuOptionBuilder().setLabel(role.name.slice(0,100)).setValue(role.id).setDescription(`Toggle ${role.name}`))))]; };
const refreshRolePanel = async (x, server) => { if(!x.channelId||!x.messageId)return;const channel=await server.channels.fetch(x.channelId).catch(()=>null),message=channel?.isTextBased()?await channel.messages.fetch(x.messageId).catch(()=>null):null;if(!message)return;const image=assetOnDisk(x.imageAsset),thumbnail=assetOnDisk(x.thumbnailAsset);await message.edit({embeds:[card(x.title,`${x.description}\n\nSelect the roles you want to receive.`,COLOURS.brand,{image:embedAssetUrl(image),thumbnail:embedAssetUrl(thumbnail),footer:x.footer||undefined})],files:assetFiles(image,thumbnail),components:rolePanelComponents(x,server)}).catch(()=>{}); };
async function roles(i,g){access(i,PermissionFlagsBits.ManageRoles);const n=i.options.getSubcommand();g.rolePanels||=[];if(n==='autorole'){g.autoroles||=[];const role=i.options.getRole('role',true);if(!g.autoroles.includes(role.id))g.autoroles.push(role.id);g.settings.autorole={enabled:true,roleId:role.id};store.scheduleSave();return replyCard(i,'Autorole saved',`${role} will be assigned to new members when the bot can manage it.`,COLOURS.success,{ephemeral:true});}if(n==='autorole-clear'){g.autoroles=[];g.settings.autorole={enabled:false,roleId:''};store.scheduleSave();return replyCard(i,'Autoroles cleared','No automatic member roles remain configured.',COLOURS.success,{ephemeral:true});}if(n==='list')return replyCard(i,'Role panels',list(g.rolePanels.map(x=>`${x.id} · ${x.title} · ${x.roles.length} roles`)),COLOURS.info,{ephemeral:true});if(n==='panel'){const channel=i.options.getChannel('channel',true),image=await uploadedAsset(i.options.getAttachment('image'),'role-panel-image'),thumbnail=await uploadedAsset(i.options.getAttachment('thumbnail'),'role-panel-thumbnail'),x={id:randomUUID().slice(0,8),title:i.options.getString('title',true),description:i.options.getString('description',true),roles:[],channelId:channel.id,messageId:'',imageAsset:image,thumbnailAsset:thumbnail,footer:i.options.getString('footer')||''};g.rolePanels.push(x);const message=await channel.send({embeds:[card(x.title,`${x.description}\n\nStaff can add roles with /roles add.`,COLOURS.brand,{image:embedAssetUrl(image),thumbnail:embedAssetUrl(thumbnail),footer:x.footer||undefined})],files:assetFiles(image,thumbnail),components:rolePanelComponents(x,i.guild)});x.messageId=message.id;store.scheduleSave();return replyCard(i,'Role panel published',`Panel ID: **${x.id}**. Add roles with **/roles add** and members will receive a selector.`,COLOURS.success,{ephemeral:true,image:embedAssetUrl(image),files:assetFiles(image,thumbnail)});}const x=g.rolePanels.find(z=>z.id===i.options.getString('panel_id',true));if(!x)throw new Error('Role panel not found.');if(n==='clear')g.rolePanels=g.rolePanels.filter(z=>z!==x);else{const r=i.options.getRole('role',true);if(n==='add'&&!x.roles.includes(r.id))x.roles.push(r.id);if(n==='remove')x.roles=x.roles.filter(id=>id!==r.id);await refreshRolePanel(x,i.guild);}store.scheduleSave();return replyCard(i,'Role panel updated','The interactive selector was refreshed.',COLOURS.success,{ephemeral:true});}
async function tickets(i,g){const n=i.options.getSubcommand();if(n==='panel'){access(i,PermissionFlagsBits.ManageGuild);const c=i.options.getChannel('channel',true),image=await uploadedAsset(i.options.getAttachment('image'),'ticket-panel-image'),thumbnail=await uploadedAsset(i.options.getAttachment('thumbnail'),'ticket-panel-thumbnail');await c.send({embeds:[card(i.options.getString('title',true),i.options.getString('description',true),COLOURS.brand,{image:embedAssetUrl(image),thumbnail:embedAssetUrl(thumbnail),footer:i.options.getString('footer')||undefined})],files:assetFiles(image,thumbnail),components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:open').setLabel('Open a ticket').setStyle(ButtonStyle.Primary))]});return replyCard(i,'Ticket panel published',`Published in ${c}.`,COLOURS.success,{ephemeral:true});}if(n==='settings'){access(i,PermissionFlagsBits.ManageGuild);g.settings.tickets.enabled=true;g.settings.tickets.staffRoleId=i.options.getRole('staff_role')?.id||g.settings.tickets.staffRoleId;g.settings.tickets.categoryId=i.options.getChannel('category')?.id||g.settings.tickets.categoryId;store.scheduleSave();return replyCard(i,'Ticket settings saved','Access and routing were updated.',COLOURS.success,{ephemeral:true});}if(n==='open'){const c=await i.guild.channels.create({name:`ticket-${i.user.id.slice(-4)}`,type:ChannelType.GuildText,parent:g.settings.tickets.categoryId||undefined,permissionOverwrites:[{id:i.guild.roles.everyone.id,deny:['ViewChannel']},{id:i.user.id,allow:['ViewChannel','SendMessages','ReadMessageHistory']},...(g.settings.tickets.staffRoleId?[{id:g.settings.tickets.staffRoleId,allow:['ViewChannel','SendMessages','ReadMessageHistory']}]:[])]});g.tickets.push({id:c.id,channelId:c.id,ownerId:i.user.id,status:'open',claimedBy:'',createdAt:Date.now()});store.scheduleSave();return replyCard(i,'Ticket opened',`Your private ticket is ${c}.`,COLOURS.success,{ephemeral:true});}if(!ticketStaff(i,g))throw new Error('You need the configured staff role or Manage Messages to manage tickets.');const t=g.tickets.find(x=>x.channelId===i.channel.id||x.id===i.channel.id);if(n==='claim'){if(t)t.claimedBy=i.user.id;store.scheduleSave();return replyCard(i,'Ticket claimed',`Assigned to <@${i.user.id}>.`,COLOURS.success);}if(n==='close'){if(t)t.status='closed';await i.channel.permissionOverwrites.edit(i.guild.roles.everyone,{ViewChannel:false});store.scheduleSave();return replyCard(i,'Ticket closed','The ticket is now closed. Staff can reopen it when needed.',COLOURS.warning,{ephemeral:true});}if(n==='reopen'){if(t)t.status='open';await i.channel.permissionOverwrites.edit(i.guild.roles.everyone,{ViewChannel:null});if(t?.ownerId)await i.channel.permissionOverwrites.edit(t.ownerId,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true});store.scheduleSave();return replyCard(i,'Ticket reopened','The ticket is available again.',COLOURS.success,{ephemeral:true});}if(n==='transcript'){const messages=await i.channel.messages.fetch({limit:100});const text=[...messages.values()].reverse().map(x=>`[${new Date(x.createdTimestamp).toISOString()}] ${x.author.tag}: ${x.content||'[attachment or embed]'}`).join('\\n');return i.reply({embeds:[card('Ticket transcript','The transcript is attached as a text file.',COLOURS.info)],files:[{attachment:Buffer.from(text||'No messages recorded.','utf8'),name:`${i.channel.name}-transcript.txt`}],flags:64,allowedMentions:{parse:[]}});}throw new Error('Unknown ticket action.');}
async function feeds(i,g){access(i,PermissionFlagsBits.ManageGuild);g.settings.feeds||=[];const n=i.options.getSubcommand();if(n==='list')return replyCard(i,'Feeds',list(g.settings.feeds.map(x=>`${x.id} · ${x.title||'Feed update'} · ${x.url} · <#${x.channelId}>`)),COLOURS.info,{ephemeral:true});if(n==='add'){const url=i.options.getString('url',true).trim();let parsed;try{parsed=new URL(url);}catch{throw new Error('Provide a valid HTTPS RSS or Atom feed URL.');}if(parsed.protocol!=='https:')throw new Error('Feed URLs must use HTTPS.');const x={id:randomUUID().slice(0,8),url,title:i.options.getString('title')||'Feed update',channelId:i.options.getChannel('channel',true).id,lastLink:'',nextCheck:0};g.settings.feeds.push(x);store.scheduleSave();return replyCard(i,'Feed added',`Feed ID: **${x.id}**\nThe first new item will be posted to <#${x.channelId}>.`,COLOURS.success,{ephemeral:true});}if(n==='test'){const x=g.settings.feeds.find(feed=>feed.id===i.options.getString('id',true));if(!x)throw new Error('Feed not found.');const item=await readFeed(x.url);if(!item)throw new Error('The feed could not be read or contained no item.');return replyCard(i,'Feed test passed',`**${clean(item.title,256)}**\n${item.link}`,COLOURS.success,{ephemeral:true});}g.settings.feeds=g.settings.feeds.filter(x=>x.id!==i.options.getString('id',true));store.scheduleSave();return replyCard(i,'Feed removed','The feed was deleted.',COLOURS.warning,{ephemeral:true});}
async function forms(i,g){access(i,PermissionFlagsBits.ManageGuild);g.forms||={};const n=i.options.getSubcommand();if(n==='create'){const questions=i.options.getString('questions',true).split('|').map(x=>x.trim()).filter(Boolean).slice(0,5);if(!questions.length)throw new Error('Add at least one question.');const id=randomUUID().slice(0,8);g.forms[id]={id,name:i.options.getString('name',true),description:i.options.getString('description',true),questions,submissions:[],createdBy:i.user.id,createdAt:Date.now(),published:[]};store.scheduleSave();return replyCard(i,'Form created',`Form ID: **${id}** · ${questions.length} question(s). Publish it with **/forms publish**.`,COLOURS.success,{ephemeral:true});}if(n==='list')return replyCard(i,'Saved forms',list(Object.values(g.forms).map(x=>`**${x.id}** · ${x.name} · ${x.questions.length} questions · ${x.submissions?.length||0} submissions`),'No forms have been created.'),COLOURS.info,{ephemeral:true});const x=g.forms[i.options.getString('id',true)];if(!x)throw new Error('Form not found.');if(n==='delete'){delete g.forms[x.id];store.scheduleSave();return replyCard(i,'Form deleted','The form and its stored submissions were removed.',COLOURS.warning,{ephemeral:true});}const channel=i.options.getChannel('channel',true),message=await channel.send({embeds:[card(x.name,x.description,COLOURS.brand,{fields:x.questions.map((question,index)=>({name:`${index+1}. ${question}`,value:'Answer privately through the form button.',inline:false}))})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`form:open:${x.id}`).setLabel('Open form').setStyle(ButtonStyle.Primary))]});x.published.push({channelId:channel.id,messageId:message.id,at:Date.now()});store.scheduleSave();return replyCard(i,'Form published',`The **${x.name}** panel is now available in ${channel}.`,COLOURS.success,{ephemeral:true});}
const formsBase = forms;
forms = async function formsWithMediaAndSubmissions(i, g) {
  const n = i.options.getSubcommand();
  if (n === 'create') {
    access(i, PermissionFlagsBits.ManageGuild);
    const questions = i.options.getString('questions', true).split('|').map(x => x.trim()).filter(Boolean).slice(0, 5);
    if (!questions.length) throw new Error('Add at least one question.');
    const image = await uploadedAsset(i.options.getAttachment('image'), 'form-image');
    const thumbnail = await uploadedAsset(i.options.getAttachment('thumbnail'), 'form-thumbnail');
    const id = randomUUID().slice(0, 8);
    g.forms ||= {};
    g.forms[id] = { id, name: i.options.getString('name', true), description: i.options.getString('description', true), questions, submissions: [], createdBy: i.user.id, createdAt: Date.now(), published: [], imageAsset: image, thumbnailAsset: thumbnail };
    store.scheduleSave();
    return replyCard(i, 'Form created', `Form ID: **${id}** · ${questions.length} question(s). Publish it with **/forms publish**.`, COLOURS.success, { ephemeral: true, image: embedAssetUrl(image), files: assetFiles(image, thumbnail) });
  }
  if (n === 'submissions') {
    access(i, PermissionFlagsBits.ManageGuild);
    const x = g.forms?.[i.options.getString('id', true)];
    if (!x) throw new Error('Form not found.');
    const text = (x.submissions || []).slice(-20).reverse().map((entry, index) => `**${index + 1}.** <@${entry.userId}> · <t:${Math.floor(entry.at / 1000)}:R>\n${entry.answers.map((answer, questionIndex) => `**${questionIndex + 1}.** ${clean(answer, 500)}`).join('\n')}`).join('\n\n');
    return replyCard(i, `Submissions · ${x.name}`, text || 'No submissions have been received.', COLOURS.info, { ephemeral: true });
  }
  if (n === 'publish') {
    access(i, PermissionFlagsBits.ManageGuild);
    const x = g.forms?.[i.options.getString('id', true)];
    if (!x) throw new Error('Form not found.');
    const channel = i.options.getChannel('channel', true), image = assetOnDisk(x.imageAsset), thumbnail = assetOnDisk(x.thumbnailAsset);
    const message = await channel.send({ embeds: [card(x.name, x.description, COLOURS.brand, { fields: x.questions.map((question, index) => ({ name: `${index + 1}. ${question}`, value: 'Answer privately through the form button.', inline: false })), image: embedAssetUrl(image), thumbnail: embedAssetUrl(thumbnail) })], files: assetFiles(image, thumbnail), components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`form:open:${x.id}`).setLabel('Open form').setStyle(ButtonStyle.Primary))] });
    x.published ||= [];
    x.published.push({ channelId: channel.id, messageId: message.id, at: Date.now() });
    store.scheduleSave();
    return replyCard(i, 'Form published', `The **${x.name}** panel is now available in ${channel}.`, COLOURS.success, { ephemeral: true });
  }
  return formsBase(i, g);
};
const dispatchBase = dispatch;
dispatch = async function dispatchWithCompactHelp(i) {
  if (i.commandName === 'help') {
    const category = i.options.getString('category');
    if (category && !categories[category]) throw new Error(`Unknown category. Choose one of: ${Object.keys(categories).join(', ')}.`);
    const description = category
      ? `**/${category}** · ${rootText[category]}\nUse the command picker to choose one of: ${categories[category].map(name => `\`/${category} ${name}\``).join(', ')}.`
      : `Choose a category from the command picker. Available groups: ${Object.entries(rootText).map(([name, text]) => `**/${name}** — ${text}`).join(' · ')}.`;
    return replyCard(i, category ? `${category[0].toUpperCase()}${category.slice(1)} commands` : 'Discord Bot command categories', description, COLOURS.brand);
  }
  return dispatchBase(i);
};
const levelsWithExportBase = levels;
levels = async function levelsWithExport(i, g) {
  if (i.options.getSubcommand() === 'export') {
    access(i, PermissionFlagsBits.ManageGuild);
    const rows = ['user_id,xp,level', ...Object.values(g.xp).sort((a, b) => b.xp - a.xp).map(entry => `${entry.id},${entry.xp},${level(entry.xp)}`)];
    return i.reply({ embeds: [card('Level export', `The current level table contains **${rows.length - 1}** member record(s). A CSV copy is attached for staff use.`, COLOURS.level)], files: [{ attachment: Buffer.from(`${rows.join('\n')}\n`, 'utf8'), name: `levels-${i.guild.id}.csv` }], flags: 64, allowedMentions: { parse: [] } });
  }
  return levelsWithExportBase(i, g);
};
async function readFeed(url){const response=await fetch(url,{signal:AbortSignal.timeout(10000)}).catch(()=>null);if(!response?.ok)return null;const xml=await response.text();const block=xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/i)?.[0]||xml;const title=block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,'').trim();const linkMatch=block.match(/<link[^>]+href=["']([^"']+)["']/i)||block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);const link=(linkMatch?.[1]||'').replace(/<!\[CDATA\[|\]\]>/g,'').trim();return title||link?{title:title||'New feed item',link:link||url}:null;}
async function pollFeeds(server,g){for(const feed of g.settings.feeds||[]){if(feed.nextCheck&&feed.nextCheck>Date.now())continue;feed.nextCheck=Date.now()+60000;const item=await readFeed(feed.url).catch(()=>null);if(!item||item.link===feed.lastLink)continue;const channel=await server.channels.fetch(feed.channelId).catch(()=>null);if(channel?.isTextBased()){const sent=await channel.send({embeds:[card(feed.title||'Feed update',`**${clean(item.title,256)}**\\n[Open update](${item.link})`,COLOURS.info)],allowedMentions:{parse:[]}}).catch(()=>null);if(sent)feed.lastLink=item.link;}}store.scheduleSave();}
const rolesBase = roles;
roles = async function rolesWithAssets(i,g){
  if(i.options.getSubcommand()!=='panel')return rolesBase(i,g);
  access(i,PermissionFlagsBits.ManageRoles);
  const channel=i.options.getChannel('channel',true),image=await uploadedAsset(i.options.getAttachment('image'),'role-panel-image'),thumbnail=await uploadedAsset(i.options.getAttachment('thumbnail'),'role-panel-thumbnail');
  const x={id:randomUUID().slice(0,8),title:i.options.getString('title',true),description:i.options.getString('description',true),roles:[],channelId:channel.id,messageId:'',imageAsset:image,thumbnailAsset:thumbnail,footer:i.options.getString('footer')||''};
  g.rolePanels||=[];g.rolePanels.push(x);
  const message=await channel.send({embeds:[card(x.title,`${x.description}\n\nStaff can add roles with /roles add.`,COLOURS.brand,{image:embedAssetUrl(image),thumbnail:embedAssetUrl(thumbnail),footer:x.footer||undefined})],files:assetFiles(image,thumbnail),components:rolePanelComponents(x,i.guild)});
  x.messageId=message.id;store.scheduleSave();
  return replyCard(i,'Role panel published',`Panel ID: **${x.id}**. Add roles with **/roles add** and members will receive a selector.`,COLOURS.success,{ephemeral:true});
};
const rolesWithDeletionBase = roles;
roles = async function rolesWithDeletion(i, g) {
  if (i.options.getSubcommand() !== 'clear') return rolesWithDeletionBase(i, g);
  access(i, PermissionFlagsBits.ManageRoles);
  const panel = g.rolePanels?.find(item => item.id === i.options.getString('panel_id', true));
  if (!panel) throw new Error('Role panel not found.');
  const channel = await i.guild.channels.fetch(panel.channelId).catch(() => null);
  const message = channel?.isTextBased() ? await channel.messages.fetch(panel.messageId).catch(() => null) : null;
  await message?.delete().catch(() => {});
  g.rolePanels = g.rolePanels.filter(item => item !== panel);
  store.scheduleSave();
  return replyCard(i, 'Role panel deleted', 'The saved panel and its published Discord message were removed.', COLOURS.warning, { ephemeral: true });
};
const ticketsBase = tickets;
tickets = async function ticketsWithPanel(i,g){const n=i.options.getSubcommand();if(['add','remove','rename','priority'].includes(n)){if(!ticketStaff(i,g))throw new Error('You need the configured staff role or Manage Messages to manage tickets.');const t=g.tickets.find(x=>x.channelId===i.channel.id||x.id===i.channel.id);if(!t)throw new Error('This channel is not an active ticket.');if(n==='add'||n==='remove'){const member=i.options.getUser('member',true);await i.channel.permissionOverwrites.edit(member.id,n==='add'?{ViewChannel:true,SendMessages:true,ReadMessageHistory:true}:{ViewChannel:null,SendMessages:null,ReadMessageHistory:null});return replyCard(i,n==='add'?'Member added':'Member removed',`Ticket access was updated for <@${member.id}>.`,COLOURS.success,{ephemeral:true});}if(n==='rename'){const name=i.options.getString('name',true).toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,90);await i.channel.setName(name);return replyCard(i,'Ticket renamed',`The channel is now **${name}**.`,COLOURS.success,{ephemeral:true});}t.priority=i.options.getBoolean('enabled',true);store.scheduleSave();return replyCard(i,'Ticket priority updated',`Priority: **${t.priority?'high':'normal'}**.`,COLOURS.success,{ephemeral:true});}return ticketsBase(i,g);};
const giveawaysBase = giveaways;
giveaways = async function giveawaysWithReroll(i, g) {
  if (i.options.getSubcommand() !== 'reroll') return giveawaysBase(i, g);
  access(i, PermissionFlagsBits.ManageGuild);
  const x = g.giveaways?.find(entry => entry.id === i.options.getString('id', true));
  if (!x) throw new Error('Giveaway not found.');
  if (!x.ended) throw new Error('End the giveaway before rerolling.');
  const previous = new Set(x.winnerIds || []);
  x.entries = (x.entries || []).filter(id => !previous.has(id));
  const eligible = await chooseGiveawayWinners(i.guild, g, x);
  const winnerText = x.winnerIds.length ? x.winnerIds.map(id => `<@${id}>`).join(', ') : 'No unused eligible entries remain.';
  if (x.winnerIds.length && x.winnerRoleId) {
    const role = i.guild.roles.cache.get(x.winnerRoleId);
    for (const item of eligible.slice(0, x.winners || 1)) if (role?.editable) await item.member.roles.add(role).catch(() => {});
  }
  await refreshGiveawayMessage(i.guild, x);
  await i.channel.send({ content: x.pingRoleId ? `<@&${x.pingRoleId}>` : undefined, embeds: [card('Giveaway reroll', winnerText, COLOURS.success)], allowedMentions: { users: x.winnerIds, roles: x.pingRoleId ? [x.pingRoleId] : [] } }).catch(() => {});
  store.scheduleSave();
  return replyCard(i, 'Giveaway rerolled', winnerText, COLOURS.success, { ephemeral: true });
};
const feedsBase = feeds;
feeds = async function feedsWithTest(i,g){return feedsBase(i,g);};
setInterval(()=>{if(!client.isReady())return;for(const server of client.guilds.cache.values())void pollFeeds(server,guild(server.id));},60000).unref();
setInterval(async()=>{if(!client.isReady())return;for(const server of client.guilds.cache.values()){const g=guild(server.id);for(const item of g.autoMessages||[]){if(!item.enabled||item.nextAt>Date.now())continue;const channel=await server.channels.fetch(item.channelId).catch(()=>null);if(!channel?.isTextBased())continue;const asset=assetOnDisk(item.imageAsset);const sent=await channel.send({embeds:[card('Automatic message',item.message,COLOURS.info,{image:embedAssetUrl(asset)})],files:assetFiles(asset),allowedMentions:{parse:[]}}).catch(()=>null);if(sent)item.nextAt=Date.now()+Math.max(60000,item.interval);}store.scheduleSave();}},15000).unref();

client.once('ready',async()=>{await store.load();console.log(`Discord bot ready as ${client.user.tag}`);const guildId=process.env.DEPLOY_GUILD_ID;if(guildId&&client.guilds.cache.has(guildId))await client.guilds.cache.get(guildId).commands.set(slashCommands.map(x=>x.toJSON()));else if(process.env.DEPLOY_GLOBAL==='1')await client.application.commands.set(slashCommands.map(x=>x.toJSON()));setInterval(()=>void tick(),15000).unref();});
const levelUpPayload = (g, user, newLevel) => { const config=g.settings.levels.levelUp||{},asset=assetOnDisk(config.imageAsset),text=String(config.message||'Congratulations, {{user}} — you reached level {{level}}.').replaceAll('{{user}}',`<@${user.id}>`).replaceAll('{{level}}',String(newLevel)); return {embeds:[card(`Level ${newLevel} reached`,text,COLOURS.level,{image:embedAssetUrl(asset),footer:config.footer||undefined})],files:assetFiles(asset),allowedMentions:{users:[user.id]}}; };
const interactionConsumedMessages = new WeakSet();
const INTERACTION_ACTIONS = ['hug','kiss','kill','pat','slap','bite','cuddle','punch','poke','highfive','wave','cry','dance','wink','smile','tickle','nom','ship'];
const INTERACTION_ACTION_TEXT = { hug: 'hugs', kiss: 'kisses', kill: 'defeats', pat: 'pats', slap: 'slaps', bite: 'bites', cuddle: 'cuddles with', punch: 'punches', poke: 'pokes', highfive: 'high-fives', wave: 'waves at', cry: 'cries beside', dance: 'dances with', wink: 'winks at', smile: 'smiles at', tickle: 'tickles', nom: 'noms', ship: 'ships' };
const normalParts = (content, prefix) => { const text=String(content||'').trim(), escaped=String(prefix||'!').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), prefixed=text.match(new RegExp(`^${escaped}(rank|rewards)(?:\\s+([\\s\\S]+))?$`,'i')); if(prefixed)return {action:prefixed[1].toLowerCase(),rest:String(prefixed[2]||'').trim()}; if(text.toLowerCase()==='react'||text.toLowerCase().startsWith('react '))return {action:'react',rest:text.slice(5).trim()}; return null; };
client.on('messageCreate', recordMarriageChat);
const rankPayload = async (g, user) => { const r=row(g,user),l=level(r.xp),next=xpAt(l+1),base=xpAt(l),rank=Object.values(g.xp).sort((a,b)=>b.xp-a.xp).findIndex(x=>x.id===user.id)+1,backgroundAsset=assetOnDisk(g.settings.levels.rankCard?.backgroundAsset),accent=g.settings.levels.rankCard?.accent,showAvatar=g.settings.levels.rankCard?.showAvatar===true,values={user,level:l,xp:r.xp,nextXp:next,rank,progress:(r.xp-base)/Math.max(1,next-base),rewards:g.settings.levels.rewards.filter(x=>x.level<=l).map(x=>x.roleId),backgroundAsset,accent,showAvatar},rendered=await renderLevelCard(values); return {embeds:[levelCard({...values,cardImage:rendered?'attachment://rank-card.png':undefined})],files:rendered?[rendered]:assetFiles(backgroundAsset),allowedMentions:{parse:[]}}; };
client.on('messageCreate',async m=>{if(!m.guild||m.author.bot||interactionConsumedMessages.has(m))return;const g=guild(m.guild.id);if(g.settings.ignoredChannels.includes(m.channel.id))return;const prefix=g.settings.prefix||'!',parts=normalParts(m.content,prefix);if(!parts)return;if(parts.action==='rank'){const user=m.mentions.users.first()||m.author;return m.reply(await rankPayload(g,user));}if(parts.action==='rewards'){const rewards=g.settings.levels.rewards.slice().sort((a,b)=>a.level-b.level);return m.reply({embeds:[card('Level rewards',list(rewards.map(x=>`Level **${x.level}** · <@&${x.roleId}>`),'No reward roles have been configured.'),COLOURS.level)],allowedMentions:{parse:[]}});}if(parts.action!=='react')return;const args=parts.rest?parts.rest.split(/\s+/):['help'],action=args.shift().toLowerCase(),target=m.mentions.users.first();const r=row(g,m.author);if(action==='help')return m.reply({embeds:[card('Public interactions',`Use **react hug @member**, **react kiss @member**, **react kill @member**, **react pat @member**, **react slap @member**, **react gif <search>**, or **react daily**. These are ordinary channel messages; no interaction command is added to the slash picker. Use **${prefix}rank** and **${prefix}rewards** for public level cards.`,COLOURS.music)]});if(action==='daily'){if(Date.now()-r.daily<86400000)return m.reply({embeds:[card('Daily reward',`Your next reward is available <t:${Math.floor((r.daily+86400000)/1000)}:R>.`,COLOURS.neutral)],allowedMentions:{parse:[]}});r.coins+=25;r.daily=Date.now();store.scheduleSave();return m.reply({embeds:[card('Daily reward',`<@${m.author.id}> received **25** public coins.`,COLOURS.success)],allowedMentions:{users:[m.author.id]}});}if(action==='gif'){const u=await liveMedia(args.join(' ')||'reaction');return m.reply({embeds:[card('GIF',u?'A live result from the configured GIF provider.':'GIF source unavailable. Configure TENOR_API_KEY or GIPHY_API_KEY.',u?COLOURS.music:COLOURS.warning,{image:u||undefined})]});}if(!INTERACTION_ACTIONS.includes(action))return;if(!target)return m.reply({embeds:[card('Member required','Mention a member, for example: **react kiss @member**.',COLOURS.warning)],allowedMentions:{parse:[]}});const description=`<@${m.author.id}> ${INTERACTION_ACTION_TEXT[action]} <@${target.id}>.`;const u=await liveMedia(`${action} reaction`);return m.reply({embeds:[card(action[0].toUpperCase()+action.slice(1),description,COLOURS.music,{image:u||undefined})],allowedMentions:{users:[m.author.id,target.id]}});});
client.on('interactionCreate',async i=>{try{if(i.isAutocomplete())return i.respond(Object.keys(categories).filter(x=>x.includes(i.options.getFocused().toLowerCase())).map(x=>({name:x,value:x})));if(i.isModalSubmit()&&i.customId.startsWith('form:submit:')){const g=guild(i.guild.id),x=g.forms?.[i.customId.split(':')[2]];if(!x)throw new Error('This form is no longer available.');const answers=x.questions.map((question,index)=>i.fields.getTextInputValue('question_'+index));x.submissions.push({id:randomUUID().slice(0,8),userId:i.user.id,answers,at:Date.now()});store.scheduleSave();return i.reply({embeds:[card('Form submitted',`Your response to **${x.name}** has been recorded.`,COLOURS.success)],flags:64,allowedMentions:{parse:[]}});}if(i.isStringSelectMenu()&&i.customId.startsWith('rolepanel:')){const g=guild(i.guild.id),x=g.rolePanels?.find(panel=>panel.id===i.customId.split(':')[1]);if(!x)throw new Error('This role panel is no longer available.');const selected=new Set(i.values),member=await i.guild.members.fetch(i.user.id);for(const roleId of x.roles||[]){const role=i.guild.roles.cache.get(roleId);if(!role?.editable)continue;if(selected.has(roleId)&&!member.roles.cache.has(roleId))await member.roles.add(role);if(!selected.has(roleId)&&member.roles.cache.has(roleId))await member.roles.remove(role).catch(()=>{}); }return i.reply({embeds:[card('Role selection updated','Your role choices were updated.',COLOURS.success)],flags:64,allowedMentions:{parse:[]}});}if(i.isButton()){if(i.customId.startsWith('form:open:')){const g=guild(i.guild.id),x=g.forms?.[i.customId.split(':')[2]];if(!x)throw new Error('This form is no longer available.');const modal=new ModalBuilder().setCustomId(`form:submit:${x.id}`).setTitle(clean(x.name,45));modal.addComponents(...x.questions.map((question,index)=>new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('question_'+index).setLabel(clean(question,45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));return i.showModal(modal);}if(i.customId==='ticket:open'){const g=guild(i.guild.id);if(!g.settings.tickets.enabled)throw new Error('Tickets are not enabled in this server.');const existing=g.tickets.find(x=>x.ownerId===i.user.id&&x.status==='open');if(existing){const channel=await i.guild.channels.fetch(existing.channelId||existing.id).catch(()=>null);if(channel)return i.reply({embeds:[card('Ticket already open',`You already have an open ticket: ${channel}.`,COLOURS.info)],flags:64,allowedMentions:{parse:[]}});}const c=await i.guild.channels.create({name:`ticket-${i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,18)||'member'}-${i.user.id.slice(-4)}`,type:ChannelType.GuildText,parent:g.settings.tickets.categoryId||undefined,permissionOverwrites:[{id:i.guild.roles.everyone.id,deny:['ViewChannel']},{id:i.user.id,allow:['ViewChannel','SendMessages','ReadMessageHistory']},...(g.settings.tickets.staffRoleId?[{id:g.settings.tickets.staffRoleId,allow:['ViewChannel','SendMessages','ReadMessageHistory']}]:[])]});g.tickets.push({id:c.id,channelId:c.id,ownerId:i.user.id,status:'open',claimedBy:'',createdAt:Date.now()});store.scheduleSave();return i.reply({embeds:[card('Ticket opened',`Your private ticket is ${c}.`,COLOURS.success)],flags:64,allowedMentions:{parse:[]}});}if(i.customId.startsWith('giveaway:')){const g=guild(i.guild.id),x=g.giveaways.find(z=>z.id===i.customId.split(':')[1]);if(!x)throw new Error('This giveaway is no longer available.');if(x.ended)throw new Error('That giveaway has ended.');if(!giveawayMemberEligible(x,g,i.member))throw new Error('You do not meet this giveaway’s eligibility requirements.');if(!addGiveawayEntry(x,i.member))throw new Error('You have reached the entry limit for this giveaway.');store.scheduleSave();await refreshGiveawayMessage(i.guild,x);await i.message?.edit({embeds:[giveawayCard(x)],files:assetFiles(x.imageAsset,x.thumbnailAsset),components:giveawayEntryComponents(x),allowedMentions:{parse:[]}}).catch(()=>{});return i.reply({embeds:[card('Giveaway entry recorded','Your entry is recorded.',COLOURS.success)],flags:64,allowedMentions:{parse:[]}});}}if(!i.isChatInputCommand())return;await dispatch(i);}catch(e){const p={embeds:[card('Action unavailable',clean(e.message,500),COLOURS.warning)],flags:64,allowedMentions:{parse:[]}};if(i.replied||i.deferred)await i.followUp(p).catch(()=>{});else await i.reply(p).catch(()=>{});}});
client.on('messageCreate',async m=>{if(!m.guild||m.author.bot)return;const g=guild(m.guild.id),settings=g.settings.levels,member=m.member;if(!settings.messageXp||(!settings.threadXp&&m.channel?.isThread?.())||(!settings.voiceTextXp&&m.channel?.isVoiceBased?.())||Date.now()-row(g,m.author).last<=settings.cooldown*1000||g.settings.ignoredChannels.includes(m.channel.id)||settings.exclusions.channels.includes(m.channel.id)||settings.exclusions.roles.some(roleId=>member?.roles?.cache?.has(roleId)))return;const r=row(g,m.author),before=level(r.xp),minimum=Math.max(0,settings.xpMin??8),maximum=Math.max(minimum,settings.xpMax??18),words=m.content.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g)||[],validWords=words.filter(word=>word.length>=3),gain=settings.perWord?validWords.length*(maximum||1):minimum+Math.floor(Math.random()*(maximum-minimum+1));if(gain<=0)return;r.xp+=gain;r.weeklyXp=(r.weekKey===weekKey()?r.weeklyXp:0)+gain;r.last=Date.now();if(settings.announce&&level(r.xp)>before&&settings.channelId){const c=await m.guild.channels.fetch(settings.channelId).catch(()=>null);if(c?.isTextBased())await c.send(levelUpPayload(g,m.author,level(r.xp))).catch(()=>{});}store.scheduleSave();});
client.on('messageCreate',async m=>{if(!m.guild||m.author.bot)return;const link=guild(m.guild.id).tunnel;if(!link||link.channelId&&link.channelId!==m.channel.id)return;const bridge=store.data.publicBot.tunnels?.[link.code];if(!bridge||bridge.channels.length<2)return;const customEmojiPattern=/<a?:([\w~]+):(\d{15,22})>/g,emojiRefs=[];const text=m.content.replace(customEmojiPattern,(full,name,id)=>{const animated=full.startsWith('<a:');emojiRefs.push({url:`https://cdn.discordapp.com/emojis/${id}.${animated?'gif':'png'}?size=256&quality=lossless`,name:`emoji-${name}-${id}.${animated?'gif':'png'}`});return '';}).replace(/\s{2,}/g,' ').trim();const visibleText=text.replace(/<@!?(\d+)>/g,(_,id)=>{const user=m.mentions.users.get(id);const name=clean(user?.globalName||user?.username||'member',80).replace(/[\[\]()<>"]/g,'');return `[@${name}](https://discord.com/users/${id})`;}).replace(/<@&(\d+)>/g,(_,id)=>{const role=m.guild.roles.cache.get(id);const name=clean(role?.name||'role',80).replace(/[\[\]()<>"]/g,'');return `@${name}`;}).replace(/@(everyone|here)/gi,(_,name)=>'@'+String.fromCharCode(8203)+name);const emojiFiles=[];for(const emoji of bridge.copyEmoji === false ? [] : emojiRefs){const response=await fetch(emoji.url).catch(()=>null);if(!response?.ok)continue;const buffer=Buffer.from(await response.arrayBuffer());if(buffer.length)emojiFiles.push({attachment:buffer,name:emoji.name});}const stickerRefs=(bridge.copyStickers === false ? [] : [...m.stickers.values()]).map(sticker=>({url:sticker.url||sticker.asset,name:'sticker-'+sticker.id+'.png'})).filter(sticker=>sticker.url),stickerFiles=[];for(const sticker of stickerRefs){const response=await fetch(sticker.url).catch(()=>null);if(!response?.ok)continue;const buffer=Buffer.from(await response.arrayBuffer());if(buffer.length)stickerFiles.push({attachment:buffer,name:sticker.name});}const files=[...m.attachments.values()].map(a=>({attachment:a.url,name:a.name||'attachment'})).concat(emojiFiles,stickerFiles);for(const channelId of bridge.channels.filter(id=>id!==m.channel.id)){const channel=await client.channels.fetch(channelId).catch(()=>null);if(!channel?.isTextBased())continue;const replyContext=m.reference?.messageId?'\n↪ Replying to the original message: https://discord.com/channels/'+m.guild.id+'/'+m.channel.id+'/'+m.reference.messageId:'';const body='**'+(m.member?.displayName||m.author.globalName||m.author.username)+'**'+(visibleText?'\n'+visibleText:'')+replyContext;await sendTunnelPayload(channel,{content:body.length>2000?body.slice(0,1997)+'…':body,files:files.map(file=>({...file})),allowedMentions:{parse:[]}});}});
client.on('messageCreate',async m=>{if(!m.guild||m.author.bot||!m.member)return;const g=guild(m.guild.id),current=level(row(g,m.author).xp);for(const reward of g.settings.levels.rewards.filter(x=>x.level<=current)){const role=m.guild.roles.cache.get(reward.roleId);if(role?.editable&&!m.member.roles.cache.has(role.id))await m.member.roles.add(role).catch(()=>{});}});
client.on('messageCreate', async message => {
  if (!message.guild || !message.author.bot || message.author.id === client.user?.id) return;
  const link = guild(message.guild.id).tunnel;
  if (!link || (link.channelId && link.channelId !== message.channel.id)) return;
  const bridge = store.data.publicBot.tunnels?.[link.code];
  if (!bridge || bridge.channels.length < 2) return;
  const expressionPattern = /<a?:([\w~]+):(\d{15,22})>/g;
  const expressionMatches = [];
  const cleanExpressions = value => {
    if (typeof value === 'string') {
      expressionMatches.push(...[...value.matchAll(expressionPattern)]);
      return value.replace(expressionPattern, '').replace(/\s{2,}/g, ' ').trim();
    }
    if (Array.isArray(value)) return value.map(cleanExpressions);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanExpressions(item)]));
    return value;
  };
  const expressionFiles = [];
  const content = cleanExpressions(String(message.content || ''));
  const formatMentions = value => {
    if (typeof value === 'string') {
      return value.replace(/<@!?(\d+)>/g, (_, id) => {
        const member = message.guild.members.cache.get(id);
        const name = clean(member?.displayName || member?.user?.globalName || member?.user?.username || 'member', 80).replace(/[\[\]()<>\"]/g, '');
        return `[@${name}](https://discord.com/users/${id})`;
      }).replace(/<@&(\d+)>/g, (_, id) => {
        const role = message.guild.roles.cache.get(id);
        return `@${clean(role?.name || 'role', 80).replace(/[\[\]()<>\"]/g, '')}`;
      });
    }
    if (Array.isArray(value)) return value.map(formatMentions);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, formatMentions(item)]));
    return value;
  };
  const embeds = formatMentions(cleanExpressions(message.embeds.slice(0, 10).map(embed => embed.toJSON())));
  for (const match of expressionMatches) {
    if (bridge.copyEmoji === false) continue;
    const animated = match[0].startsWith('<a:');
    const url = `https://cdn.discordapp.com/emojis/${match[2]}.${animated ? 'gif' : 'png'}?size=256&quality=lossless`;
    const response = await fetch(url).catch(() => null);
    if (!response?.ok) continue;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length) expressionFiles.push({ attachment: buffer, name: `emoji-${match[1]}-${match[2]}.${animated ? 'gif' : 'png'}` });
  }
  const files = [...message.attachments.values()].map(attachment => ({ attachment: attachment.url, name: attachment.name || 'attachment' }))
    .concat(bridge.copyStickers === false ? [] : [...message.stickers.values()].filter(sticker => sticker.url || sticker.asset).map(sticker => ({ attachment: sticker.url || sticker.asset, name: `sticker-${sticker.id}.png` })), expressionFiles);
  for (const channelId of bridge.channels.filter(id => id !== message.channel.id)) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) continue;
    const replyContext = message.reference?.messageId
      ? `\n↪ Replying to the original message: https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.reference.messageId}`
      : '';
    const relayContent = `${formatMentions(content)}${replyContext}`.trim();
    await sendTunnelPayload(channel, { content: relayContent || undefined, embeds, files: files.map(file => ({ ...file })), allowedMentions: { parse: [] } });
  }
});
client.on('messageReactionAdd', async (reaction, user) => {
  if (user?.bot) return;
  const full = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
  const message = full?.message;
  if (!message?.guild) return;
  const link = guild(message.guild.id).tunnel;
  if (!link || (link.channelId && link.channelId !== message.channel.id)) return;
  const bridge = store.data.publicBot.tunnels?.[link.code];
  if (!bridge || bridge.channels.length < 2) return;
  const files = [];
  if (bridge.copyEmoji !== false && reaction.emoji.id) {
    const animated = Boolean(reaction.emoji.animated);
    const url = `https://cdn.discordapp.com/emojis/${reaction.emoji.id}.${animated ? 'gif' : 'png'}?size=256&quality=lossless`;
    const response = await fetch(url).catch(() => null);
    if (response?.ok) files.push({ attachment: Buffer.from(await response.arrayBuffer()), name: `reaction-${reaction.emoji.name || reaction.emoji.id}.${animated ? 'gif' : 'png'}` });
  }
  const name = clean(user?.globalName || user?.username || 'A member', 80);
  const emoji = reaction.emoji.id ? (files.length ? `:${reaction.emoji.name || 'custom emoji'}:` : 'a custom reaction') : (reaction.emoji.name || 'emoji');
  const embed = card('Tunnel reaction', `[${name}](https://discord.com/users/${user.id}) reacted with **${emoji}** to [the original message](${message.url}).`, COLOURS.info);
  for (const channelId of bridge.channels.filter(id => id !== message.channel.id)) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) await sendTunnelPayload(channel, { embeds: [embed], files: files.map(file => ({ ...file })), allowedMentions: { parse: [] } });
  }
});
const onboardingPayload = (config, description, memberId) => ({embeds:[card(config.title || 'Welcome',description,config.color || COLOURS.info,{image:embedAssetUrl(assetOnDisk(config.imageAsset)),thumbnail:embedAssetUrl(assetOnDisk(config.thumbnailAsset)),footer:config.footer || undefined,timestamp:config.showTimestamp || undefined})],files:assetFiles(config.imageAsset,config.thumbnailAsset),allowedMentions:{users:[memberId]}});
client.on('interactionCreate',async i=>{if(!i.guild)return;if(i.isStringSelectMenu()&&i.customId.startsWith('reminder:select')){const g=guild(i.guild.id),r=g.reminders.find(x=>x.id===i.values[0]);if(!r)return i.reply({embeds:[card('Reminder unavailable','That reminder no longer exists.',COLOURS.warning)],flags:64,allowedMentions:{parse:[]}});if(r.ownerId!==i.user.id&&!reminderAccess(i,g))return i.reply({embeds:[card('Reminder controls restricted','Only the reminder owner, Manage Server, or the configured reminder staff role may manage it.',COLOURS.warning)],flags:64,allowedMentions:{parse:[]}});return i.update({embeds:[reminderCard(r,`<#${r.channelId}>`)],files:assetFiles(r.imageAsset,r.thumbnailAsset),components:reminderActions(r.id),allowedMentions:{parse:[]}});}if(i.isButton()&&i.customId.startsWith('reminder-page:')){const [,direction,pageText]=i.customId.split(':'),page=Number(pageText)+(direction==='next'?1:-1),g=guild(i.guild.id);if(!reminderAccess(i,g))return i.reply({embeds:[card('Reminder controls restricted','Only Manage Server or the configured reminder staff role may browse reminder controls.',COLOURS.warning)],flags:64,allowedMentions:{parse:[]}});return i.update({embeds:[card('Reminder controls',`Page **${page+1}**`,COLOURS.info)],components:reminderSelector(g.reminders,page),files:[],allowedMentions:{parse:[]}});}if(i.isButton()&&i.customId.startsWith('reminder:')){const [,action,id]=i.customId.split(':'),g=guild(i.guild.id),r=g.reminders.find(x=>x.id===id);if(!r)return i.reply({embeds:[card('Reminder unavailable','That reminder no longer exists.',COLOURS.warning)],flags:64,allowedMentions:{parse:[]}});if(r.ownerId!==i.user.id&&!reminderAccess(i,g))return i.reply({embeds:[card('Reminder controls restricted','Only the reminder owner, Manage Server, or the configured reminder staff role may manage it.',COLOURS.warning)],flags:64,allowedMentions:{parse:[]}});if(action==='delete'){g.reminders=g.reminders.filter(x=>x!==r);store.scheduleSave();return i.update({embeds:[card('Reminder deleted','The schedule and its card settings were removed.',COLOURS.warning)],components:reminderSelector(g.reminders),allowedMentions:{parse:[]}});}let shown=r;if(action==='pause')r.enabled=false;if(action==='resume')r.enabled=true;if(action==='duplicate'){const d=structuredClone(r);d.id=randomUUID();d.ownerId=i.user.id;d.nextAt=d.at=Math.max(Date.now()+60000,Number(d.nextAt||d.at||Date.now()));d.enabled=true;g.reminders.push(d);shown=d;}store.scheduleSave();return i.update({embeds:[reminderCard(shown,`<#${shown.channelId}>`)],files:assetFiles(shown.imageAsset,shown.thumbnailAsset),components:reminderActions(shown.id),allowedMentions:{parse:[]}});}});
client.on('guildMemberAdd',async m=>{const g=guild(m.guild.id),roleIds=[...(g.autoroles||[]),...(g.settings.autorole.enabled?[g.settings.autorole.roleId]:[])];for(const roleId of new Set(roleIds)){const r=m.guild.roles.cache.get(roleId);if(r?.editable)await m.roles.add(r).catch(()=>{});}const c=g.settings.welcome;if(c.enabled&&c.channelId){const ch=await m.guild.channels.fetch(c.channelId).catch(()=>null);const description=c.message.replaceAll('{{user}}',`<@${m.id}>`).replaceAll('{{server}}',m.guild.name).replaceAll('{{count}}',String(m.guild.memberCount));if(ch?.isTextBased())await ch.send(onboardingPayload(c,description,m.id)).catch(()=>{});if(c.dm)await m.send(onboardingPayload(c,description,m.id)).catch(()=>{});}});
const starboardReactionKey = reaction => reaction?.emoji?.id || reaction?.emoji?.name || '';
const starboardMatches = (reaction, configured) => { const key=starboardReactionKey(reaction); return key===configured || reaction?.emoji?.name===configured || reaction?.emoji?.id===configured; };
client.on('messageReactionAdd',async reaction=>{if(reaction.me||reaction.message.author?.bot)return;const full=await reaction.fetch().catch(()=>null);if(!full?.message?.guild)return;const message=full.message,g=guild(message.guild.id),settings=g.settings.starboard;if(!settings.enabled||!settings.channelId||!starboardMatches(reaction,settings.emoji)||message.channel.id===settings.channelId||(reaction.count||0)<settings.threshold)return;const channel=await message.guild.channels.fetch(settings.channelId).catch(()=>null);if(!channel?.isTextBased())return;const embed=card('Starboard',`**${message.author?.tag||'Member'}**\n${message.content||'Attachment-only message'}\n[Jump to message](${message.url})`,COLOURS.warning,{image:message.attachments.first()?.url});const existing=g.starboard[message.id];if(existing){const posted=await channel.messages.fetch(existing).catch(()=>null);if(posted)await posted.edit({embeds:[embed],allowedMentions:{parse:[]}}).catch(()=>{});}else{const posted=await channel.send({embeds:[embed],allowedMentions:{parse:[]}}).catch(()=>null);if(posted)g.starboard[message.id]=posted.id;}store.scheduleSave();});client.on('messageReactionRemove',async reaction=>{const full=await reaction.fetch().catch(()=>null);if(!full?.message?.guild)return;const message=full.message,g=guild(message.guild.id),settings=g.settings.starboard,postedId=g.starboard?.[message.id];if(!settings.enabled||!postedId||!starboardMatches(reaction,settings.emoji))return;if((reaction.count||0)<settings.threshold){const channel=await message.guild.channels.fetch(settings.channelId).catch(()=>null);const posted=channel?.isTextBased()?await channel.messages.fetch(postedId).catch(()=>null):null;await posted?.delete().catch(()=>{});delete g.starboard[message.id];store.scheduleSave();}});
client.on('guildMemberRemove',async m=>{const g=guild(m.guild.id),c=g.settings.goodbye;if(!c.enabled||!c.channelId)return;const ch=await m.guild.channels.fetch(c.channelId).catch(()=>null);if(!ch?.isTextBased())return;const description=c.message.replaceAll('{{user}}',m.user?.username||'A member').replaceAll('{{server}}',m.guild.name).replaceAll('{{count}}',String(m.guild.memberCount));await ch.send(onboardingPayload({...c,title:c.title||'Goodbye',color:c.color||COLOURS.warning},description,m.id)).catch(()=>{});});
client.on('messageCreate',async m=>{if(!m.guild||m.author.bot)return;const g=guild(m.guild.id),c=g.settings.automod,member=m.member;if(!c.enabled||c.exemptChannels.includes(m.channel.id)||c.exemptRoles.some(roleId=>member?.roles?.cache?.has(roleId)))return;const key=m.guild.id+':'+m.author.id,now=Date.now(),history=(spamWindows.get(key)||[]).filter(at=>now-at<5000);history.push(now);spamWindows.set(key,history);const letters=m.content.match(/[A-Za-z]/g)||[],upper=m.content.match(/[A-Z]/g)||[],mentions=m.mentions.users.size+m.mentions.roles.size,caps=c.caps&&letters.length>=10&&upper.length/letters.length>=0.7,spam=c.spam&&history.length>=5,mentionSpam=Number(c.mentions)>0&&mentions>Number(c.mentions),bad=(c.links&&/https?:\/\//i.test(m.content))||c.words.some(x=>m.content.toLowerCase().includes(x))||caps||spam||mentionSpam;if(bad){await m.delete().catch(()=>{});const n=await m.channel.send({embeds:[card('Automod action',`<@${m.author.id}>, that message was removed by this server's safety rules.`,COLOURS.warning)],allowedMentions:{users:[m.author.id]}}).catch(()=>null);setTimeout(()=>n?.delete().catch(()=>{}),5000);}});
client.on('interactionCreate',async i=>{if(!i.isButton()||!i.customId.startsWith('marriage:'))return;try{const [,action,from,to]=i.customId.split(':'),g=guild(i.guild.id),p=g.relationships?.[from];if(i.user.id!==to)throw new Error('This proposal is addressed to another member.');if(!p||p.status!=='pending'||p.to!==i.user.id)throw new Error('This proposal is no longer available.');if(action==='decline'){delete g.relationships[from];store.scheduleSave();return i.update({embeds:[card('Proposal declined','No relationship was created.',COLOURS.neutral)],components:[]});}g.relationships[from]={status:'married',with:i.user.id,at:Date.now()};g.relationships[i.user.id]={status:'married',with:from,at:Date.now()};g.marriageHistory||=[];g.marriageHistory.unshift({a:from,b:i.user.id,at:Date.now(),action:'married'});store.scheduleSave();return i.update({embeds:[card('Relationship confirmed',`<@${from}> and <@${i.user.id}> are now married by mutual consent.`,COLOURS.success)],components:[],allowedMentions:{users:[from,i.user.id]}});}catch(e){return i.reply({embeds:[card('Proposal unavailable',clean(e.message,500),COLOURS.warning)],flags:64,allowedMentions:{parse:[]}}).catch(()=>{});}});
async function tick(){for(const d of client.guilds.cache.values()){const g=guild(d.id);for(const r of g.reminders){const due=Number(r.nextAt||r.at||0);if(r.expiresAt&&r.expiresAt<=Date.now()){r.enabled=false;continue;}if(!r.enabled||due>Date.now())continue;if(reminderShouldSkip(r,due)){const skippedNext=nextReminderTime(r,due);if(skippedNext)r.nextAt=skippedNext;else r.enabled=false;continue;}const c=await d.channels.fetch(r.channelId).catch(()=>null);if(c?.isTextBased()){const sent=await c.send({content:reminderPingText(r),embeds:[reminderCard(r,'<#'+r.channelId+'>')],files:assetFiles(r.imageAsset,r.thumbnailAsset),allowedMentions:reminderAllowedMentions(r)}).catch(()=>null);if(sent)r.lastMessageId=sent.id;}const next=nextReminderTime(r,due);if(next)r.nextAt=next;else r.enabled=false;}for(const x of (g.giveaways||[]).filter(x=>!x.ended&&x.endsAt<=Date.now())){x.ended=true;const eligible=await chooseGiveawayWinners(d,g,x);await refreshGiveawayMessage(d,x);const c=await d.channels.fetch(x.channelId).catch(()=>null)||d.channels.cache.find(y=>y.isTextBased()&&y.permissionsFor(client.user)?.has('SendMessages'));if(c){const rolePing=x.pingRoleId?'<@&'+x.pingRoleId+'>':undefined;await c.send({content:rolePing,embeds:[giveawayCard(x),card('Giveaway result',x.winnerIds.length?x.winnerIds.map(id=>'<@'+id+'>').join(', '):'No eligible entries.',COLOURS.success)],files:assetFiles(x.imageAsset,x.thumbnailAsset),allowedMentions:{users:x.winnerIds,roles:x.pingRoleId?[x.pingRoleId]:[]}}).catch(()=>{});}if(x.dmWinners){for(const item of eligible.slice(0,x.winners||1)){await item.member.send({embeds:[card('Giveaway won','You won **'+x.prize+'** in **'+d.name+'**.',COLOURS.success)],allowedMentions:{parse:[]}}).catch(()=>{});}}}}store.scheduleSave();}
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  const g = guild(message.guild.id);
  g.afk ||= {};
  const ownNote = g.afk[message.author.id];
  if (ownNote) {
    delete g.afk[message.author.id];
    store.scheduleSave();
    await message.reply({ embeds: [card('AFK cleared', 'Your AFK status has been cleared because you are active again.', COLOURS.success)], allowedMentions: { parse: [] } }).catch(() => {});
  }
  const mentioned = [...message.mentions.users.values()].filter(user => !user.bot && g.afk[user.id]);
  if (!mentioned.length) return;
  const lines = mentioned.slice(0, 10).map(user => `<@${user.id}> is AFK: ${safeMentionText(g.afk[user.id])}`);
  await message.reply({ embeds: [card('AFK notice', lines.join('\n'), COLOURS.info)], allowedMentions: { users: mentioned.map(user => user.id) } }).catch(() => {});
});
const renderAutomationText = (value, message) => String(value || '').replaceAll('{user}', `<@${message.author.id}>`).replaceAll('{username}', message.author.username).replaceAll('{server}', message.guild.name).replaceAll('{channel}', `<#${message.channel.id}>`).replaceAll('{avatar}', message.author.displayAvatarURL({ extension: 'png', size: 256 }));
const automationAllowed = (message, item) => (!item.allowedChannelId || item.allowedChannelId === message.channel.id) && (!item.allowedRoleId || message.member?.roles?.cache?.has(item.allowedRoleId));
const sendAutomationCard = async (message, item, title = item.name || item.trigger || 'Automatic response') => { if (!automationAllowed(message, item)) return false; if (item.deleteTrigger) await message.delete().catch(() => {}); const asset = assetOnDisk(item.imageAsset); await message.reply({ embeds: [card(title, renderAutomationText(item.response, message), COLOURS.brand, { image: embedAssetUrl(asset) })], files: assetFiles(asset), allowedMentions: item.silent ? { parse: [] } : { users: [message.author.id] } }).catch(() => {}); return true; };
client.on('messageCreate',async m=>{if(!m.guild||m.author.bot)return;const g=guild(m.guild.id),text=m.content.trim().toLowerCase(),prefix=(g.settings.prefix||'!').toLowerCase(),raw=text.startsWith(prefix)?text.slice(prefix.length).trim():'';if(raw.startsWith('tag ')){const tag=g.tags?.[raw.slice(4).trim()];if(tag)return sendAutomationCard(m,{...tag,name:tag.name});}const [customName,...customArgs]=raw.split(/\s+/).filter(Boolean),custom=customName?g.customCommands?.[customName]:null;if(custom&&automationAllowed(m,custom)){const item={...custom,response:custom.response.replaceAll('{args}',customArgs.join(' '))};return sendAutomationCard(m,item,custom.trigger);}const match=g.autoresponders?.find(x=>{const trigger=String(x.trigger).toLowerCase();return automationAllowed(m,x)&&(x.wildcard?text.includes(trigger):text===trigger||text.startsWith(`${trigger} `));});if(match)return sendAutomationCard(m,match,'Automatic response');});
client.on('interactionCreate',async i=>{if(!i.isButton()||!i.customId.startsWith('emoji-export:'))return;const page=Number(i.customId.split(':')[2])||0,rows=[...[...i.guild.emojis.cache.values()].map(x=>`${x.animated?'a':''}:${x.name}:${x.id}`),...[...i.guild.stickers.cache.values()].map(x=>`sticker:${x.name}:${x.id}`)],pages=Math.max(1,Math.ceil(rows.length/35)),chunk=rows.slice(page*35,page*35+35);return i.update({embeds:[card('Server expressions',chunk.length?chunk.join('\n'):'No custom emoji or stickers are configured.',COLOURS.info,{footer:`Page ${page+1} of ${pages}`})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`emoji-export:prev:${Math.max(0,page-1)}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page===0),new ButtonBuilder().setCustomId(`emoji-export:next:${Math.min(pages-1,page+1)}`).setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(page>=pages-1))],allowedMentions:{parse:[]}});});
client.on('messageDelete',async message=>{if(!message.guild||message.author?.bot)return;const g=guild(message.guild.id);await emitLog(message.guild,g,'message-delete',`A message by **${message.author?.tag||'unknown member'}** was deleted in <#${message.channelId}>.\n${clean(message.content||'Attachment or embed only.',1000)}`);});
client.on('messageUpdate',async (before, after)=>{if(!after.guild||after.author?.bot||before.content===after.content)return;const g=guild(after.guild.id);await emitLog(after.guild,g,'message-update',`A message by **${after.author?.tag||'unknown member'}** was edited in <#${after.channelId}>.\nBefore: ${clean(before.content||'Attachment or embed only.',400)}\nAfter: ${clean(after.content||'Attachment or embed only.',400)}`);});
client.on('guildBanAdd',async ban=>{const g=guild(ban.guild.id);await emitLog(ban.guild,g,'ban',`**${ban.user.tag}** was banned.`);});
client.on('guildMemberAdd',async member=>{const g=guild(member.guild.id);await emitLog(member.guild,g,'member-join',`**${member.user.tag}** joined the server.`);});
client.on('guildMemberRemove',async member=>{const g=guild(member.guild.id);await emitLog(member.guild,g,'member-leave',`**${member.user.tag}** left or was removed from the server.`);});
client.on('channelCreate',async channel=>{if(!channel.guild)return;const g=guild(channel.guild.id);await emitLog(channel.guild,g,'channel-create',`Channel <#${channel.id}> was created.`);});
client.on('channelDelete',async channel=>{if(!channel.guild)return;const g=guild(channel.guild.id);await emitLog(channel.guild,g,'channel-delete',`Channel **${channel.name || channel.id}** was deleted.`);});
client.on('channelUpdate',async (before, after)=>{if(!after.guild)return;const g=guild(after.guild.id);await emitLog(after.guild,g,'channel-update',`Channel <#${after.id}> was updated.`);});
client.on('roleCreate',async role=>{const g=guild(role.guild.id);await emitLog(role.guild,g,'role-create',`Role **${role.name}** was created.`);});
client.on('roleDelete',async role=>{const g=guild(role.guild.id);await emitLog(role.guild,g,'role-delete',`Role **${role.name}** was deleted.`);});
client.on('roleUpdate',async (before, after)=>{const g=guild(after.guild.id);await emitLog(after.guild,g,'role-update',`Role **${after.name}** was updated.`);});
client.on('emojiCreate',async emoji=>{const g=guild(emoji.guild.id);await emitLog(emoji.guild,g,'emoji-create',`Emoji **${emoji.name}** was added.`);});
client.on('emojiDelete',async emoji=>{const g=guild(emoji.guild.id);await emitLog(emoji.guild,g,'emoji-delete',`Emoji **${emoji.name}** was removed.`);});
client.on('emojiUpdate',async (before, after)=>{const g=guild(after.guild.id);await emitLog(after.guild,g,'emoji-update',`Emoji **${after.name}** was updated.`);});
client.on('voiceStateUpdate',async (before, after)=>{if(!after.guild||before.channelId===after.channelId)return;const g=guild(after.guild.id);await emitLog(after.guild,g,'voice-update',`**${after.member?.user?.tag || after.id}** moved voice channels.`);});

// Public text interactions remain ordinary messages, while their results use the same restrained card system.
const interactionReply = (message, title, description, colour = COLOURS.info, options = {}) => message.reply({ embeds: [card(title, description, colour, options)], allowedMentions: options.allowedMentions || { parse: [] }, ...(options.files ? { files: options.files } : {}) });
async function handleInteractionMessage(message) {
  if (!message.guild || message.author.bot) return;
  const g = guild(message.guild.id);
  if (g.settings.ignoredChannels?.includes(message.channel.id)) return;
  const parts = normalParts(message.content, g.settings.prefix || "!");
  if (!parts || parts.action !== "react") return;
  try {
    const args = parts.rest.split(/\s+/).filter(Boolean);
    const action = (args.shift() || "help").toLowerCase();
    const account = row(g, message.author);
    g.economy ||= { quests: {}, shop: [], inventory: {} };
    if (!g.economy.shop?.length) g.economy.shop = [{ id: "badge", name: "Profile badge", price: 500 }, { id: "boost", name: "Server boost token", price: 1000 }];
    if (["cowoncy", "balance"].includes(action)) return interactionReply(message, "Coin balance", "<@" + message.author.id + "> has **" + (account.coins || 0) + "** coins.", COLOURS.success, { allowedMentions: { users: [message.author.id] } });
    if (action === "daily") {
      if (Date.now() - account.daily < 86400000) return interactionReply(message, "Daily reward", "Your next reward is available <t:" + Math.floor((account.daily + 86400000) / 1000) + ":R>.", COLOURS.neutral);
      account.coins = (account.coins || 0) + 25; account.daily = Date.now(); store.scheduleSave();
      return interactionReply(message, "Daily reward", "<@" + message.author.id + "> received **25** public coins.", COLOURS.success, { allowedMentions: { users: [message.author.id] } });
    }
    if (action === "give") {
      const target = message.mentions.users.first(), amount = Number(args.find(value => /^\d+$/.test(value)));
      if (!target || !amount || amount < 1) throw new Error("Use react give @member amount.");
      if ((account.coins || 0) < amount) throw new Error("You do not have enough coins.");
      account.coins -= amount; const recipient = row(g, target); recipient.coins = (recipient.coins || 0) + amount; store.scheduleSave();
      return interactionReply(message, "Transfer complete", "Transferred **" + amount + "** coins to <@" + target.id + ">.", COLOURS.success, { allowedMentions: { users: [message.author.id, target.id] } });
    }
    if (action === "quest") {
      const key = message.author.id + ":" + new Date().toISOString().slice(0, 10), entry = g.economy.quests[key] ||= { count: 0, claimed: false };
      entry.count += 1;
      if (entry.count >= 5 && !entry.claimed) { entry.claimed = true; account.coins = (account.coins || 0) + 75; store.scheduleSave(); return interactionReply(message, "Quest complete", "Your daily public quest is complete. **75** coins have been added.", COLOURS.success); }
      store.scheduleSave(); return interactionReply(message, "Daily quest", "Progress: **" + Math.min(5, entry.count) + "/5** qualifying actions.", COLOURS.info);
    }
    if (action === "shop") return interactionReply(message, "Public shop", g.economy.shop.map(item => "**" + item.id + "** · " + item.name + " · " + item.price + " coins").join("\n"), COLOURS.success);
    if (action === "buy") {
      const item = g.economy.shop.find(value => value.id === args[0]);
      if (!item || (account.coins || 0) < item.price) throw new Error("That shop item is unavailable or your balance is too low.");
      account.coins -= item.price; g.economy.inventory[message.author.id] ||= []; g.economy.inventory[message.author.id].push(item.id); store.scheduleSave();
      return interactionReply(message, "Purchase complete", "You acquired **" + item.name + "**.", COLOURS.success);
    }
    if (action === "roll") { const sides = Math.max(2, Math.min(100, Number(args[0]) || 6)); return interactionReply(message, "Dice roll", "**" + (1 + Math.floor(Math.random() * sides)) + "** on a d" + sides + "."); }
    if (action === "coinflip") return interactionReply(message, "Coin flip", Math.random() < 0.5 ? "**Heads**." : "**Tails**.");
    if (action === "choose") { const choices = parts.rest.slice(action.length).split("|").map(value => value.trim()).filter(Boolean); return interactionReply(message, "Choice", choices.length ? "I choose **" + choices[Math.floor(Math.random() * choices.length)] + "**." : "Provide choices separated by |."); }
    if (action === "gif" || action === "image" || action === "meme") {
      const attached = message.attachments.first();
      const url = attached?.contentType?.startsWith("image/") ? attached.url : await liveMedia(args.join(" ") || (action === "meme" ? "meme" : "reaction"));
      return interactionReply(message, action === "gif" ? "GIF" : action === "meme" ? "Meme result" : "Image result", url ? "A live result from the configured media provider." : "No media provider is configured.", url ? COLOURS.music : COLOURS.warning, { image: url || undefined });
    }
    if (action === "translate") return interactionReply(message, "Translation", "[Open the translation tool](https://translate.google.com/?sl=auto&tl=en&text=" + encodeURIComponent(args.join(" ")) + ")");
    if (action === "help") return interactionReply(message, "Public interactions", "Use react hug @member, react kiss @member, react kill @member, react pat @member, react slap @member, react gif <search>, or react daily. These are ordinary channel messages; no slash action is added.", COLOURS.music);
    if (!INTERACTION_ACTIONS.includes(action)) return;
    const target = message.mentions.users.first();
    if (!target) throw new Error("Mention a member, for example: react kiss @member.");
    const url = await liveMedia(action + " reaction");
    return interactionReply(message, action[0].toUpperCase() + action.slice(1), "<@" + message.author.id + "> " + INTERACTION_ACTION_TEXT[action] + " " + (target ? "<@" + target.id + ">" : "the channel") + ".", COLOURS.music, { image: url || undefined, allowedMentions: { users: [message.author.id].concat(target ? [target.id] : []) } });
  } catch (error) {
    return interactionReply(message, "Interaction unavailable", clean(error?.message || "The action could not be completed.", 500), COLOURS.warning);
  }
}
client.prependListener("messageCreate", message => {
  if (!message.guild || message.author.bot) return;
  const configuredPrefix = guild(message.guild.id).settings.prefix || "!";
  const parsed = normalParts(message.content, configuredPrefix);
  if (parsed?.action !== "react") return;
  interactionConsumedMessages.add(message);
  void handleInteractionMessage(message);
});
client.on("messageCreate", message => {
  if (interactionConsumedMessages.has(message)) return;
  void handleInteractionMessage(message);
});
const tickBase = tick;
tick = async function enhancedTick() {
  const due = [];
  for (const server of client.guilds.cache.values()) {
    const g = guild(server.id);
    for (const reminder of g.reminders) {
      if (!reminder.enabled || (reminder.nextAt || reminder.at) > Date.now()) continue;
      const at = reminder.nextAt || reminder.at;
      if (reminderShouldSkip(reminder, at)) {
        const next = nextReminderTime(reminder, at);
        if (next) reminder.nextAt = next;
        else reminder.enabled = false;
      } else {
        due.push({ server, guild: g, reminder, at, lastMessageId: reminder.lastMessageId || '' });
        if (reminder.deletePrevious && reminder.lastMessageId) {
          const channel = await server.channels.fetch(reminder.channelId).catch(() => null);
          const previous = channel?.isTextBased() ? await channel.messages.fetch(reminder.lastMessageId).catch(() => null) : null;
          await previous?.delete().catch(() => {});
        }
      }
    }
    for (const event of g.events || []) {
      if (event.status === 'cancelled' || event.reminderSent || !event.reminderMinutes || !event.startsAt || event.startsAt <= Date.now()) continue;
      const reminderAt = event.startsAt - Number(event.reminderMinutes) * 60000;
      if (reminderAt > Date.now()) continue;
      const channel = await server.channels.fetch(event.channelId).catch(() => null);
      if (channel?.isTextBased() && event.attendees?.length) {
        const content = event.attendees.map(id => `<@${id}>`).join(' ');
        const sent = await channel.send({ content, embeds: [eventCard(event)], files: assetFiles(event.imageAsset, event.thumbnailAsset), components: eventButtons(event), allowedMentions: { users: event.attendees } }).catch(() => null);
        if (sent) event.reminderSent = true;
      } else if (!event.attendees?.length) {
        event.reminderSent = true;
      }
    }
    const birthdayKey = new Intl.DateTimeFormat('en-GB', { timeZone: g.settings.timezone || 'UTC', day: '2-digit', month: '2-digit' }).format(new Date());
    for (const [userId, configured] of Object.entries(g.birthdays || {})) {
      const birthday = typeof configured === 'string' ? { date: configured, channelId: '' } : configured;
      if (!birthday?.channelId || birthday.date !== birthdayKey || birthday.lastAnnounced === birthdayKey) continue;
      const channel = await server.channels.fetch(birthday.channelId).catch(() => null);
      if (!channel?.isTextBased()) continue;
      const sent = await channel.send({ embeds: [card('Birthday wishes', `Today belongs to <@${userId}>. May the year ahead be generous with joy and good fortune.`, COLOURS.success)], allowedMentions: { users: [userId] } }).catch(() => null);
      if (sent) {
        birthday.lastAnnounced = birthdayKey;
        g.birthdays[userId] = birthday;
      }
    }
  }
  store.scheduleSave();
  await tickBase();
  for (const { server, reminder, at, lastMessageId } of due) {
    if ((reminder.lastMessageId || '') === lastMessageId) {
      reminder.enabled = true;
      reminder.nextAt = at;
      continue;
    }
    if (!reminder.enabled) continue;
    const next = nextReminderTime(reminder, at);
    if (next) reminder.nextAt = next;
    const channel = await server.channels.fetch(reminder.channelId).catch(() => null);
    if (channel?.isTextBased()) {
      const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
      const latest = messages?.find(message => message.author?.id === client.user?.id && message.embeds?.[0]?.title?.startsWith(reminder.title || 'Scheduled notice'));
      if (latest) reminder.lastMessageId = latest.id;
    }
  }
  store.scheduleSave();
};
const awardActivityXp = async (server, g, member, amount, kind = 'voice') => {
  if (!member || member.user?.bot) return;
  const settings = g.settings.levels;
  if (settings.exclusions.channels?.includes(member.voice?.channelId)) return;
  if (settings.exclusions.roles?.some(roleId => member.roles?.cache?.has(roleId))) return;
  const entry = row(g, member.user), before = level(entry.xp);
  const gained = Math.max(1, Math.floor(amount));
  entry.xp += gained;
  entry.weeklyXp = (entry.weekKey === weekKey() ? entry.weeklyXp : 0) + gained;
  if (kind === 'voice') entry.voiceXp = (entry.voiceXp || 0) + gained;
  if (kind === 'reaction') entry.reactionXp = (entry.reactionXp || 0) + gained;
  entry.voiceLast = Date.now();
  const after = level(entry.xp);
  if (settings.announce && after > before && settings.channelId) {
    const channel = await server.channels.fetch(settings.channelId).catch(() => null);
    if (channel?.isTextBased()) await channel.send(levelUpPayload(g, member.user, after)).catch(() => {});
  }
};
setInterval(async () => {
  if (!client.isReady()) return;
  for (const server of client.guilds.cache.values()) {
    const g = guild(server.id), settings = g.settings.levels;
    if (!settings.voiceXp) continue;
    for (const channel of server.channels.cache.values()) {
      if (!channel.isVoiceBased?.()) continue;
      const members = [...channel.members.values()].filter(member => !member.user.bot);
      if (members.length < (settings.voiceMinMembers || 2)) continue;
      for (const member of members) {
        const entry = row(g, member.user);
        if (Date.now() - (entry.voiceLast || 0) < 60000) continue;
        await awardActivityXp(server, g, member, settings.xpMin || 8, 'voice');
      }
    }
  }
  store.scheduleSave();
}, 60000).unref();
client.on('messageReactionAdd', async (reaction, user) => {
  const message = reaction.message;
  if (!message.guild || message.author?.bot) return;
  if (!user?.id || user.bot) return;
  const g = guild(message.guild.id), settings = g.settings.levels;
  if (!settings.reactionXp || settings.exclusions.channels?.includes(message.channelId)) return;
  const entry = row(g, user), now = Date.now();
  if (now - (entry.reactionLast || 0) < 60000) return;
  entry.reactionLast = now;
  await awardActivityXp(message.guild, g, await message.guild.members.fetch(user.id).catch(() => null), Math.max(1, Math.floor((settings.xpMin || 8) / 2)), 'reaction');
  store.scheduleSave();
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu() || interaction.customId !== 'event:select' || !interaction.guild) return;
  try {
    const eventId = interaction.values[0], g = guild(interaction.guild.id), event = g.events.find(item => item.id === eventId);
    if (!event || event.status === 'cancelled') throw new Error('That event is no longer available.');
    return interaction.reply({ embeds: [eventCard(event)], files: assetFiles(event.imageAsset, event.thumbnailAsset), components: event.startsAt > Date.now() ? eventButtons(event) : [], flags: 64, allowedMentions: { parse: [] } });
  } catch (error) {
    return interaction.reply({ embeds: [card('Event unavailable', clean(error.message, 500), COLOURS.warning)], flags: 64, allowedMentions: { parse: [] } }).catch(() => {});
  }
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu() || interaction.customId !== 'giveaway:select' || !interaction.guild) return;
  try {
    const giveawayId = interaction.values[0], g = guild(interaction.guild.id), giveaway = g.giveaways.find(item => item.id === giveawayId);
    if (!giveaway || giveaway.ended) throw new Error('That giveaway is no longer active.');
    return interaction.reply({
      embeds: [giveawayCard(giveaway)],
      files: assetFiles(giveaway.imageAsset, giveaway.thumbnailAsset),
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway:' + giveaway.id).setLabel('Enter giveaway').setStyle(ButtonStyle.Primary))],
      flags: 64,
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    return interaction.reply({ embeds: [card('Giveaway unavailable', clean(error.message, 500), COLOURS.warning)], flags: 64, allowedMentions: { parse: [] } }).catch(() => {});
  }
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.customId.startsWith('poll:vote:') || !interaction.guild) return;
  try {
    const [, , pollId, choiceText] = interaction.customId.split(':');
    const g = guild(interaction.guild.id), poll = g.polls?.[pollId];
    if (!poll) throw new Error('This poll no longer exists.');
    const choice = Number(choiceText);
    if (!Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) throw new Error('That poll option is no longer available.');
    poll.votes ||= {};
    poll.votes[interaction.user.id] = { choice, at: Date.now() };
    store.scheduleSave();
    return interaction.update({ embeds: [pollCard(poll)], components: pollButtons(poll), files: pollFiles(poll), allowedMentions: { parse: [] } });
  } catch (error) {
    const payload = { embeds: [card('Poll unavailable', clean(error.message, 500), COLOURS.warning)], flags: 64, allowedMentions: { parse: [] } };
    if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => {});
    return interaction.reply(payload).catch(() => {});
  }
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.customId.startsWith('suggestion:') || !interaction.guild) return;
  try {
    const [, direction, suggestionId] = interaction.customId.split(':'), g = guild(interaction.guild.id), suggestion = g.suggestions?.find(item => item.id === suggestionId);
    if (!suggestion) throw new Error('This suggestion no longer exists.');
    suggestion.votes ||= { up: [], down: [] };
    suggestion.votes.up ||= [];
    suggestion.votes.down ||= [];
    suggestion.votes.up = suggestion.votes.up.filter(id => id !== interaction.user.id);
    suggestion.votes.down = suggestion.votes.down.filter(id => id !== interaction.user.id);
    suggestion.votes[direction === 'up' ? 'up' : 'down'].push(interaction.user.id);
    store.scheduleSave();
    return interaction.update({ embeds: [suggestionCard(suggestion)], files: assetFiles(suggestion.imageAsset), components: suggestionButtons(suggestion), allowedMentions: { parse: [] } });
  } catch (error) {
    return interaction.reply({ embeds: [card('Suggestion unavailable', clean(error.message, 500), COLOURS.warning)], flags: 64, allowedMentions: { parse: [] } }).catch(() => {});
  }
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.customId.startsWith('event:rsvp:') || !interaction.guild) return;
  try {
    const eventId = interaction.customId.split(':')[2], g = guild(interaction.guild.id), event = g.events.find(item => item.id === eventId);
    if (!event) throw new Error('This event no longer exists.');
    if (event.status === 'cancelled' || event.startsAt < Date.now()) throw new Error('This event is no longer accepting RSVPs.');
    if (event.restrictedRoleId && !interaction.member?.roles?.cache?.has(event.restrictedRoleId)) throw new Error('You do not have the role required for this event.');
    event.attendees ||= [];
    event.waitlist ||= [];
    const current = event.attendees.indexOf(interaction.user.id);
    if (current >= 0) {
      event.attendees.splice(current, 1);
      event.waitlist = (event.waitlist || []).filter(id => id !== interaction.user.id);
      await setEventRole(interaction.guild, event, interaction.user.id, false);
      let promoted = '';
      while (event.waitlist.length && !promoted) {
        const candidateId = event.waitlist.shift();
        const candidate = await interaction.guild.members.fetch(candidateId).catch(() => null);
        if (!candidate || (event.restrictedRoleId && !candidate.roles.cache.has(event.restrictedRoleId))) continue;
        promoted = candidateId;
        event.attendees.push(candidateId);
        await setEventRole(interaction.guild, event, candidateId, true);
      }
    } else if (Number(event.capacity || 0) > 0 && event.attendees.length >= Number(event.capacity)) {
      if (!event.waitlist.includes(interaction.user.id)) event.waitlist.push(interaction.user.id);
    } else {
      event.attendees.push(interaction.user.id);
      event.waitlist = event.waitlist.filter(id => id !== interaction.user.id);
      await setEventRole(interaction.guild, event, interaction.user.id, true);
    }
    store.scheduleSave();
    return interaction.update({ embeds: [eventCard(event)], files: assetFiles(event.imageAsset, event.thumbnailAsset), components: event.status === 'cancelled' ? [] : eventButtons(event), allowedMentions: { parse: [] } });
  } catch (error) {
    const payload = { embeds: [card('RSVP unavailable', clean(error.message, 500), COLOURS.warning)], flags: 64, allowedMentions: { parse: [] } };
    if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => {});
    return interaction.reply(payload).catch(() => {});
  }
});
if(process.env.COMMAND_ONLY!=='1' && process.env.PUBLIC_BOT_NO_LOGIN!=='1')client.login(token).catch(e=>{console.error(e.message);process.exitCode=1;});
const utilityWithoutForcedProfileMedia = utility;
utility = async function utilityWithoutForcedProfileMediaHandler(i, g) {
  if (i.options.getSubcommand() === 'userinfo') {
    const selected = i.options.getUser('member') || i.user;
    return replyCard(i, `User information · ${selected.username}`, `ID: ${selected.id}\nCreated: <t:${Math.floor(selected.createdTimestamp / 1000)}:F>`, COLOURS.info);
  }
  return utilityWithoutForcedProfileMedia(i, g);
};
export { dispatch, guild, level, xpAt, normalParts, rankPayload };
