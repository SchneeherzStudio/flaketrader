import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

export class Market {
      async searchAsset(query) {
        try {
            const searchResults = await yahooFinance.search(query);
            
            const quotes = searchResults.quotes.slice(0, 5);

            if (quotes.length === 0) {
                return { content: `❌ No results found for "**${query}**".` };
            }

            const embed = new EmbedBuilder()
                .setTitle(`🔍 Search results for: ${query}`)
                .setColor('#00d4ff')
                .setFooter({ text: 'Use the Symbol with /buy or /market' })
                .setTimestamp();

            let description = "";
            quotes.forEach(q => {
                const name = q.longname || q.shortname || "Unknown Name";
                const symbol = q.symbol;
                const type = q.quoteType || "ASSET";
                const exchange = q.exchDisp || q.exchange;

                description += `**${name}**\n`;
                description += `└ Symbol: \`${symbol}\` | Type: \`${type}\` | Exchange: \`${exchange}\`\n\n`;
            });

            embed.setDescription(description);
            return { embeds: [embed] };

        } catch (e) {
            return { content: "❌ An error occurred during the search." };
        }
    }
    async handleMarketReq(symbol, rangeChoice, userBalance) {
      try {
        const { start, now, interval, isIntraday } = this.getTimeSettings(rangeChoice);
        const result = await yahooFinance.quote(symbol, {}, { validateResult: false });
    
        let history;
    
        if (isIntraday) {
          const chartResult = await yahooFinance.chart(symbol, {
            period1: start,
            period2: now,
            interval: interval
          }, { validateResult: false });
          history = chartResult.quotes.map(q => ({
            date: q.date,
            close: q.close
          })).filter(q => q.close !== null); 
        } else {
          history = await yahooFinance.historical(symbol, {
            period1: start,
            period2: now,
            interval: interval
          }, {validateResult: false });
        }
    
        if (!history || history.length === 0) {
          if (rangeChoice === '1d') {
            return { 
              content: `No data available for **${symbol}**. Stock exchanges are closed on weekends. Try a longer period.`,
              ephemeral: true 
            };
          }
          throw new Error("No data available");
        }
    
        const chartData = {
          labels: history.map(entry => {
            const d = new Date(entry.date);
            const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return rangeChoice === '1d' ? time : d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
          }),
          values: history.map(entry => entry.close),
          isIntraday
        };
    
        const diagramm = await this.createDiagramm(chartData);
        
        const marketEmbed = this.createMarketEmbed(symbol, result.regularMarketPrice, rangeChoice, history, userBalance);
        const buttons = this.createMarketComponents(symbol);
    
        return { embeds: [marketEmbed], components: [buttons], files: [diagramm] };
      } catch (err) {
        console.error(err);
        return `Error searching for ${symbol}.`;
      }
    };
    async createDiagramm(priceData) {
        const width = 800; 
        const height = 400;
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });
    
        const isPositive = priceData.values[priceData.values.length - 1] >= priceData.values[0];
        const color = isPositive ? '#00ff00' : '#ff4444';
        const bgColor = isPositive ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 68, 68, 0.1)';
    
        const configuration = {
            type: 'line',
            data: {
                labels: priceData.labels,
                datasets: [{
                    data: priceData.values,
                    borderColor: color,
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: true,
                    backgroundColor: bgColor,
                    tension: 0.2 
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { 
                        display: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { 
                            color: '#888888',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 8
                        }
                    },
                    y: { 
                        position: 'right',
                        ticks: { color: '#888888' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' } 
                    }
                }
            }
        };
    
        const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
        return new AttachmentBuilder(imageBuffer, { name: 'chart.png' });
    };
    createMarketEmbed(item, price, range, history, userBalance) {
      const firstPrice = history[0].close;
      const lastPrice = history[history.length - 1].close;
      const isPositive = lastPrice >= firstPrice;
      
      const change = (((lastPrice - firstPrice) / firstPrice) * 100).toFixed(2);
      const prefix = isPositive ? "+" : "";

      // Kaufkraft berechnen: Guthaben / Aktueller Preis
      const buyingPower = (userBalance / price).toFixed(4);
      
      const market = new EmbedBuilder()
            .setAuthor({
                name: `Market-analysis: ${range.toUpperCase()}`,
                iconURL: "https://snowy.ct.ws/FlakeTrader/FlakeTrader.png",
            })
            .setTitle(`${item}: ${price.toFixed(2)}€`)
            .setDescription(`Change: **${prefix}${change}%** in the selected period.`)
            .addFields(
                { name: 'Your Balance', value: `${userBalance.toFixed(2)} <:FlakeCoin:1472307198410358824>`, inline: true },
                { name: 'Buying Power', value: `max. **${buyingPower}** units`, inline: true }
            )
            .setColor(isPositive ? "#00ff00" : "#ff4444")
            .setImage('attachment://chart.png')
            .setFooter({ text: "Data by Yahoo Finance • Made with 🤍 by Snowy" })
            .setTimestamp();
    
      return market;
    };
    createMarketComponents(item) {
      const buyButton = new ButtonBuilder()
        .setCustomId(`buy_selected:${item}`)
        .setLabel('Buy')
        .setStyle(ButtonStyle.Success);
    
      const sellButton = new ButtonBuilder()
        .setCustomId(`sell_selected:${item}`)
        .setLabel('Sell')
        .setStyle(ButtonStyle.Danger);
    
      const infoButton = new ButtonBuilder()
        .setLabel('Details (Web)')
        .setURL(`https://finance.yahoo.com/quote/${item}`)
        .setStyle(ButtonStyle.Link);
    
      const buttons = new ActionRowBuilder()
        .addComponents(buyButton, sellButton, infoButton);
    
      return buttons;
    };
    async getMarketOverview() {
        const mainTickers = ['^GDAXI', '^GSPC', 'BTC-USD', 'ETH-USD', 'TSLA', 'NVDA'];
        const results = await yahooFinance.quote(mainTickers, {}, { validateResult: false });
    
        const fields = results.map(stock => {
            const change = stock.regularMarketChangePercent.toFixed(2);
            const emoji = change >= 0 ? '<:FlakeClimb:1472307196577579090>' : '<:FlakeFall:1472307199907729488>';
            return {
                name: `${emoji} ${stock.shortName || stock.symbol}`,
                value: `Price: **${stock.regularMarketPrice.toFixed(2)} ${stock.currency}** (${change}%)`,
                inline: true
            };
        });
    
        const overviewEmbed = new EmbedBuilder()
            .setTitle("🌍 Marketchange")
            .setDescription("Overview of stats & assets (in relation to Previous Close):")
            .addFields(fields)
            .setColor("#8400ff")
            .setFooter({ text: "Data by Yahoo Finance • Made with 🤍 by Snowy" })
            .setTimestamp();
    
        return { embeds: [overviewEmbed] };
    };
    getTimeSettings(rangeChoice) {
        const now = new Date();
        const start = new Date();
        let interval = '1d';
        let isIntraday = false;
    
        switch (rangeChoice) {
            case '1d': 
                start.setDate(now.getDate() - 1); 
                interval = '5m'; isIntraday = true; break;
            case '5d': 
                start.setDate(now.getDate() - 5); 
                interval = '30m'; isIntraday = true; break;
            case '1w': 
                start.setDate(now.getDate() - 7); 
                interval = '1h'; isIntraday = true; break;
            case '3w': 
                start.setDate(now.getDate() - 21); 
                interval = '1h'; isIntraday = true; break;
            case '1m': 
                start.setMonth(now.getMonth() - 1); 
                interval = '1d'; break;
            case '5m': 
                start.setMonth(now.getMonth() - 5); 
                interval = '1d'; break;
            case '1y': 
                start.setFullYear(now.getFullYear() - 1); 
                interval = '1wk'; break;
            default:
                start.setMonth(now.getMonth() - 1);
                interval = '1d';
        }
        return { start, now, interval, isIntraday };
    };
};