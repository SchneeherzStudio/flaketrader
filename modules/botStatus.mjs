export async function updateDynamicStatus(client, yahooFinance, topUser) {
    try {
        const now = new Date();
        const hour = now.getHours();
        
        const watchList = ['NVDA', 'PLUG', 'IBRX', 'INTC', 'ONDS', 'NFLX', 'SOFI', 'F', 'CRCL', 'UWMC', 'TSLA', 'HPQ', 'MSFT', 'AMD', 'PYPL', 'BTC-USD', 'ETH-USD', 'XRP-USD', 'SOL-USD'];
        const quotes = await yahooFinance.quote(watchList);
        
        if (hour >= 23 || hour < 8) {
            return client.user.setActivity("Exchanges closed 😴", { type: 3 });
        }

        for (const stock of quotes) {
            const change = stock.regularMarketChangePercent;
            
            if (change >= 15) {
                return client.user.setPresence({
                    activities: [{ name: `${stock.symbol} TO THE MOON 🚀 (+${change.toFixed(1)}%)`, type: 5 }], // Competing
                    status: 'online'
                });
            }
            if (change <= -15) {
                return client.user.setPresence({
                    activities: [{ name: `${stock.symbol} IS BLEEDING 🩸 (${change.toFixed(1)}%)`, type: 3 }], // Watching
                    status: 'dnd'
                });
            }
        }

        const userBalance = Number(topUser[0].balance).toFixed(2)
        if (userBalance >= 1000000) {
            return client.user.setActivity(`Whale: ${topUser[0].name}`, { type: 3 });
        }

        // Standard-Status
        client.user.setActivity("the tickers 📈", { type: 3 }); // Watching

    } catch (err) {
        console.error("Status Update Error:", err);
    }
}