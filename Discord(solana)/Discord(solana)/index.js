require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, EmbedBuilder } = require('discord.js');
const startWebServer = require('./web/server');
const { Connection } = require('@solana/web3.js');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Check required environment variables
const requiredEnv = ['BASE_URL', 'DISCORD_BOT_TOKEN', 'PORT'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Persistent storage file paths
const BUNDLES_PATH = path.join(__dirname, 'bundles.json');
const SESSIONS_PATH = path.join(__dirname, 'sessions.json');
// Add persistent user history
const HISTORY_PATH = path.join(__dirname, 'history.json');

// Load persistent data
function loadData(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`Failed to load ${filePath}:`, err);
  }
  return fallback;
}

function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to save ${filePath}:`, err);
  }
}

let userBundles = loadData(BUNDLES_PATH, {});
global.sendSessions = loadData(SESSIONS_PATH, {});
let userHistory = loadData(HISTORY_PATH, {});

// Save on changes
function saveBundles() { saveData(BUNDLES_PATH, userBundles); }
function saveSessions() { saveData(SESSIONS_PATH, global.sendSessions); }
function saveHistory() { saveData(HISTORY_PATH, userHistory); }

const commands = [
  {
    name: 'connect',
    description: 'Connect your Phantom wallet.'
  },
  {
    name: 'bundle',
    description: 'Bundle Solana transactions.',
    options: [
      {
        name: 'address1',
        description: 'Solana address #1',
        type: 3, // STRING
        required: true
      },
      {
        name: 'amount1',
        description: 'Amount for address #1 (in SOL)',
        type: 3, // STRING
        required: true
      },
      {
        name: 'address2',
        description: 'Solana address #2',
        type: 3,
        required: false
      },
      {
        name: 'amount2',
        description: 'Amount for address #2 (in SOL)',
        type: 3,
        required: false
      },
      {
        name: 'address3',
        description: 'Solana address #3',
        type: 3,
        required: false
      },
      {
        name: 'amount3',
        description: 'Amount for address #3 (in SOL)',
        type: 3,
        required: false
      },
      {
        name: 'address4',
        description: 'Solana address #4',
        type: 3,
        required: false
      },
      {
        name: 'amount4',
        description: 'Amount for address #4 (in SOL)',
        type: 3,
        required: false
      },
      {
        name: 'address5',
        description: 'Solana address #5',
        type: 3,
        required: false
      },
      {
        name: 'amount5',
        description: 'Amount for address #5 (in SOL)',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'preview',
    description: 'Preview your transaction bundle.'
  },
  {
    name: 'status',
    description: 'Get real-time status updates.'
  },
  {
    name: 'send',
    description: 'Send your transaction bundle (sign with Phantom wallet).'
  },
  {
    name: 'gas',
    description: 'Show current Solana transaction fee (in SOL and USD).'
  },
  {
    name: 'mempool',
    description: 'Show current Solana mempool status.'
  }
];

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  switch (interaction.commandName) {
    case 'connect': {
      const connectUrl = `${process.env.BASE_URL}/phantom/connect`;
      await interaction.reply({
        content: `🔗 [Click here to connect your Phantom wallet](${connectUrl})`,
        flags: 1 << 6
      });
      break;
    }
    case 'bundle': {
      // Collect up to 5 address/amount pairs
      const bundle = [];
      const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      for (let i = 1; i <= 5; i++) {
        const address = interaction.options.getString(`address${i}`);
        const amount = interaction.options.getString(`amount${i}`);
        if (address && amount) {
          // Validate address
          if (!solanaAddressRegex.test(address)) {
            await interaction.reply({ content: `❌ Invalid Solana address: ${address}`, ephemeral: true });
            return;
          }
          // Validate amount
          const amountNum = Number(amount);
          if (isNaN(amountNum) || amountNum <= 0) {
            await interaction.reply({ content: `❌ Invalid amount for address ${address}: ${amount}`, ephemeral: true });
            return;
          }
          bundle.push({ address, amount });
        }
      }
      if (bundle.length === 0) {
        await interaction.reply({ content: '❌ Please provide at least one address and amount.', ephemeral: true });
        return;
      }
      userBundles[interaction.user.id] = bundle;
      saveBundles();
      // Generate a unique session ID for this bundle
      const sessionId = `${interaction.user.id}-${Date.now()}`;
      if (!global.sendSessions) global.sendSessions = {};
      global.sendSessions[sessionId] = { bundle };
      saveSessions();
      // Add to user history
      if (!userHistory[interaction.user.id]) userHistory[interaction.user.id] = [];
      userHistory[interaction.user.id].push({ sessionId, bundle, time: Date.now() });
      saveHistory();
      // Build the signing link
      const signUrl = `${process.env.BASE_URL}/phantom/send?session=${sessionId}`;
      // Build embed
      const embed = new EmbedBuilder()
        .setTitle('📦 Bundle Created!')
        .setDescription('Here is your transaction bundle:')
        .setColor(0x8b5cf6)
        .addFields(bundle.map((tx, i) => ({
          name: `#${i + 1}: ${tx.address}`,
          value: `${tx.amount} SOL`,
          inline: false
        })))
        .setFooter({ text: 'You will review and sign this bundle yourself. Only sign what you trust.' });
      await interaction.reply({
        embeds: [embed],
        content: `✅ Your bundle is ready! [Click here to review and sign your bundle in a secure web page](${signUrl})\n\n**Security Tip:** You will sign all transactions yourself in your wallet. Never share your private key. Always review transaction details before signing.`,
        ephemeral: true
      });
      break;
    }
    case 'preview': {
      const bundle = userBundles[interaction.user.id];
      if (!bundle || bundle.length === 0) {
        await interaction.reply({ content: '❌ No bundle found. Use /bundle to create one first.', ephemeral: true });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle('👀 Bundle Preview')
        .setDescription('Here is your current transaction bundle:')
        .setColor(0x00b894)
        .addFields(bundle.map((tx, i) => ({
          name: `#${i + 1}: ${tx.address}`,
          value: `${tx.amount} SOL`,
          inline: false
        })))
        .setFooter({ text: 'To sign and send, use the link provided after /bundle.' });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'status': {
      // Show all history for this user
      const userId = interaction.user.id;
      const history = userHistory[userId] || [];
      if (history.length === 0) {
        await interaction.reply({ content: '\u274c No sent bundles found. Use /send to send a bundle first.', ephemeral: true });
        return;
      }
      // Show up to 5 most recent bundles
      const recent = history.slice(-5).reverse();
      const embeds = await Promise.all(recent.map(async (entry, idx) => {
        let statuses = [];
        let signatures = null;
        // Try to get signatures from global.sendSessions
        const session = global.sendSessions && global.sendSessions[entry.sessionId];
        if (session && session.signatures) signatures = session.signatures;
        if (signatures && signatures.length > 0) {
          const connection = new Connection('https://api.devnet.solana.com');
          try {
            const results = await connection.getSignatureStatuses(signatures);
            statuses = results.value.map((status, i) => {
              if (!status) return '\u2753 Not found';
              if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') return '\u2705 Confirmed';
              if (status.err) return '\u274c Failed';
              return '\u23f3 Pending';
            });
          } catch (err) {
            statuses = signatures.map(() => '\u2753 Error');
          }
        } else {
          statuses = entry.bundle.map(() => '\u23f3 Pending');
        }
        return new EmbedBuilder()
          .setTitle(`\ud83d\udce6 Bundle #${history.length - idx}`)
          .setDescription(`Sent at: ${new Date(entry.time).toLocaleString()}`)
          .setColor(0x8b5cf6)
          .addFields(entry.bundle.map((tx, i) => ({
            name: `#${i + 1}: ${tx.address}`,
            value: `${tx.amount} SOL \u2014 ${statuses[i] || '\u2753 Unknown'}`,
            inline: false
          })))
          .setFooter({ text: 'Statuses update in real time.' });
      }));
      await interaction.reply({ embeds, ephemeral: true });
      break;
    }
    case 'send': {
      await interaction.reply({ content: 'ℹ️ To send your bundle, use the secure web link provided after /bundle. You will review and sign all transactions yourself in your wallet.', ephemeral: true });
      break;
    }
    case 'gas': {
      try {
        await interaction.deferReply({ ephemeral: true });
        const lamports = 5000; // Solana network default fee per signature
        const sol = lamports / 1e9;
        // Fetch SOL/USD price
        let usd = null;
        try {
          const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
          const data = await resp.json();
          usd = data.solana.usd;
        } catch (err) {
          console.error('Failed to fetch SOL/USD price:', err);
        }
        const embed = new EmbedBuilder()
          .setTitle('⛽ Solana Gas Tracker')
          .setColor(0x00b894)
          .addFields([
            { name: 'Fee per signature', value: `${sol} SOL`, inline: true },
            { name: 'Fee in USD', value: usd ? `$${(sol * usd).toFixed(6)}` : 'N/A', inline: true }
          ])
          .setFooter({ text: 'Fees are approximate and may vary.' });
        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error('Error in /gas command:', err);
        try {
          await interaction.editReply({ content: `❌ Failed to fetch gas info: ${err.message || err}` });
        } catch (e) {
          // If editReply fails, just log
          console.error('Failed to edit reply:', e);
        }
      }
      break;
    }
    case 'mempool': {
      try {
        const resp = await fetch('https://api.mainnet-beta.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getRecentPerformanceSamples',
            params: [1]
          })
        });
        const data = await resp.json();
        const sample = data.result && data.result[0];
        const txCount = sample ? sample.numTransactions : null;
        let congestion = 'Normal';
        if (txCount !== null) {
          if (txCount > 2000) congestion = '🚨 High';
          else if (txCount > 1000) congestion = '⚠️ Moderate';
        }
        const embed = new EmbedBuilder()
          .setTitle('📊 Solana Mempool Status')
          .setColor(0xf1c40f)
          .addFields([
            { name: 'Recent Transactions (last slot)', value: txCount !== null ? txCount.toString() : 'N/A', inline: true },
            { name: 'Network Congestion', value: congestion, inline: true }
          ])
          .setFooter({ text: 'Live mempool and congestion info.' });
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch (err) {
        await interaction.reply({ content: '❌ Failed to fetch mempool info.', ephemeral: true });
      }
      break;
    }
    default:
      await interaction.reply('Unknown command.');
  }
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands((await client.application?.fetch())?.id || process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

startWebServer();

client.login(process.env.DISCORD_BOT_TOKEN).then(registerCommands); 