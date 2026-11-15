import 'dotenv/config';

// Requested permissions let the copier perform its work; it never copies server role
// definitions, permission overwrites, or member assignments into the target server.
// Generated from the documented Discord permission flag indices.
const bits = [
  4, 6, 10, 11, 13, 14, 15, 16, 20, 21, 28, 29, 30, 31, 34, 35, 36, 38, 40, 43, 51,
];
const clientId = process.env.DISCORD_CLIENT_ID;
if (!clientId || !/^\d{16,25}$/.test(clientId)) {
  console.error('Set DISCORD_CLIENT_ID to your Discord application ID in .env first.');
  process.exit(1);
}
const permissions = bits.reduce((mask, bit) => mask | (1n << BigInt(bit)), 0n);
const url = new URL('https://discord.com/oauth2/authorize');
url.searchParams.set('client_id', clientId);
url.searchParams.set('scope', 'bot applications.commands');
url.searchParams.set('permissions', String(permissions));
console.log('\nInvite the Discord bot to your authorised servers with this URL:\n' + url.toString() + '\n');
