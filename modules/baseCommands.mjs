import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fs from 'fs';

export class baseCommands {
    help() {
        const embed = new EmbedBuilder()
            .setTitle(`help`)
            .setColor('#8400ff')
            .addFields(
            { name: '/help', value: `Shows this interface`, inline: true },
            { name: '/info', value: `Provides Bot information and support`, inline: true },
            { name: '/status', value: `Shows reported problems with certain commands and availability of commands`, inline: true },
            { name: '/daily', value: `Claims the daily reward`, inline: true },
            { name: '/buy', value: `Buys the selected for a chosen amount`, inline: true },
            { name: '/sell', value: `Sells the selected for a chosen amount`, inline: true },
            { name: '/search', value: `Shows e.g. the symbol of an asset`, inline: true },
            { name: '/market', value: `Shows an overview of the market (global or chosen) in a specific time periode`, inline: true },
            { name: '/balance', value: `Shows the current balance of your account`, inline: true },
            { name: '/top', value: `Shows the top traders of this server`, inline: true },
            { name: '/global', value: `Shows the top traders of all servers`, inline: true }
            )
            .setFooter({ text: 'FlakeTrader • Made with 🤍 by Snowy' })
            .setTimestamp();

        return { embeds: [embed] };
    };
    info() {
        const embed = new EmbedBuilder()
            .setTitle(`info`)
            .setColor('#8400ff')
            .addFields(
                { name: 'General', value: `• 1 <:FlakeCoin:1472307198410358824> ≙ 1€ \n • No real money is traded. \n • No guarantee of accuracy or timeliness. Data on trades are provided by yahoo-finance`, inline: false },
                { name: '\u200b', value: '' },
                { name: 'Support', value: `• Flake Trader is a project by Snowy.Studio and fully free to use. \n • If you want to support us, you can over the provided link.`, inline: false },
                { name: '\u200b', value: '' }
            )
            .setFooter({ text: 'FlakeTrader • Made with 🤍 by Snowy' })
            .setTimestamp();

        const infoButton = new ButtonBuilder()
            .setLabel('Yahoo-Finance')
            .setURL('https://finance.yahoo.com/markets/')
            .setStyle(ButtonStyle.Link);

        const supportButton = new ButtonBuilder()
            .setLabel('Support us')
            .setURL('https://buymeacoffee.com/snowystudio')
            .setStyle(ButtonStyle.Link);
            
        const buttons = new ActionRowBuilder()
            .addComponents(infoButton, supportButton);

        return { embeds: [embed], components: [buttons] };
    };
    intro() {
        const embed = new EmbedBuilder()
            .setTitle(`introduction`)
            .setColor('#8400ff')
            .addFields(
                { name: '1. Search', value: `Use /search to search for a etf's, crypto, etc. \nHere you will find information like "symbol".`, inline: false },
                { name: '2. Market', value: 'Use the "symbol" of /search in /market with a specific range to see the course of the selected asset.', inline: false },
                { name: '3. Buy', value: `If you feel like, you should buy the asset, then use /buy with symbol and amount to buy it. \n(amount is not the money you have, it is how much of it you want e.g. 1 Share) \n(you wont earn any interest charges, regardingless which share, etf, etc. you buy)`, inline: false },
                { name: '4. Hold/Balance', value: 'Now hold your share and use /balance to see the change of your share \n(/balance user will be available in future update to see the balance of other users)', inline: false },
                { name: '5. Sell', value: 'If you feel like, you should sell the asset then sell it with /sell symbol amount and get the money back on your account \n(again amount is e.g. 1 Share, not the money you get)', inline: false },
                { name: '\u200b', value: '' },
                { name: 'Optional:', value: 'Use /daily to claim every 24h, 100 <:FlakeCoin:1472307198410358824> to continue trading, even if you lost everything.', inline: false },
                { name: '\u200b', value: '' },
                { name: 'Information:', value: 'Data on courses are provided by Yahoo-Finance. \n(under every /market you have a direct link to that asset in your browser)', inline: false }
            )
            .setFooter({ text: 'FlakeTrader • Made with 🤍 by Snowy' })
            .setTimestamp();

        const infoButton = new ButtonBuilder()
            .setLabel('Yahoo-Finance')
            .setURL('https://finance.yahoo.com/markets/')
            .setStyle(ButtonStyle.Link);

        const supportButton = new ButtonBuilder()
            .setLabel('Support us')
            .setURL('https://buymeacoffee.com/snowystudio')
            .setStyle(ButtonStyle.Link);
            
        const buttons = new ActionRowBuilder()
            .addComponents(infoButton, supportButton);

        return { embeds: [embed], components: [buttons] };
    };
    status() {
        const activeStates = checkCommandActive();

        const commandFields = Object.keys(checkCommandActive()).map(cmd => {
        const data = activeStates[cmd]
        let StatusIcon = '🔴';
        if (data.active === true) {
            StatusIcon = '🟢';
        } else if (data.active === 'error') { 
            StatusIcon = '🟠'; 
        }
        const StatusText = data.message ? `${StatusIcon}\n*${data.message}*` : StatusIcon;
            return {
                name: `/${cmd}`,
                value: StatusText,
                inline: !data.message
            };
        });

        const statusEmbed = new EmbedBuilder()
            .setColor('#8400ff')
            .setTitle('System Status')
            .setURL('https://snowy.ct.ws')
            .setDescription('Currently available:')
            .addFields(commandFields)
            .setFooter({ text: 'FlakeTrader • Made with 🤍 by Snowy' })
            .setTimestamp();

        return { embeds: [statusEmbed] };
    };
};

function checkCommandActive(cmd) {
  const cmd_config = JSON.parse(fs.readFileSync('./configs/cmd_config.json', 'utf8'));
  if(!cmd) {
    return cmd_config;
  } else {
    return cmd_config[cmd].active;
  }
}