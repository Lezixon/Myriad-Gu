import 'dotenv/config';
import { REST, Routes } from 'discord.js';
process.env.PUBLIC_BOT_NO_LOGIN = '1';
const { slashCommands } = await import('../src/index.js');

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) throw new Error('Set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env.');
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const mode = process.argv[2] || 'guild';
if (mode === 'global') {
  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: slashCommands.map(x => x.toJSON()) });
  console.log(`Registered ${slashCommands.length} grouped commands globally.`);
} else {
  if (!process.env.DEPLOY_GUILD_ID) throw new Error('Set DEPLOY_GUILD_ID for guild command registration.');
  await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DEPLOY_GUILD_ID), { body: slashCommands.map(x => x.toJSON()) });
  console.log(`Registered ${slashCommands.length} grouped commands in the deployment guild.`);
}
