import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const COLOURS = {
  brand: 0x5865f2, success: 0x35c98b, warning: 0xf2b84b, danger: 0xed5964,
  info: 0x38bdf8, music: 0x9b6cff, level: 0xffc857, neutral: 0x3f4654
};

export function clean(value, max = 4000) {
  return String(value ?? '').replaceAll('\u0000', '').trim().slice(0, max);
}

export function safeMentionText(value) {
  return clean(value).replace(/@(everyone|here)/gi, '@\u200b$1');
}

export function card(title, description = '', colour = COLOURS.brand, options = {}) {
  const embed = new EmbedBuilder().setColor(colour).setTitle(clean(title, 256)).setDescription(safeMentionText(description));
  if (options.fields?.length) embed.addFields(options.fields.slice(0, 25).map(field => ({ name: clean(field.name, 256), value: safeMentionText(field.value).slice(0, 1024), inline: Boolean(field.inline) })));
  if (options.thumbnail) embed.setThumbnail(String(options.thumbnail));
  if (options.image) embed.setImage(String(options.image));
  if (options.author) embed.setAuthor({ name: clean(options.author.name, 256), ...(options.author.iconURL ? { iconURL: options.author.iconURL } : {}) });
  if (options.footer) embed.setFooter({ text: clean(options.footer, 2048) });
  if (options.timestamp) embed.setTimestamp(options.timestamp === true ? new Date() : options.timestamp);
  return embed;
}

export function replyCard(interaction, title, description, colour = COLOURS.brand, options = {}) {
  const payload = { embeds: [card(title, description, colour, options)], allowedMentions: options.allowedMentions || { parse: [] } };
  if (options.components) payload.components = options.components;
  if (options.files) payload.files = options.files;
  if (options.ephemeral) payload.flags = 64;
  return interaction.reply(payload);
}

export function updateCard(interaction, title, description, colour = COLOURS.brand, options = {}) {
  return interaction.update({ embeds: [card(title, description, colour, options)], components: options.components || [], allowedMentions: options.allowedMentions || { parse: [] } });
}

export function pageButtons(prefix, page, pages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}:prev:${Math.max(0, page - 1)}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`${prefix}:next:${Math.min(pages - 1, page + 1)}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1)
  );
}

export function moderationCard(caseRow, guildName) {
  return card(`Case #${caseRow.number || '—'} · ${caseRow.action}`, `**Member:** <@${caseRow.userId}>\n**Reason:** ${safeMentionText(caseRow.reason || 'No reason supplied.')}`, COLOURS.warning);
}

export function levelCard({ user, level, xp, nextXp, rank, progress, rewards = [], backgroundAsset, accent, cardImage, showAvatar = false }) {
  const bars = Math.min(20, Math.max(0, Math.round(progress * 20)));
  return card(`Level ${level} · ${user.displayName || user.username}`, `${'▰'.repeat(bars)}${'▱'.repeat(20 - bars)}\n**${xp.toLocaleString()} XP** · ${Math.max(0, nextXp - xp).toLocaleString()} XP to the next level`, accent || COLOURS.level, {
    image: cardImage || (backgroundAsset?.name ? `attachment://${backgroundAsset.name}` : undefined),
    thumbnail: showAvatar ? (user.displayAvatarURL?.({ extension: 'png', size: 256 }) || undefined) : undefined,
    fields: [{ name: 'Server rank', value: rank ? `#${rank}` : 'Unranked', inline: true }, { name: 'Rewards', value: rewards.length ? rewards.map(x => `<@&${x}>`).join(', ') : 'No reward role at this level.', inline: true }]
  });
}

export async function renderLevelCard({ user, level, xp, nextXp, rank, progress, rewards = [], backgroundAsset, accent = COLOURS.level, showAvatar = false }) {
  try {
    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const canvas = createCanvas(1200, 520), ctx = canvas.getContext('2d');
    const parsed = typeof accent === 'string' ? Number.parseInt(accent.replace(/^#/, ''), 16) : Number(accent);
    const colour = Number.isFinite(parsed) ? parsed : COLOURS.level, hex = `#${colour.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = '#10131b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (backgroundAsset?.path) { const background = await loadImage(backgroundAsset.path); ctx.drawImage(background, 0, 0, canvas.width, canvas.height); ctx.fillStyle = 'rgba(8,10,16,.72)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height); gradient.addColorStop(0, `${hex}66`); gradient.addColorStop(1, '#10131b'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = hex; ctx.fillRect(0, 0, 18, canvas.height);
    ctx.font = '700 46px sans-serif'; ctx.fillStyle = '#f5f7ff'; ctx.fillText(`LEVEL ${level}`, 70, 92);
    ctx.font = '600 32px sans-serif'; ctx.fillStyle = '#c7cfdf'; ctx.fillText(clean(user.displayName || user.username, 40), 70, 145);
    ctx.font = '500 25px sans-serif'; ctx.fillStyle = '#98a3b8'; ctx.fillText(`Server rank  #${rank || '—'}`, 70, 192);
    const barX = 70, barY = 250, barW = 1060, barH = 34; ctx.fillStyle = '#262c3b'; ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 17); ctx.fill(); ctx.fillStyle = hex; ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(24, barW * Math.max(0, Math.min(1, progress))), barH, 17); ctx.fill();
    ctx.font = '600 25px sans-serif'; ctx.fillStyle = '#f5f7ff'; ctx.fillText(`${xp.toLocaleString()} XP`, 70, 335); ctx.fillStyle = '#98a3b8'; ctx.fillText(`${Math.max(0, nextXp - xp).toLocaleString()} XP to the next level`, 260, 335);
    ctx.font = '500 23px sans-serif'; ctx.fillStyle = '#c7cfdf'; ctx.fillText(rewards.length ? `Rewards earned: ${rewards.length}` : 'No reward role at this level', 70, 390);
    if (showAvatar) { try { const avatar = await loadImage(user.displayAvatarURL?.({ extension: 'png', size: 256 }) || ''); const x=1010,y=110,r=78; ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();ctx.drawImage(avatar,x-r,y-r,r*2,r*2);ctx.restore();ctx.strokeStyle=hex;ctx.lineWidth=8;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke(); } catch {} }
    return { attachment: canvas.toBuffer('image/png'), name: 'rank-card.png' };
  } catch { return null; }
}

export function reminderCard(reminder, channelMention = '') {
  const status = reminder.enabled === false ? 'Paused' : 'Active';
  const repeat = String(reminder.repeat || reminder.kind || 'once').toLowerCase();
  const nextAt = Number(reminder.nextAt || reminder.at || 0);
  const schedule = repeat === 'once' ? (nextAt > 0 ? `<t:${Math.floor(nextAt / 1000)}:F>` : 'Not scheduled') : `${repeat}${reminder.interval && reminder.interval > 1 ? ` · every ${reminder.interval} ${reminder.intervalUnit || 'hours'}` : ''}`;
  const pings = reminder.pings?.length ? reminder.pings.map(ping => ping.type === 'role' ? `<@&${ping.id}>` : `<@${ping.id}>`).join(' ') : (reminder.mentionRoleId ? `<@&${reminder.mentionRoleId}>` : 'None');
  return card(`${reminder.title || 'Reminder'} · ${status}`, clean(reminder.reason || reminder.content || 'No message supplied.', 2000), reminder.enabled === false ? COLOURS.neutral : (reminder.color || COLOURS.info), {
    fields: [{ name: 'Schedule', value: schedule, inline: true }, { name: 'Channel', value: channelMention || `<#${reminder.channelId}>`, inline: true }, { name: 'Pings', value: pings, inline: true }],
    image: reminder.imageAsset?.name ? `attachment://${reminder.imageAsset.name}` : reminder.imageUrl || undefined,
    thumbnail: reminder.thumbnailAsset?.name ? `attachment://${reminder.thumbnailAsset.name}` : reminder.thumbnailUrl || undefined,
    footer: reminder.footer || undefined,
    timestamp: reminder.showTimestamp ? true : undefined
  });
}

export function nowPlayingCard(track, queue = []) {
  return card('Now playing', `**${clean(track?.title || 'Nothing queued', 256)}**\n${track?.url ? `[Open source](${track.url})` : 'Queue a track with /music play'}`, COLOURS.music, {
    thumbnail: track?.thumbnail || undefined,
    fields: [{ name: 'Queue', value: `${queue.length} queued`, inline: true }, { name: 'Duration', value: track?.duration || 'Live', inline: true }]
  });
}

export function giveawayCard(giveaway) {
  const requirements = giveaway.hideRequirements ? '' : `${giveaway.requiredRoleId ? `\nRequired role: <@&${giveaway.requiredRoleId}>` : ''}${giveaway.blockedRoleId ? `\nBlocked role: <@&${giveaway.blockedRoleId}>` : ''}${giveaway.minimumLevel != null ? `\nMinimum level: **${giveaway.minimumLevel}**` : ''}${giveaway.accountAgeDays ? `\nAccount age: **${giveaway.accountAgeDays} days**` : ''}${giveaway.serverAgeDays ? `\nServer membership: **${giveaway.serverAgeDays} days**` : ''}${giveaway.requirement ? `\nRequirement: ${safeMentionText(giveaway.requirement)}` : ''}`;
  return card(`${giveaway.prize} · Giveaway`, `${giveaway.description ? `${safeMentionText(giveaway.description)}\n` : ''}Hosted by <@${giveaway.hostId}>\nEntries: **${giveaway.entries?.length || 0}**${requirements}`, giveaway.color || COLOURS.warning, {
    fields: [{ name: 'Ends', value: `<t:${Math.floor(giveaway.endsAt / 1000)}:R>`, inline: true }, { name: 'Winners', value: String(giveaway.winners || 1), inline: true }, { name: 'Status', value: giveaway.ended ? 'Ended' : 'Open', inline: true }],
    image: giveaway.imageAsset?.name ? `attachment://${giveaway.imageAsset.name}` : giveaway.imageUrl || undefined,
    thumbnail: giveaway.thumbnailAsset?.name ? `attachment://${giveaway.thumbnailAsset.name}` : giveaway.thumbnailUrl || undefined,
    footer: giveaway.footer || undefined
  });
}

export function eventCard(event) {
  const capacity = Number(event.capacity || 0);
  const attendees = event.attendees?.length || 0;
  const waitlist = event.waitlist?.length || 0;
  const attendance = capacity > 0
    ? `${attendees}/${capacity}${waitlist ? ` · waitlist ${waitlist}` : ''}`
    : `${attendees}${waitlist ? ` · waitlist ${waitlist}` : ''}`;
  const access = event.restrictedRoleId ? `Restricted to <@&${event.restrictedRoleId}>.` : '';
  const startsAt = Number(event.startsAt || 0);
  return card(`${event.title || 'Event'} · Event`, event.description || 'No description supplied.', event.color || COLOURS.info, {
    fields: [{ name: 'When', value: startsAt > 0 ? `<t:${Math.floor(startsAt / 1000)}:F>` : 'Time not set', inline: true }, { name: 'Attendees', value: attendance, inline: true }, { name: 'Host', value: event.hostId ? `<@${event.hostId}>` : 'Not recorded', inline: true }, ...(access ? [{ name: 'Access', value: access, inline: false }] : [])],
    image: event.imageAsset?.name ? `attachment://${event.imageAsset.name}` : event.imageUrl || undefined,
    thumbnail: event.thumbnailAsset?.name ? `attachment://${event.thumbnailAsset.name}` : event.thumbnailUrl || undefined,
    footer: event.footer || undefined,
    timestamp: event.showTimestamp ? true : undefined
  });
}

export function marriageCard({ left, right, marriedAt, profile = {}, totalMessages = 0, serverRows = [] }) {
  const servers = serverRows.length
    ? serverRows.map(row => `**${clean(row.name || 'Shared server', 80)}** · ${Number(row.messages || 0).toLocaleString()} messages`).join('\n')
    : 'No shared-server chat activity has been recorded yet.';
  const description = [
    profile.bio || 'A private shared profile for a married couple.',
    `Married since <t:${Math.floor(Number(marriedAt || Date.now()) / 1000)}:D>.`,
    `Combined messages across shared servers: **${Number(totalMessages || 0).toLocaleString()}**.`
  ].join('\n\n');
  return card(profile.title || `${left.displayName || left.username} · ${right.displayName || right.username}`, description, COLOURS.warning, {
    fields: [
      { name: 'Partners', value: `<@${left.id}> · <@${right.id}>`, inline: false },
      { name: 'Shared-server activity', value: servers, inline: false }
    ],
    image: profile.imageAsset?.name ? `attachment://${profile.imageAsset.name}` : profile.imageUrl || undefined,
    thumbnail: profile.thumbnailAsset?.name ? `attachment://${profile.thumbnailAsset.name}` : profile.thumbnailUrl || undefined,
    footer: profile.footer || undefined
  });
}
