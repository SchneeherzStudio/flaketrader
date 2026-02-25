import 'dotenv/config';
import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, ActivityType, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
import { Market } from './modules/market.mjs';
import { HandleUserUpdates } from './modules/userHandling.mjs'
import { baseCommands } from './modules/baseCommands.mjs';
import { dbHelper } from './modules/database.mjs';

const market = new Market();
const HUU = new HandleUserUpdates();
const BC = new baseCommands();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// Slash Command
const commands = [
  new SlashCommandBuilder().setName('help').setDescription('All informations on /commands'),
  new SlashCommandBuilder().setName('info').setDescription('Provides Bot Information and support'),
  new SlashCommandBuilder().setName('intro').setDescription('Gives an easy introduction on how to use the bot'),
  new SlashCommandBuilder().setName('status').setDescription('Up information on /commands'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim daily money to invest'),
  new SlashCommandBuilder().setName('buy')
    .setDescription('Buy an asset')
    .addStringOption(opt => opt.setName('symbol').setDescription('e.g. BTC-USD, NVDA').setRequired(true))
    .addNumberOption(opt => opt.setName('amount').setDescription('How much to buy?').setRequired(true)),
  new SlashCommandBuilder().setName('sell')
    .setDescription('Sell an asset')
    .addStringOption(opt => opt.setName('symbol').setDescription('Select an asset from your portfolio').setRequired(true).setAutocomplete(true))
    .addNumberOption(opt => opt.setName('amount').setDescription('How much to sell?').setRequired(true)),
  new SlashCommandBuilder().setName('search').setDescription('Find the ticker symbol for a company or asset')
    .addStringOption(opt => 
      opt.setName('query')
        .setDescription('e.g. Apple, Bitcoin, Tesla')
        .setRequired(true)
    ),
  new SlashCommandBuilder().setName('market')
    .setDescription('See an overview over the Market or see single courses')
    .addStringOption(opt => opt.setName('symbol').setDescription('The symbol of the course (e.g. NVDA, BTC-USD)').setRequired(false))
    .addStringOption(opt => 
      opt.setName('range').setDescription('Set Timerange')
        .addChoices(
          { name: '1 Day', value: '1d' },
          { name: '5 Days', value: '5d' },
          { name: '1 Week', value: '1w' },
          { name: '3 Weeks', value: '3w' },
          { name: '1 Month', value: '1m' },
          { name: '5 Months', value: '5m' },
          { name: '1 Year', value: '1y' }
        )
      ),
  new SlashCommandBuilder().setName('balance').setDescription('Check your current balance on money and investments'),
  new SlashCommandBuilder().setName('top').setDescription('See the richest traders on THIS server'),
  new SlashCommandBuilder().setName('global').setDescription('See the richest traders across ALL servers')
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
})();

async function syncExistingMembers(client) {
    console.log("🔄 Starting initial member sync...");
    let totalSynced = 0;

    for (const guild of client.guilds.cache.values()) {
        try {
            const members = await guild.members.fetch();
            
            for (const member of members.values()) {
                if (member.user.bot) continue;
                await dbHelper.registerGuildMember(member.id, guild.id);
                totalSynced++;
            }
            console.log(`|-- Synced ${members.size} members from "${guild.name}"`);
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            console.error(`|-- ❌ Error syncing "${guild.name}":`, e.message);
        }
    }
    console.log(`✅ Sync completed. Total entries processed: ${totalSynced}`);
}

client.on('clientReady', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    client.user.setPresence({
        activities: [{ 
            name: `Stock Prices`, // Der Text, der angezeigt wird (e.g. stock prices)
            type: ActivityType.Watching, // (Playing, Watching, Listening, Streaming, Competing, Custom (name: "custom", state: "name for Presence"))
            state: `shocked by BTC-USD`,
            url: "https://snowy.ct.ws"
        }],
    });

    await syncExistingMembers(client);

    console.log('Bot is ready.');
});

client.login(process.env.DISCORD_TOKEN);

client.on('guildCreate', async (guild) => {
    console.log(`Joined new guild: ${guild.name}. Starting sync...`);
    try {
        const members = await guild.members.fetch();
        for (const member of members.values()) {
          if (member.user.bot) continue;
          await dbHelper.registerGuildMember(member.id, guild.id);
        }
        console.log(`✅ Synced ${members.size} members for ${guild.name}`);
    } catch (e) {
        console.error(`Failed to sync members for new guild ${guild.name}:`, e);
    }
});

client.on('guildMemberAdd', async (member) => {
    if (member.user.bot) return;
    try {
        await dbHelper.registerGuildMember(member.id, member.guild.id);
        console.log(`User ${member.user.tag} wurde für Server ${member.guild.name} registriert.`);
    } catch (err) {
        console.error("Fehler bei guildMemberAdd:", err);
    }
});
client.on('guildMemberRemove', async (member) => {
  if (member.user.bot) return;
  try {
    await dbHelper.unregisterGuildMember(member.id, member.guild.id);
    console.log(`User ${member.user.tag} wurde von Server ${member.guild.name} entfernt.`);
  } catch (err) {
    console.error("Fehler bei guildMemberRemove:", err);
  }
});

client.on('interactionCreate', async interaction => {
  const { commandName, options } = interaction;
  if (interaction.guildId) {
    await dbHelper.registerGuildMember(interaction.user.id, interaction.guildId);
  }
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === 'sell') {
      const portfolio = await dbHelper.getPortfolio(interaction.user.id);
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const filtered = portfolio.filter(p => p.symbol.toLowerCase().includes(focusedValue));
      
      await interaction.respond(
        filtered.slice(0, 25).map(p => ({ 
          name: `${p.symbol} (Owned: ${Number(p.amount).toFixed(2)})`, 
          value: p.symbol 
        }))
      );
    }
    return;
  };

  if (interaction.isButton()) {
    const [action, symbol] = interaction.customId.split(':');

    if (action === 'buy_selected' || action === 'sell_selected') {
        const user = await dbHelper.getUser(interaction.user.id);
        const portfolio = await dbHelper.getPortfolio(interaction.user.id);
        const assetEntry = portfolio.find(p => p.symbol === symbol);
        
        const isBuy = action === 'buy_selected';
        
        const labelText = isBuy 
            ? `Amount (Balance: ${Number(user.balance).toFixed(2)})` 
            : `Amount (Owned: ${assetEntry ? Number(assetEntry.amount).toFixed(4) : 0} ${symbol})`;

        const modal = new ModalBuilder()
            .setCustomId(`${action}_modal:${symbol}`)
            .setTitle(`${isBuy ? '🚀 Buying' : '💰 Selling'} ${symbol}`);

        const amountInput = new TextInputBuilder()
            .setCustomId('amount_input')
            .setLabel(labelText)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(isBuy ? 'How many units?' : 'How many to sell?')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit()) {
    const [action, symbol] = interaction.customId.split(':');
    const amountInput = interaction.fields.getTextInputValue('amount_input').toLowerCase().replace(',', '.');
    let amount;

    if (amountInput === 'max') {
        const quote = await yahooFinance.quote(symbol);
        const price = quote.regularMarketPrice;
        const user = await dbHelper.getUser(interaction.user.id);
        
        if (action.includes('buy')) {
            amount = Number(user.balance) / price;
        } else {
            const portfolio = await dbHelper.getPortfolio(interaction.user.id);
            const asset = portfolio.find(p => p.symbol === symbol);
            amount = asset ? Number(asset.amount) : 0;
        }
    } else {
        amount = parseFloat(amountInput);
    }

    if (isNaN(amount) || amount <= 0) {
      return interaction.reply({ content: '❌ Please enter a valid number or "max".', ephemeral: true });
    }

    await interaction.deferReply();
    const result = action.includes('buy') 
        ? await HUU.buy(interaction.user, symbol, amount)
        : await HUU.sell(interaction.user, symbol, amount);
    
    await interaction.editReply(result);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if(commandName === 'help') {
    const embed = BC.help();
    await interaction.reply(embed);
  } else if(commandName === 'info') {
    const embed = BC.info();
    await interaction.reply(embed);
  } else if(commandName === 'intro') {
    const embed = BC.intro();
    await interaction.reply(embed);
  } else if(commandName === 'status') {
    const embed = BC.status();
    await interaction.reply(embed);
  } else if(commandName === 'daily') {
    const reward = 100;
    const daily = await HUU.daily(interaction.user, reward)
    await interaction.reply(daily);
  } else if(commandName === 'buy') {
    await interaction.deferReply();
    const symbol = options.getString('symbol').toUpperCase();
    const amount = options.getNumber('amount');
    const result = await HUU.buy(interaction.user, symbol, amount)
    await interaction.editReply(result);
  } else if(commandName === 'sell') {
    await interaction.deferReply();
    const symbol = options.getString('symbol').toUpperCase();
    const amount = options.getNumber('amount');
    const result = await HUU.sell(interaction.user, symbol, amount);
    await interaction.editReply(result);
  } else if (commandName === 'search') {
    const query = options.getString('query');
    await interaction.deferReply();
    const result = await market.searchAsset(query);
    await interaction.editReply(result);
  } else if(commandName === 'market') {
    const item = options.getString('symbol');
    const range = options.getString('range') || '1d';
    await interaction.deferReply();

    const user = await dbHelper.getUser(interaction.user.id);

    if (!item) {
      const embed = await market.getMarketOverview();
      await interaction.editReply(embed);
    } else {
      const result = await market.handleMarketReq(item.toUpperCase(), range, Number(user.balance));
      await interaction.editReply(result);
    }
  } else if(commandName === 'balance') {
    await interaction.deferReply();
    const balance = await HUU.balance(interaction.user);
    await interaction.editReply(balance);
  } else if(commandName === 'top') {
    await interaction.deferReply();
    const embed = await HUU.getLeaderboardEmbed(client, false, interaction);
    await interaction.editReply(embed);
  } else if(commandName === 'global') {
    await interaction.deferReply();
    const embed = await HUU.getLeaderboardEmbed(client, true, interaction);
    await interaction.editReply(embed);
  }
});