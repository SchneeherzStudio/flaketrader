import { EmbedBuilder } from 'discord.js';
import { dbHelper } from './database.mjs';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

export class HandleUserUpdates {
    async balance(interactUser) {
        const user = dbHelper.getUser(interactUser.id);
        const portfolio = dbHelper.getPortfolio(interactUser.id);
        
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
                    const currentPrice = currentPrices[p.symbol] || p.buy_price;
                    const marketValue = currentPrice * p.amount;
                    totalAssetsMarketValue += marketValue;

                    const diff = currentPrice - p.buy_price;
                    const diffPercent = (diff / p.buy_price) * 100;
                    const sign = diff >= 0 ? "+" : "";
                    const emoji = diff >= 0 ? "<:FlakeClimb:1472307196577579090>" : "<:FlakeFall:1472307199907729488>";

                    return `${emoji} **${p.symbol}**: ${p.amount.toFixed(4)} @ ${currentPrice.toFixed(2)} <:FlakeCoin:1472307198410358824>\n` +
                           `└ Performance: \`${sign}${diffPercent.toFixed(2)}%\` (${(diff * p.amount).toFixed(2)} <:FlakeCoin:1472307198410358824>)`;
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
                { name: '<:FlakeClimb:1472307196577579090> All-Time Profit', value: `${user.total_profit.toFixed(2)} <:FlakeCoin:1472307198410358824>`, inline: true },
                { name: '<:FlakeFall:1472307199907729488> All-Time Loss', value: `${user.total_loss.toFixed(2)} <:FlakeCoin:1472307198410358824>`, inline: true }
            )
            .setDescription(`### Assets\n${portfolioDetails}`)
            .setFooter({ text: 'FlakeTrader Economy • Made with 🤍 by Snowy' })
            .setTimestamp();

        return { embeds: [embed] };
    }
    daily(interactUser, rewardAmount) {
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;
        let success = true;

        const user = dbHelper.getUser(interactUser.id);
        const timeSinceLast = now - user.last_daily;
        let hours, minutes;

        if (timeSinceLast < cooldown) {
            success = false;
            const timeLeft = cooldown - timeSinceLast;
            hours = Math.floor(timeLeft / (1000 * 60 * 60));
            minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        } else {
            dbHelper.executeDaily(interactUser.id, rewardAmount, now);
        }

        const message = success 
            ? `✅ You claimed your daily **${rewardAmount} <:FlakeCoin:1472307198410358824>**! Your new balance is: **${(Number(user.balance) + rewardAmount).toFixed(2)} <:FlakeCoin:1472307198410358824>**!` 
            : `⏳ Already claimed your daily, next daily available in: **${hours}h ${minutes}m**`;

        const embed = new EmbedBuilder()
            .setTitle(`💰 Daily claim`)
            .setColor(success ? '#00ff00' : '#ff4444')
            .setDescription(message)
            .setFooter({ text: `FlakeTrader Economy • Made with 🤍 by Snowy` })
            .setTimestamp();

        return { embeds: [embed] };
    }
    async buy(user, symbol, amount) {
        try {
            if (amount <= 0) return { content: "❌ You can't buy a negative or zero amount! Nice try, though. 😉" };

            const rawQuote = await yahooFinance.quote(symbol, {}, { validateResult: false });
            
            const quote = Array.isArray(rawQuote) ? rawQuote[0] : rawQuote;

            if (!quote || quote.regularMarketPrice === undefined) {
                return { content: `❌ Asset **${symbol}** not found or no price data available.` };
            }

            const price = quote.regularMarketPrice;
            const type = (quote.quoteType || 'EQUITY').toLowerCase();

            const result = dbHelper.buyAsset(user.id, symbol, amount, price, type);

            let message;
            if (result.success) {
                message = `✅ You bought **${amount} ${symbol}** for **${price.toFixed(2)} <:FlakeCoin:1472307198410358824>** each.`;
            } else {
                message = `❌ Error: Not enough <:FlakeCoin:1472307198410358824> (Needed: **${(amount * price).toFixed(2)} <:FlakeCoin:1472307198410358824>**)`;
            }
            
            return buildBuySellEmbed(result, message, "Trade: Buy");
        } catch (e) {
            return { content: "❌ Error connecting to Stock Market API." };
        }
    }
    async sell(user, symbol, amount) {
        try {
            if (amount <= 0) return { content: "❌ You can't sell a negative or zero amount! Nice try, though. 😉" };
            const rawQuote = await yahooFinance.quote(symbol, {}, { validateResult: false });
            const quote = Array.isArray(rawQuote) ? rawQuote[0] : rawQuote;

            // CRITICAL: Erst prüfen, dann handeln!
            if (!quote || quote.regularMarketPrice === undefined) {
                return { content: "❌ Error: Could not fetch current market price. Sell cancelled." };
            }

            const currentPrice = quote.regularMarketPrice;

            // Erst jetzt wird die Datenbank berührt
            const result = dbHelper.sellAsset(user.id, symbol, amount, currentPrice);

            if (result.success) {
                const icon = result.profitOrLoss >= 0 ? '<:FlakeClimb:1472307196577579090>' : '<:FlakeFall:1472307199907729488>';
                const message = `${icon} You sold **${amount} ${symbol}**.\nSales volume: **${result.revenue.toFixed(2)} <:FlakeCoin:1472307198410358824>**\nProfit/loss: **${result.profitOrLoss.toFixed(2)} <:FlakeCoin:1472307198410358824>**`;
                return buildBuySellEmbed(result, message, "Trade: Sell");
            } else {
                return { content: `❌ You don't have enough shares of **${symbol}**.` };
            }

        } catch (e) {
            return { content: "❌ Internal Error during sell process." };
        }
    }
    async getLeaderboardEmbed(client, isGlobal, interaction) {
        let userIds = null;
        let title = "🌍 Global FlakeTrader Leaderboard";
        let color = "#ffffff";

        if (!isGlobal) {
            const members = await interaction.guild.members.fetch();
            userIds = Array.from(members.keys());
            title = `🏆 ${interaction.guild.name} Leaderboard`;
            color = "#FFD700";
        }

        const topUsers = dbHelper.getLeaderboard(10, userIds);
        let description = "";

        for (let i = 0; i < topUsers.length; i++) {
            const data = topUsers[i];
            let userTag = "Unknown Trader";
            
            try {
                const fetchedUser = await client.users.fetch(data.user_id);
                userTag = fetchedUser.username;
            } catch (e) {
                userTag = `ID: ${data.user_id}`;
            }

            const medal = i === 0 ? "<:Leaderbord1:1473071156088274984>" : i === 1 ? "<:Leaderbord2:1473071157639905535>" : i === 2 ? "<:Leaderbord3:1473071159426678936>" : `**#${i + 1}**`;
            description += `${medal} **${userTag}**\n└ Worth: \`${(data.balance).toFixed(2)}\` <:FlakeCoin:1472307198410358824> (Cash: ${data.balance.toFixed(2)})\n\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description || "No traders found yet.")
            .setColor(color)
            .setThumbnail(isGlobal ? null : interaction.guild.iconURL())
            .setFooter({ text: isGlobal ? "The richest traders across all servers" : "The local market kings" })
            .setTimestamp();

        return { embeds: [embed] };
    }
};

function buildBuySellEmbed(result, message, title) {
    const isSuccess = result.success;
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(isSuccess ? '#00ff00' : '#ff4444')
        .setDescription(message)
        .setFooter({ text: `FlakeTrader Economy • Made with 🤍 by Snowy` })
        .setTimestamp();

    return { embeds: [embed] };
};