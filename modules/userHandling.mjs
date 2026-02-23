import { EmbedBuilder } from 'discord.js';
import { dbHelper } from './database.mjs';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

export class HandleUserUpdates {
    async balance(interactUser) {
        const user = await dbHelper.getUser(interactUser.id);
        const portfolio = await dbHelper.getPortfolio(interactUser.id);
        
        let totalAssetsMarketValue = 0;
        let portfolioDetails = "";

        if (portfolio.length > 0) {
            const symbols = portfolio.map(p => p.symbol);
            
            try {
                const quotes = await yahooFinance.quote(symbols, {}, { validateResult: false });
                const currentPrices = {};
                const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
                
                quotesArray.forEach(q => {
                    currentPrices[q.symbol] = q.regularMarketPrice;
                });

                portfolioDetails = portfolio.map(p => {
                    const currentPrice = currentPrices[p.symbol] || Number(p.buy_price);
                    const amount = Number(p.amount);
                    const marketValue = currentPrice * amount;
                    totalAssetsMarketValue += marketValue;

                    const diff = currentPrice - Number(p.buy_price);
                    const diffPercent = (diff / Number(p.buy_price)) * 100;
                    const sign = diff >= 0 ? "+" : "";
                    const emoji = diff >= 0 ? "<:FlakeClimb:1472307196577579090>" : "<:FlakeFall:1472307199907729488>";

                    return `${emoji} **${p.symbol}**: ${amount.toFixed(4)} @ ${currentPrice.toFixed(2)} <:FlakeCoin:1472307198410358824>\n` +
                           `└ Perf: \`${sign}${diffPercent.toFixed(2)}%\` (${(diff * amount).toFixed(2)} <:FlakeCoin:1472307198410358824>)`;
                }).join('\n\n');

            } catch (error) {
                portfolioDetails = "⚠️ Error fetching live prices.";
            }
        } else {
            portfolioDetails = "Your Portfolio is still empty, start investing now.";
        }

        const totalNetWorth = Number(user.balance) + totalAssetsMarketValue;

        const embed = new EmbedBuilder()
            .setTitle(`💰 Depot of ${interactUser.username}`)
            .setColor(totalAssetsMarketValue >= 0 ? '#8400ff' : '#ff0000')
            .addFields(
                { name: 'Total Net Worth', value: `**${totalNetWorth.toFixed(2)} <:FlakeCoin:1472307198410358824>**`, inline: false },
                { name: 'Cash (Wallet)', value: `${Number(user.balance).toFixed(2)} <:FlakeCoin:1472307198410358824>`, inline: true },
                { name: 'Assets Value', value: `${totalAssetsMarketValue.toFixed(2)} <:FlakeCoin:1472307198410358824>`, inline: true },
                { name: '\u200B', value: '\u200B', inline: false },
                { name: '<:FlakeClimb:1472307196577579090> All-Time Profit', value: `${Number(user.total_profit).toFixed(2)} <:FlakeCoin:1472307198410358824>`, inline: true },
                { name: '<:FlakeFall:1472307199907729488> All-Time Loss', value: `${Number(user.total_loss).toFixed(2)} <:FlakeCoin:1472307198410358824>`, inline: true }
            )
            .setDescription(`### Assets\n${portfolioDetails}`)
            .setFooter({ text: 'FlakeTrader Economy • Made with 🤍 by Snowy' })
            .setTimestamp();

        return { embeds: [embed] };
    }

    async daily(interactUser, rewardAmount) {
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;

        const user = await dbHelper.getUser(interactUser.id);
        const timeSinceLast = now - Number(user.last_daily);

        if (timeSinceLast < cooldown) {
            const timeLeft = cooldown - timeSinceLast;
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            
            const embed = new EmbedBuilder()
                .setTitle(`💰 Daily claim`)
                .setColor('#ff4444')
                .setDescription(`⏳ Already claimed, next daily in: **${hours}h ${minutes}m**`)
                .setFooter({ text: `FlakeTrader Economy • Made with 🤍 by Snowy` })
                .setTimestamp();
            return { embeds: [embed] };
        }

        await dbHelper.executeDaily(interactUser.id, rewardAmount, now);

        const embed = new EmbedBuilder()
            .setTitle(`💰 Daily claim`)
            .setColor('#00ff00')
            .setDescription(`✅ You claimed your daily **${rewardAmount} <:FlakeCoin:1472307198410358824>**! Your new balance is: **${(Number(user.balance) + rewardAmount).toFixed(2)} <:FlakeCoin:1472307198410358824>**!`)
            .setFooter({ text: `FlakeTrader Economy • Made with 🤍 by Snowy` })
            .setTimestamp();

        return { embeds: [embed] };
    }

    async buy(user, symbol, amount) {
        try {
            if (amount <= 0) return { content: "❌ Invalid amount!" };

            const rawQuote = await yahooFinance.quote(symbol, {}, { validateResult: false });
            const quote = Array.isArray(rawQuote) ? rawQuote[0] : rawQuote;

            if (!quote || quote.regularMarketPrice === undefined) {
                return { content: `❌ Asset **${symbol}** not found.` };
            }

            const price = quote.regularMarketPrice;
            const type = (quote.quoteType || 'EQUITY').toLowerCase();

            const result = await dbHelper.buyAsset(user.id, symbol, amount, price, type);

            let message = result.success 
                ? `✅ You bought **${amount} ${symbol}** für **${price.toFixed(2)} <:FlakeCoin:1472307198410358824>**.` 
                : `❌ Error: Not enough <:FlakeCoin:1472307198410358824> (Needed: **${(amount * price).toFixed(2)} <:FlakeCoin:1472307198410358824>**)`;
            
            return buildBuySellEmbed(result, message, "Trade: Buy");
        } catch (e) {
            return { content: "❌ API Error." };
        }
    }

    async sell(user, symbol, amount) {
        try {
            if (amount <= 0) return { content: "❌ Invalid amount!" };
            const rawQuote = await yahooFinance.quote(symbol, {}, { validateResult: false });
            const quote = Array.isArray(rawQuote) ? rawQuote[0] : rawQuote;

            if (!quote || quote.regularMarketPrice === undefined) return { content: "❌ API Error." };

            const currentPrice = quote.regularMarketPrice;

            const result = await dbHelper.sellAsset(user.id, symbol, amount, currentPrice);

            if (result.success) {
                const icon = result.profitOrLoss >= 0 ? '<:FlakeClimb:1472307196577579090>' : '<:FlakeFall:1472307199907729488>';
                const message = `${icon} You sold **${amount} ${symbol}**.\nSales volume: **${result.revenue.toFixed(2)} <:FlakeCoin:1472307198410358824>**\nProfit/loss: **${result.profitOrLoss.toFixed(2)} <:FlakeCoin:1472307198410358824>**`;
                return buildBuySellEmbed(result, message, "Trade: Sell");
            } else {
                return { content: `❌ You don't have enough shares of **${symbol}**.` };
            }
        } catch (e) {
            return { content: "❌ Internal Error." };
        }
    }

    async getLeaderboardEmbed(client, isGlobal, interaction) {
        let title = isGlobal ? "🌍 Global FlakeTrader Leaderboard" : `🏆 ${interaction.guild.name} Leaderboard`;
        let color = isGlobal ? "#ffffff" : "#FFD700";

        const guildId = isGlobal ? null : interaction.guildId;

        const topUsers = await dbHelper.getLeaderboard(10, guildId);
        
        const leaderboardData = await Promise.all(topUsers.map(async (data, i) => {
            let userTag = "Unknown Trader";
            try {
                const fetchedUser = await client.users.fetch(data.user_id);
                userTag = fetchedUser.username;
            } catch (e) {
                userTag = `ID: ${data.user_id}`;
            }

            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**#${i + 1}**`;
            const worth = Number(data.balance) + Number(data.total_profit);
            return `${medal} **${userTag}**\n└ Worth: \`${worth.toFixed(2)}\` <:FlakeCoin:1472307198410358824> (Cash: ${Number(data.balance).toFixed(2)})\n\n`;
        }));

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(leaderboardData.join('') || "No traders found yet.")
            .setColor(color)
            .setThumbnail(isGlobal ? null : interaction.guild.iconURL())
            .setFooter({ text: isGlobal ? "Global Top 10" : "Local Top 10" })
            .setTimestamp();

        return { embeds: [embed] };
    }
}

function buildBuySellEmbed(result, message, title) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(result.success ? '#00ff00' : '#ff4444')
        .setDescription(message)
        .setFooter({ text: `FlakeTrader Economy` })
        .setTimestamp();
    return { embeds: [embed] };
}