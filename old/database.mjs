import Database from 'better-sqlite3';

const db = new Database('flaketrader.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    balance REAL DEFAULT 1000.0,
    total_profit REAL DEFAULT 0.0,
    total_loss REAL DEFAULT 0.0,
    last_daily INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    symbol TEXT,
    amount REAL,
    buy_price REAL,
    total_invested REAL,
    type TEXT,
    UNIQUE(user_id, symbol)
  );
`);

export const dbHelper = {
  getUser: (userId) => {
    let user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
    if (!user) {
      db.prepare('INSERT INTO users (user_id) VALUES (?)').run(userId);
      user = { user_id: userId, balance: 1000.0, total_profit: 0.0, total_loss: 0.0 };
    }
    return user;
  },

  updateBalance: (userId, amount) => {
    db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ?').run(amount, userId);
  },

  logTradeResult: (userId, pnl) => {
    if (pnl >= 0) {
      db.prepare('UPDATE users SET total_profit = total_profit + ? WHERE user_id = ?').run(pnl, userId);
    } else {
      db.prepare('UPDATE users SET total_loss = total_loss + ? WHERE user_id = ?').run(Math.abs(pnl), userId);
    }
  },

  getPortfolio: (userId) => {
    return db.prepare('SELECT * FROM portfolio WHERE user_id = ?').all(userId);
  },

  updatePortfolio: (userId, symbol, amount, price, type) => {
    const existing = db.prepare('SELECT * FROM portfolio WHERE user_id = ? AND symbol = ?').get(userId, symbol);
    
    if (existing) {
      const newAmount = existing.amount + amount;
      const newInvested = existing.total_invested + (amount * price);
      const newBuyPrice = newInvested / newAmount;
      
      db.prepare('UPDATE portfolio SET amount = ?, buy_price = ?, total_invested = ? WHERE user_id = ? AND symbol = ?')
        .run(newAmount, newBuyPrice, newInvested, userId, symbol);
    } else {
      db.prepare('INSERT INTO portfolio (user_id, symbol, amount, buy_price, total_invested, type) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, symbol, amount, price, amount * price, type);
    }
  },
  executeDaily: (userId, rewardAmount, now) => {
    return db.prepare('UPDATE users SET balance = balance + ?, last_daily = ? WHERE user_id = ?')
      .run(rewardAmount, now, userId);
  },
  buyAsset: (userId, symbol, amount, price, type) => {
    if (amount <= 0) return { success: false, reason: 'INVALID_AMOUNT' }; 
    const totalCost = amount * price;
    const user = dbHelper.getUser(userId);

    if (Number(user.balance) < totalCost) return { success: false, reason: 'NOT_ENOUGH_MONEY' };

    db.prepare('UPDATE users SET balance = balance - ? WHERE user_id = ?').run(totalCost, userId);

    dbHelper.updatePortfolio(userId, symbol, amount, price, type);

    return { success: true, newBalance: Number(user.balance) - totalCost };
  },
  sellAsset: (userId, symbol, amount, currentPrice) => {
    if (amount <= 0) return { success: false, reason: 'INVALID_AMOUNT' };
    if (!currentPrice || isNaN(currentPrice)) return { success: false, reason: 'INVALID_PRICE' };
    const entry = db.prepare('SELECT * FROM portfolio WHERE user_id = ? AND symbol = ?').get(userId, symbol);
        
    if (!entry || entry.amount < amount) return { success: false, reason: 'NOT_ENOUGH_AMOUNT' };

    const revenue = amount * currentPrice;
    const buyCost = entry.buy_price * amount;
    const profitOrLoss = revenue - buyCost;

    if (entry.amount === amount) {
      db.prepare('DELETE FROM portfolio WHERE user_id = ? AND symbol = ?').run(userId, symbol);
    } else {
      db.prepare('UPDATE portfolio SET amount = amount - ?, total_invested = total_invested - ? WHERE user_id = ? AND symbol = ?')
        .run(amount, buyCost, userId, symbol);
    }

    db.prepare('UPDATE users SET balance = balance + ? WHERE user_id = ?').run(revenue, userId);
    dbHelper.logTradeResult(userId, profitOrLoss);

    return { success: true, revenue, profitOrLoss };
  },
  getLeaderboard: (limit = 10, userIds = null) => {
        if (userIds) {
            const placeholders = userIds.map(() => '?').join(',');
            const sql = `
                SELECT user_id, balance, total_profit 
                FROM users 
                WHERE user_id IN (${placeholders})
                ORDER BY (balance + total_profit) DESC 
                LIMIT ?`;
            return db.prepare(sql).all(...userIds, limit);
        } else {
            return db.prepare(`
                SELECT user_id, balance, total_profit 
                FROM users 
                ORDER BY (balance + total_profit) DESC 
                LIMIT ?
            `).all(limit);
        }
    }
};