import pg from 'pg';

const { Pool } = pg;

// Use a Connection String (save this in a .env file!)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  max: 20, // Maximum number of connections in the pool
});

export const dbHelper = {
  getUser: async (userId) => {
    const res = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    let user = res.rows[0];

    if (!user) {
      const insertRes = await pool.query(
        'INSERT INTO users (user_id) VALUES ($1) RETURNING *', 
        [userId]
      );
      user = insertRes.rows[0];
    }
    return user;
  },
  updateBalance: async (userId, amount) => {
    await pool.query(
      'UPDATE users SET balance = balance + $1 WHERE user_id = $2', 
      [amount, userId]
    );
  },
  logTradeResult: async (userId, profitOrLoss, client = null) => {
    const executor = client || pool; 
    const query = profitOrLoss >= 0 
        ? 'UPDATE users SET total_profit = total_profit + $1 WHERE user_id = $2'
        : 'UPDATE users SET total_loss = total_loss + $1 WHERE user_id = $2';
    await executor.query(query, [Math.abs(profitOrLoss), userId]);
  },
  getPortfolio: async (userId) => {
    const res = await pool.query('SELECT * FROM portfolio WHERE user_id = $1', [userId]);
    return res.rows;
  },
  updatePortfolio: async (userId, symbol, amount, price, type) => {
    const res = await pool.query(
      'SELECT * FROM portfolio WHERE user_id = $1 AND symbol = $2', 
      [userId, symbol]
    );
    const existing = res.rows[0];

    if (existing) {
      const newAmount = Number(existing.amount) + amount;
      const newInvested = Number(existing.total_invested) + (amount * price);
      const newBuyPrice = newInvested / newAmount;
      
      await pool.query(
        'UPDATE portfolio SET amount = $1, buy_price = $2, total_invested = $3 WHERE user_id = $4 AND symbol = $5',
        [newAmount, newBuyPrice, newInvested, userId, symbol]
      );
    } else {
      await pool.query(
        'INSERT INTO portfolio (user_id, symbol, amount, buy_price, total_invested, type) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, symbol, amount, price, amount * price, type]
      );
    }
  },
  executeDaily: async (userId, rewardAmount, now) => {
    const res = await pool.query(
      'UPDATE users SET balance = balance + $1, last_daily = $2 WHERE user_id = $3 RETURNING *', 
      [rewardAmount, now, userId]
    );
    return res.rows[0];
  },
  buyAsset: async (userId, symbol, amount, price, type) => {
    if (amount <= 0) return { success: false, reason: 'INVALID_AMOUNT' }; 
    const totalCost = amount * price;

    const res = await pool.query(
      'UPDATE users SET balance = balance - $1 WHERE user_id = $2 AND balance >= $1 RETURNING balance',
      [totalCost, userId]
    );

    if (res.rowCount === 0) return { success: false, reason: 'NOT_ENOUGH_MONEY' };

    await dbHelper.updatePortfolio(userId, symbol, amount, price, type);
    return { success: true, newBalance: res.rows[0].balance };
  },
  sellAsset: async (userId, symbol, amount, currentPrice) => {
    if (amount <= 0) return { success: false, reason: 'INVALID_AMOUNT' };
    if (!currentPrice || isNaN(currentPrice)) return { success: false, reason: 'INVALID_PRICE' };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const res = await client.query(
            'SELECT * FROM portfolio WHERE user_id = $1 AND symbol = $2 FOR UPDATE',
            [userId, symbol]
        );
        const entry = res.rows[0];

        if (!entry || Number(entry.amount) < amount) {
            await client.query('ROLLBACK');
            return { success: false, reason: 'NOT_ENOUGH_AMOUNT' };
        }

        const currentAmount = Number(entry.amount);
        const buyPrice = Number(entry.buy_price);
        const revenue = amount * currentPrice;
        const buyCost = buyPrice * amount;
        const profitOrLoss = revenue - buyCost;

        if (Math.abs(currentAmount - amount) < 0.00000001) {
            await client.query(
                'DELETE FROM portfolio WHERE user_id = $1 AND symbol = $2',
                [userId, symbol]
            );
        } else {
            await client.query(
                'UPDATE portfolio SET amount = amount - $1, total_invested = total_invested - $2 WHERE user_id = $3 AND symbol = $4',
                [amount, buyCost, userId, symbol]
            );
        }

        await client.query(
            'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
            [revenue, userId]
        );

        await dbHelper.logTradeResult(userId, profitOrLoss, client); 

        await client.query('COMMIT');
        return { success: true, revenue, profitOrLoss };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in sellAsset transaction:', error);
        return { success: false, reason: 'INTERNAL_ERROR' };
    } finally {
        client.release();
    }
  },
  registerGuildMember: async (userId, guildId) => {
    await dbHelper.getUser(userId);
    await pool.query(
      'INSERT INTO guild_members (guild_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [guildId, userId]
    );
  },
  unregisterGuildMember: async (userId, guildId) => {
    await pool.query(
      'DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2',
      [guildId, userId]
    );
  },
  getLeaderboard: async (limit = 10, guildId = null) => {
    if (guildId) {
      const res = await pool.query(`
        SELECT u.user_id, u.balance, u.total_profit 
        FROM users u
        JOIN guild_members gm ON u.user_id = gm.user_id
        WHERE gm.guild_id = $1
        ORDER BY (u.balance + u.total_profit) DESC 
        LIMIT $2`, 
        [guildId, limit]
      );
      return res.rows;
    } else {
      const res = await pool.query(`
        SELECT user_id, balance, total_profit 
        FROM users 
        ORDER BY (balance + total_profit) DESC 
        LIMIT $1`, 
        [limit]
      );
      return res.rows;
    }
  }
};