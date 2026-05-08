const { Pool } = require('pg');
require('dotenv').config();

class PostgresDB {
  /**
   * @param {Object} config - pg connection config
   * Example: { host, port, database, user, password }
   * Or pass connectionString: 'postgresql://user:pass@host:5432/dbname'
   */
  constructor() {
    this.pool = new Pool({
      user: process.env.DB_USER ,
      host: process.env.DB_HOST ,
      database: process.env.DB_NAME ,
      password: process.env.DB_PASSWORD ,
      port: process.env.DB_PORT ,
      max: 20,
    });
  }

  /**
   * Execute a query using a pooled connection.
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   */
  async query(text, params = []) {
    const client = await this.pool.connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  /**
   * Initialize the database by creating tables if they don't exist.
   */
async init() {
    try {
        // === tracking_contracts ===
        await this.query(`
            CREATE TABLE IF NOT EXISTS tracking_contracts (
                id          SERIAL PRIMARY KEY,
                symbol      TEXT NOT NULL,
                timestamp   BIGINT NOT NULL,
                open        DOUBLE PRECISION NOT NULL,
                high        DOUBLE PRECISION NOT NULL,
                low         DOUBLE PRECISION NOT NULL,
                close       DOUBLE PRECISION NOT NULL,
                interval    TEXT NOT NULL,
                datetime    TIMESTAMP NOT NULL,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(symbol, timestamp, interval)
            );
        `);

        // Добавляем индексы для скорости (очень важно!)
        await this.query(`CREATE INDEX IF NOT EXISTS idx_tracking_symbol_interval ON tracking_contracts(symbol, interval);`);
        await this.query(`CREATE INDEX IF NOT EXISTS idx_tracking_timestamp ON tracking_contracts(timestamp);`);
        await this.query(`CREATE INDEX IF NOT EXISTS idx_tracking_symbol_ts ON tracking_contracts(symbol, timestamp);`);

        // === live_prices ===
        await this.query(`
            CREATE TABLE IF NOT EXISTS live_prices (
                id          SERIAL PRIMARY KEY,
                symbol      TEXT NOT NULL,
                lastprice   DOUBLE PRECISION,
                markPrice   DOUBLE PRECISION,
                indexPrice  DOUBLE PRECISION,
                timestamp   BIGINT NOT NULL,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await this.query(`CREATE INDEX IF NOT EXISTS idx_live_symbol ON live_prices(symbol);`);
        await this.query(`CREATE INDEX IF NOT EXISTS idx_live_timestamp ON live_prices(timestamp);`);

        // === остальные таблицы ===
        await this.query(`
            CREATE TABLE IF NOT EXISTS all_contracts_tracking (
                id         SERIAL PRIMARY KEY,
                symbol     TEXT NOT NULL,
                interval   TEXT NOT NULL,
                volatility DOUBLE PRECISION,
                UNIQUE(symbol, interval)
            );
        `);

        await this.query(`
            CREATE TABLE IF NOT EXISTS filtered_minimum (
                id        SERIAL PRIMARY KEY,
                symbol    TEXT NOT NULL,
                timestamp BIGINT NOT NULL,
                datetime  TIMESTAMP NOT NULL,
                price     DOUBLE PRECISION NOT NULL,
                interval  TEXT NOT NULL,
                UNIQUE(symbol, timestamp, interval)
            );
        `);

        await this.query(`
            CREATE TABLE IF NOT EXISTS control_send_signal (
                id              SERIAL PRIMARY KEY,
                symbol          TEXT NOT NULL,
                timestamp       BIGINT NOT NULL,
                interval        TEXT NOT NULL,
                type_signal     TEXT NOT NULL,
                level_timestamp BIGINT NOT NULL,
                UNIQUE(symbol, timestamp, interval, type_signal)
            );
        `);

        console.log('✅ PostgreSQL: tables and indexes ensured successfully.');
    } catch (err) {
        console.error('❌ Error during DB initialization:', err);
        throw err;
    }
}

  // ---------------------------------------------------------------------------
  // saveSendSignalControl
  // ---------------------------------------------------------------------------
  async saveSendSignalControl(symbol, timestamp, interval, typeSignal, levelTimeStamp) {
    await this.query(`
      INSERT INTO control_send_signal (symbol, timestamp, interval, type_signal, level_timestamp)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `, [symbol, timestamp, interval, typeSignal, levelTimeStamp]);
    console.log('Control send signal saved successfully.');
  }

  // ---------------------------------------------------------------------------
  // saveFilteredMinimum
  // ---------------------------------------------------------------------------
  async saveFilteredMinimum(symbol, interval, minima) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const min of minima) {
        await client.query(`
          INSERT INTO filteredMinimum (symbol, timestamp, price, interval, datetime)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING
        `, [symbol, min.timestamp, min.closePrice, interval, min.dateTime]);
      }
      await client.query('COMMIT');
      console.log('Filtered minimum data saved successfully.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error saving filtered minimum:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // saveCandles
  // ---------------------------------------------------------------------------
  async saveCandles(symbol, interval, candles) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const candle of candles) {
        const timestamp = parseInt(candle[0]);
        const open      = parseFloat(candle[1]);
        const high      = parseFloat(candle[2]);
        const low       = parseFloat(candle[3]);
        const close     = parseFloat(candle[4]);
        const datetime  = new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');

        await client.query(`
          INSERT INTO tracking_contracts (symbol, timestamp, open, high, low, close, interval, datetime)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (symbol, timestamp, interval) DO NOTHING
        `, [symbol, timestamp, open, high, low, close, interval, datetime]);
      }
      await client.query('COMMIT');
      await this._cleanupCandlesTable();
      console.log('Candles saved successfully.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error saving candles:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  async _cleanupCandlesTable() {
    const res = await this.query(`SELECT COUNT(*) AS total FROM tracking_contracts`);
    const total = parseInt(res.rows[0].total, 10);
    if (total < 100000) return;

    await this.query(`DELETE FROM tracking_contracts`);
    console.log(`Таблица очищена. Было строк: ${total}`);
  }

  // ---------------------------------------------------------------------------
  // gettracking_contracts
  // ---------------------------------------------------------------------------
  async gettracking_contracts(symbol = null, interval = null) {
    let query = `SELECT id, symbol, interval, volatility FROM all_contracts_tracking`;
    const params = [];
    const conditions = [];

    if (symbol) {
      conditions.push(`symbol = $${params.length + 1}`);
      params.push(symbol);
    }
    if (interval) {
      conditions.push(`interval = $${params.length + 1}`);
      params.push(interval);
    }
    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }
    query += ` ORDER BY symbol, interval`;

    const res = await this.query(query, params);
    return res.rows;
  }

  // ---------------------------------------------------------------------------
  // getCandles
  // ---------------------------------------------------------------------------
  async getCandles(symbol, interval, table, limit = null) {
    // Basic table name validation
    if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error('Invalid table name');

    let query = `
      SELECT timestamp, datetime, open, high, low, close
      FROM ${table}
      WHERE symbol = $1 AND interval = $2
    `;
    const params = [symbol, interval];

    if (limit !== null && limit > 0) {
      params.push(limit);
      query += ` ORDER BY timestamp DESC LIMIT $${params.length}`;
    } else {
      query += ` ORDER BY timestamp ASC`;
    }

    const res = await this.query(query, params);
    let candles = res.rows.map(row => ({
      timestamp: parseInt(row.timestamp),
      datetime:  row.datetime,
      open:      parseFloat(row.open),
      high:      parseFloat(row.high),
      low:       parseFloat(row.low),
      close:     parseFloat(row.close),
    }));

    if (limit !== null && limit > 0) {
      candles = candles.reverse();
    }
    return candles;
  }

  // ---------------------------------------------------------------------------
  // saveTrackingContract
  // ---------------------------------------------------------------------------
  async saveTrackingContract(obj) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of obj) {
        await client.query(`
          INSERT INTO all_contracts_tracking (symbol, interval, volatility)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [item.symbol, item.interval, item.volatility]);
      }
      await client.query('COMMIT');
      console.log('Tracking contracts saved successfully.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error saving tracking contracts:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------------------
  // printTable
  // ---------------------------------------------------------------------------
  async printTable(tableName, limit = 1000) {
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) return;
    const res = await this.query(`SELECT * FROM ${tableName} LIMIT $1`, [limit]);
    console.table(res.rows);
  }

  // ---------------------------------------------------------------------------
  // uniqueSymbol
  // ---------------------------------------------------------------------------
  async uniqueSymbol(tableName, interval = null, includeInterval = false) {
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');

    const params = [];
    let query;

    if (includeInterval) {
      query = `SELECT DISTINCT symbol, interval FROM ${tableName}`;
      if (interval) {
        params.push(interval);
        query += ` WHERE interval = $1`;
      }
      const res = await this.query(query, params);
      return res.rows.map(r => ({ symbol: r.symbol, interval: r.interval }));
    } else {
      if (interval) {
        params.push(interval);
        query = `SELECT DISTINCT symbol FROM ${tableName} WHERE interval = $1`;
      } else {
        query = `SELECT DISTINCT symbol FROM ${tableName}`;
      }
      const res = await this.query(query, params);
      return res.rows.map(r => r.symbol);
    }
  }

  // ---------------------------------------------------------------------------
  // uniqueSymbolFromRSI
  // ---------------------------------------------------------------------------
  async uniqueSymbolFromRSI(tableName, interval = null, includeInterval = false) {
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');

    const params = [];
    let query;

    if (includeInterval) {
      query = `SELECT DISTINCT symbol, interval, rsi FROM ${tableName}`;
      if (interval) {
        params.push(interval);
        query += ` WHERE interval = $1`;
      }
      const res = await this.query(query, params);
      return res.rows.map(r => ({ symbol: r.symbol, interval: r.interval, rsi: r.rsi }));
    } else {
      if (interval) {
        params.push(interval);
        query = `SELECT DISTINCT symbol, rsi FROM ${tableName} WHERE interval = $1`;
      } else {
        query = `SELECT DISTINCT symbol, rsi FROM ${tableName}`;
      }
      const res = await this.query(query, params);
      return res.rows.map(r => ({ symbol: r.symbol, rsi: r.rsi }));
    }
  }

  // ---------------------------------------------------------------------------
  // removeDataTable
  // ---------------------------------------------------------------------------
  async removeDataTable(tableName) {
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    await this.query(`DELETE FROM ${tableName}`);
    console.log(`Data removed from table ${tableName} successfully.`);
  }

  // ---------------------------------------------------------------------------
  // removeTable
  // ---------------------------------------------------------------------------
  async removeTable(tableName) {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    await this.query(`DROP TABLE IF EXISTS ${tableName}`);
    console.log(`Table ${tableName} dropped successfully.`);
  }

  // ---------------------------------------------------------------------------
  // removeData
  // ---------------------------------------------------------------------------
  async removeData(tableName, symbol, interval) {
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    await this.query(
      `DELETE FROM ${tableName} WHERE symbol = $1 AND interval = $2`,
      [symbol, interval]
    );
    console.log(`Data removed from table ${tableName} for symbol ${symbol} and interval ${interval} successfully.`);
  }

  // ---------------------------------------------------------------------------
  // removeRow
  // ---------------------------------------------------------------------------
  async removeRow(symbol, timestamp, tableName) {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    if (!symbol || typeof symbol !== 'string') throw new Error('Invalid symbol');
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) throw new Error('Invalid timestamp');

    const res = await this.query(
      `DELETE FROM ${tableName} WHERE symbol = $1 AND timestamp = $2`,
      [symbol, ts]
    );
    if (res.rowCount === 0) {
      console.log(`No rows matched in ${tableName} for symbol ${symbol} and timestamp ${ts}.`);
    } else {
      console.log(`Row removed from table ${tableName} for symbol ${symbol} and timestamp ${ts} successfully.`);
    }
  }

  // ---------------------------------------------------------------------------
  // removeRowOnSymbol
  // ---------------------------------------------------------------------------
  async removeRowOnSymbol(symbol, tableName, id) {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    if (!symbol || typeof symbol !== 'string') throw new Error('Invalid symbol');
    if (id !== undefined && !Number.isFinite(id)) throw new Error('Invalid id');

    let query = `DELETE FROM ${tableName} WHERE symbol = $1`;
    const params = [symbol];

    if (id !== undefined) {
      params.push(id);
      query += ` AND id = $${params.length}`;
    }

    const res = await this.query(query, params);
    if (res.rowCount === 0) {
      console.log(`No rows matched in ${tableName} for symbol ${symbol}${id !== undefined ? ` and id ${id}` : ''}.`);
    } else {
      console.log(`${res.rowCount} row(s) removed from table ${tableName} for symbol ${symbol}${id !== undefined ? ` and id ${id}` : ''} successfully.`);
    }
  }

  // ---------------------------------------------------------------------------
  // removeOldestRecord
  // ---------------------------------------------------------------------------
  async removeOldestRecord(tableName, symbol, interval) {
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    if (!symbol || typeof symbol !== 'string') throw new Error('Invalid symbol');
    if (!interval || typeof interval !== 'string') throw new Error('Invalid interval');

    // PostgreSQL supports DELETE ... RETURNING, so we can do it in one query
    const res = await this.query(`
      DELETE FROM ${tableName}
      WHERE id = (
        SELECT id FROM ${tableName}
        WHERE symbol = $1 AND interval = $2
        ORDER BY timestamp ASC
        LIMIT 1
      )
      RETURNING timestamp
    `, [symbol, interval]);

    if (res.rowCount === 0) {
      console.log(`No records found in ${tableName} for symbol ${symbol} and interval ${interval}.`);
    } else {
      console.log(`Oldest record (timestamp: ${res.rows[0].timestamp}) removed from ${tableName} for symbol ${symbol} and interval ${interval} successfully.`);
    }
  }

  // ---------------------------------------------------------------------------
  // countRecords
  // ---------------------------------------------------------------------------
  async countRecords(tableName, symbol, interval) {
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    const res = await this.query(
      `SELECT COUNT(*) AS count FROM ${tableName} WHERE symbol = $1 AND interval = $2`,
      [symbol, interval]
    );
    return parseInt(res.rows[0].count, 10);
  }

  // ---------------------------------------------------------------------------
  // checkRow
  // ---------------------------------------------------------------------------
  async checkRow(symbol, interval, tableName) {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    const res = await this.query(
      `SELECT * FROM ${tableName} WHERE symbol = $1 AND interval = $2 ORDER BY timestamp DESC LIMIT 1`,
      [symbol, interval]
    );
    return res.rows[0] || null;
  }

  // ---------------------------------------------------------------------------
  // checkRowForTypeSignal
  // ---------------------------------------------------------------------------
 async checkRowForTypeSignal(symbol, interval, typeSignal, tableName, levelTimeStamp = null) {
    // Защита от SQL-инъекции через имя таблицы
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
        throw new Error('Invalid table name');
    }

    let query = `
        SELECT * 
        FROM ${tableName} 
        WHERE symbol = $1 
          AND interval = $2 
          AND type_signal = $3
    `;

    const params = [symbol, interval, typeSignal];

    if (levelTimeStamp !== null) {
        params.push(levelTimeStamp);
        query += ` AND level_timestamp = $${params.length}`;
    }

    query += ` ORDER BY timestamp DESC LIMIT 1`;

    const res = await this.query(query, params);

    return res.rows[0] || null;
}

  // ---------------------------------------------------------------------------
  // checkRowRSI
  // ---------------------------------------------------------------------------
  async checkRowRSI(symbol, tableName) {
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) throw new Error('Invalid table name');
    const res = await this.query(
      `SELECT * FROM ${tableName} WHERE symbol = $1 LIMIT 1`,
      [symbol]
    );
    return res.rows[0] || null;
  }

  // ---------------------------------------------------------------------------
  // saveLivePrice
  // ---------------------------------------------------------------------------
  async saveLivePrice(data) {
    const records = Array.isArray(data) ? data : [data];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const record of records) {
        console.log('DATABASE SAVE SYMBOL', record.symbol);
        const { symbol, timestamp } = record;
        const lastprice  = record.lastPrice  ?? null;
        const markPrice  = record.markPrice  ?? null;
        const indexPrice = record.indexPrice ?? null;

        if (!symbol || !Number.isFinite(timestamp)) {
          const err = new Error('Invalid symbol or timestamp in live price data');
          console.error(err.message, record);
          throw err;
        }

        await client.query(`
          INSERT INTO live_prices (symbol, lastprice, markPrice, indexPrice, timestamp)
          VALUES ($1, $2, $3, $4, $5)
        `, [symbol, lastprice, markPrice, indexPrice, timestamp]);
      }
      await client.query('COMMIT');
      await this._cleanupLivePrices();
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Error saving live prices:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  async _cleanupLivePrices() {
    const res = await this.query(`SELECT COUNT(*) AS total FROM live_prices`);
    const total = parseInt(res.rows[0].total, 10);
    if (total < 100000) return;

    await this.query(`DELETE FROM live_prices`);
    console.log(`Таблица очищена. Было строк: ${total}`);
  }

  // ---------------------------------------------------------------------------
  // getLivePrice
  // ---------------------------------------------------------------------------
  async getLivePrice(symbol, limit = 1) {
    const res = await this.query(`
      SELECT id, symbol, lastprice, markprice, indexprice, timestamp, created_at
      FROM live_prices
      WHERE symbol = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [symbol, limit]);
    return res.rows;
  }

  // ---------------------------------------------------------------------------
  // getLivePricesBySymbol
  // ---------------------------------------------------------------------------
  async getLivePricesBySymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') throw new Error('Invalid symbol');
    const res = await this.query(`SELECT * FROM live_prices WHERE symbol = $1`, [symbol]);
    console.log(`Found ${res.rows.length} records for symbol: ${symbol}`);
    return res.rows;
  }

  // ---------------------------------------------------------------------------
  // getMinLivePrice
  // ---------------------------------------------------------------------------
  async getMinLivePrice(symbol) {
    if (!symbol || typeof symbol !== 'string') throw new Error('Invalid symbol');
    const res = await this.query(
      `SELECT MIN(lastprice) AS minPrice FROM live_prices WHERE symbol = $1`,
      [symbol]
    );
    const row = res.rows[0];
    console.log(`getMinLivePrice for ${symbol}:`, row);
    return row && row.minprice !== null ? parseFloat(row.minprice) : null;
  }

  // ---------------------------------------------------------------------------
  // getMaxLivePrice
  // ---------------------------------------------------------------------------
  async getMaxLivePrice(symbol) {
    if (!symbol || typeof symbol !== 'string') throw new Error('Invalid symbol');
    const res = await this.query(
      `SELECT MAX(lastprice) AS maxPrice FROM live_prices WHERE symbol = $1`,
      [symbol]
    );
    const row = res.rows[0];
    console.log(`getMaxLivePrice for ${symbol}:`, row);
    return row && row.maxprice !== null ? parseFloat(row.maxprice) : null;
  }

  // ---------------------------------------------------------------------------
  // getLastMinutePrices
  // ---------------------------------------------------------------------------
  async getLastMinutePrices(symbol) {
    if (!symbol || typeof symbol !== 'string') throw new Error('Invalid symbol');

    // Get max timestamp, then fetch last-minute records — single query in Postgres
    const res = await this.query(`
      SELECT * FROM live_prices
      WHERE symbol = $1
        AND timestamp >= (
          SELECT MAX(timestamp) - 60000 FROM live_prices WHERE symbol = $1
        )
      ORDER BY timestamp DESC
    `, [symbol]);
    return res.rows;
  }

  // ---------------------------------------------------------------------------
  // close
  // ---------------------------------------------------------------------------
  async close() {
    await this.pool.end();
    console.log('Database connection pool closed.');
  }
}

module.exports = PostgresDB;

// Example usage:
// const db = new PostgresDB({
//   host: 'localhost',
//   port: 5432,
//   database: 'trading_bot',
//   user: 'postgres',
//   password: 'secret',
// });
// db.getCandles('BTCUSDT', '1m', 'tracking_contracts').then(console.log).catch(console.error).finally(() => db.close());

// const sqlite3 = require('sqlite3').verbose();
// const path = require('path');


// class SqliteDB {
//   constructor(dbPath = './candles.db') {
//     this.db = new sqlite3.Database(path.resolve(dbPath), (err) => {
//       if (err) {
//         console.error('Error opening database:', err.message);
//       } else {
//         console.log('Connected to SQLite database.');
//       }
//     });
//     this.init();
//   }

//   /**
//    * Initialize the database by creating the candles and filteredMinimum tables if they don't exist.
//    */
//   init() {

//     const createCandlesTableQuery = `
//       CREATE TABLE IF NOT EXISTS tracking_contracts (
//         id INTEGER PRIMARY KEY AUTOINCREMENT,
//         symbol TEXT NOT NULL,
//         timestamp INTEGER NOT NULL,
//         open REAL NOT NULL,
//         high REAL NOT NULL,
//         low REAL NOT NULL,
//         close REAL NOT NULL,
//         interval TEXT NOT NULL,
//         datetime DATETIME NOT NULL,
//         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//         UNIQUE(symbol, timestamp, interval)
//       );
//     `;
//     this.db.run(createCandlesTableQuery, (err) => {
//       if (err) {
//         console.error('Error creating candles table:', err.message);
//       }
//     });

//     const createTrackingReal_Time_Price = `
//       CREATE TABLE IF NOT EXISTS live_prices (
//           id INTEGER PRIMARY KEY AUTOINCREMENT,
//           symbol TEXT NOT NULL,
//           lastprice REAL,
//           markPrice REAL,
//           indexPrice REAL,
//           timestamp INTEGER NOT NULL,
//           created_at DATETIME DEFAULT CURRENT_TIMESTAMP
//       );
//     `;
//     this.db.run(createTrackingReal_Time_Price, (err) => {
//       if (err) {
//         console.error('Error creating live_prices table:', err.message);
//       }
//     });

//     const createTracking_Contracts_for_real_price = `
//       CREATE TABLE IF NOT EXISTS all_contracts_tracking (
//           id INTEGER PRIMARY KEY AUTOINCREMENT,
//           symbol TEXT NOT NULL,
//           interval TEXT NOT NULL,
//           volatility REAL
//       );
//     `;
//     this.db.run(createTracking_Contracts_for_real_price, (err) => {
//       if (err) {
//         console.error('Error creating all_contracts_tracking table:', err.message);
//       }
//     });

//     const createFilteredMinimumTable = `
//       CREATE TABLE IF NOT EXISTS filteredMinimum (
//           id INTEGER PRIMARY KEY AUTOINCREMENT,
//           symbol TEXT NOT NULL,
//           timestamp INTEGER NOT NULL,
//           datetime DATETIME NOT NULL,
//           price REAL NOT NULL,
//           interval TEXT NOT NULL
//       );
//     `;
//     this.db.run(createFilteredMinimumTable, (err) => {
//       if (err) {
//         console.error('Error creating filteredMinimum table:', err.message);
//       }
//     });

//     const createTableForControlSendSignal = `
//       CREATE TABLE IF NOT EXISTS control_send_signal (
//           id INTEGER PRIMARY KEY AUTOINCREMENT,
//           symbol TEXT NOT NULL,
//           timestamp INTEGER NOT NULL,
//           interval TEXT NOT NULL,
//           type_signal TEXT NOT NULL
//       );
//     `;
//     this.db.run(createTableForControlSendSignal, (err) => {
//       if (err) {
//         console.error('Error creating control_send_signal table:', err.message);
//       }
//     });
//   }


//  async saveSendSignalControl(symbol, timestamp, interval, typeSignal) {

//     return new Promise((resolve, reject) => {
//       this.db.serialize(() => {
//         this.db.run('BEGIN TRANSACTION');
//         const stmt = this.db.prepare(`
//           INSERT OR IGNORE INTO control_send_signal 
//           (symbol, timestamp, interval, type_signal) 
//           VALUES (?, ?, ?, ?)
//         `);

//         stmt.run(
//           symbol,
//           timestamp,
//           interval,
//           typeSignal,
//           (err) => {
//             if (err) {
//               console.error('Error inserting control send signal:', err.message);
//               reject(err);
//             }
//           }
//         );

//         stmt.finalize();
//         this.db.run('COMMIT', (err) => {
//           if (err) {
//             console.error('Error committing transaction:', err.message);
//             reject(err);
//           } else {
//             console.log('Control send signal saved successfully.');
//             resolve();
//           }
//         });
//       });
//     });
//  } 

//   /**
//    * Save filtered minimum data to the filteredMinimum table.
//    * @param {string} symbol - Symbol name, e.g., 'BTCUSDT'
//    * @param {string} interval - Kline interval, e.g., '1m'
//    * @param {Array<Object>} minima - Array of minimum data points
//    * @returns {Promise<void>}
//    */
//   async saveFilteredMinimum(symbol, interval, minima) {
//     return new Promise((resolve, reject) => {
//       this.db.serialize(() => {
//         this.db.run('BEGIN TRANSACTION');
//         const stmt = this.db.prepare(`
//           INSERT OR IGNORE INTO filteredMinimum 
//           (symbol, timestamp, price, interval, datetime) 
//           VALUES (?, ?, ?, ?, ?)
//         `);

//         for (const min of minima) {
//           stmt.run(
//             symbol,
//             min.timestamp,
//             min.closePrice,
//             interval,
//             min.dateTime,
//             (err) => {
//               if (err) {
//                 console.error('Error inserting filtered minimum:', err.message);
//               }
//             }
//           );
//         }

//         stmt.finalize();
//         this.db.run('COMMIT', (err) => {
//           if (err) {
//             console.error('Error committing transaction:', err.message);
//             reject(err);
//           } else {
//             console.log('Filtered minimum data saved successfully.');
//             resolve();
//           }
//         });
//       });
//     });
//   }

//   /**
//    * Save candles data from API response to the candles table.
//    * @param {string} symbol - Symbol name, e.g., 'BTCUSDT'
//    * @param {string} interval - Kline interval, e.g., '1m'
//    * @param {Array<Array<string>>} candles - Array of candles: [[startTime, open, high, low, close, volume, turnover], ...]
//    * @returns {Promise<void>}
//    */
//   async saveCandles(symbol, interval, candles) {
//     return new Promise((resolve, reject) => {
//       this.db.serialize(() => {
//         this.db.run('BEGIN TRANSACTION');
//         const stmt = this.db.prepare(`
//           INSERT OR IGNORE INTO tracking_contracts 
//           (symbol, timestamp, open, high, low, close, interval, datetime) 
//           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//         `);

//         for (const candle of candles) {
//           const timestamp = parseInt(candle[0]); // ms timestamp
//           const open = parseFloat(candle[1]);
//           const high = parseFloat(candle[2]);
//           const low = parseFloat(candle[3]);
//           const close = parseFloat(candle[4]);
//           // Convert timestamp to 'YYYY-MM-DD HH:MM:SS'
//           const date = new Date(timestamp);
//           const datetime = date.toISOString().slice(0, 19).replace('T', ' ');

//           stmt.run(
//             symbol,
//             timestamp,
//             open,
//             high,
//             low,
//             close,
//             interval,
//             datetime,
//             (err) => {
//               if (err) {
//                 console.error('Error inserting candle:', err.message);
//               }
//             }
//           );
//         }

//         stmt.finalize();
//         this.db.run('COMMIT', (err) => {
//           if (err) {
//             console.error('Error committing transaction:', err.message);
//             reject(err);
//           } else {
//             this._cleanupCandlesTable(); // Check if we need to clean up old records
//             console.log('Candles saved successfully.');
//             resolve();
//           }
//         });
//       });
//     });
//   }

//   _cleanupCandlesTable() {
//   this.db.get(`SELECT COUNT(*) as total FROM tracking_contracts`, (err, row) => {
//     if (err) {
//       console.error('Ошибка получения количества записей:', err.message);
//       return;
//     }

//     const total = row ? row.total : 0;

//     // Чистим только если достигли 100000
//     if (total < 100000) {
//       return;
//     }

//     this.db.run(`DELETE FROM tracking_contracts`, (err) => {
//       if (err) {
//         console.error('Ошибка очистки tracking_contracts:', err.message);
//       } else {
//         console.log(`Таблица очищена. Было строк: ${total}`);
//       }
//     });
//   });
// }

//   // /**
//   //  * Get all tracking contracts from the tracking_contracts table.
//   //  * @returns {Promise<Array<Object>>} Array of tracking contract objects with id, symbol, interval, price, from_which_side
//   //  */
//   // async gettracking_contracts() {
//   //   return new Promise((resolve, reject) => {
//   //     const query = `SELECT id, symbol, interval, volatility FROM all_contracts_tracking`;
      
//   //     this.db.all(query, (err, rows) => {
//   //       if (err) {
//   //         console.error('Error fetching tracking contracts:', err.message);
//   //         reject(err);
//   //       } else {
//   //         resolve(rows || []);
//   //       }
//   //     });
//   //   });
//   // }


//   /**
//    * Get tracking contracts from the tracking_contracts table.
//    * Можно фильтровать по symbol и/или interval.
//    * 
//    * @param {string|null} symbol - символ (например 'BTCUSDT'), если null — без фильтрации
//    * @param {string|null} interval - интервал (например '15m', '1h'), если null — без фильтрации
//    * @returns {Promise<Array<Object>>} Array of tracking contract objects
//    */
//   async gettracking_contracts(symbol = null, interval = null) {
//     return new Promise((resolve, reject) => {
//       let query = `
//         SELECT id, symbol, interval, volatility 
//         FROM all_contracts_tracking
//       `;
//       const params = [];

//       // Динамическое добавление условий
//       const conditions = [];

//       if (symbol) {
//         conditions.push(`symbol = ?`);
//         params.push(symbol);
//       }

//       if (interval) {
//         conditions.push(`interval = ?`);
//         params.push(interval);
//       }

//       if (conditions.length > 0) {
//         query += ` WHERE ` + conditions.join(' AND ');
//       }

//       // Опционально: сортировка
//       query += ` ORDER BY symbol, interval`;

//       this.db.all(query, params, (err, rows) => {
//         if (err) {
//           console.error('Error fetching tracking contracts:', err.message);
//           reject(err);
//         } else {
//           resolve(rows || []);
//         }
//       });
//     });
//   }


// /**
//    * Retrieve candles from the specified table.
//    * @param {string} symbol - Symbol name, e.g., 'BTCUSDT'
//    * @param {string} interval - Kline interval, e.g., '1m'
//    * @param {string} table - Table name
//    * @param {number|null} limit - How many last candles to return (null = all candles)
//    * @returns {Promise<Array<Object>>} Candles sorted by timestamp ASC (oldest → newest)
//    */
// async getCandles(symbol, interval, table, limit = null) {
//   return new Promise((resolve, reject) => {
//     let query = `
//       SELECT timestamp, datetime, open, high, low, close
//       FROM ${table}
//       WHERE symbol = ? AND interval = ?
//     `;

//     const params = [symbol, interval];

//     // Если указан лимит — берём последние N свечей
//     if (limit !== null && limit > 0) {
//       query += ` ORDER BY timestamp DESC LIMIT ?`;
//       params.push(limit);
//     } else {
//       query += ` ORDER BY timestamp ASC`;
//     }

//     this.db.all(query, params, (err, rows) => {
//       if (err) {
//         console.error('Error fetching candles:', err.message);
//         reject(err);
//       } else {
//         let candles = rows.map(row => ({
//           timestamp: row.timestamp,
//           datetime: row.datetime,
//           open: row.open,
//           high: row.high,
//           low: row.low,
//           close: row.close,
//         }));

//         // Если мы делали DESC + LIMIT, то разворачиваем массив,
//         // чтобы вернуть в хронологическом порядке (ASC)
//         if (limit !== null && limit > 0) {
//           candles = candles.reverse();
//         }

//         resolve(candles);
//       }
//     });
//   });
// }

// async saveTrackingContract(obj) {
//     return new Promise((resolve, reject) => {
//       this.db.serialize(() => {
//         this.db.run('BEGIN TRANSACTION');
//         const stmt = this.db.prepare(`
//           INSERT OR IGNORE INTO all_contracts_tracking 
//           (symbol, interval, volatility) 
//           VALUES (?, ?, ?)
//         `);
//           for(const item of obj) {
//             stmt.run(
//             item.symbol,
//             item.interval,
//             item.volatility,
//             (err) => {
//               if (err) {
//                 console.error('Error inserting candle:', err.message);
//               }
//             }
//           );
//         }
        

//         stmt.finalize();
//         this.db.run('COMMIT', (err) => {
//           if (err) {
//             console.error('Error committing transaction:', err.message);
//             reject(err);
//           } else {
//             console.log('Candles saved successfully.');
//             resolve();
//           }
//         });
//       });
//     });
//   }  


// async printTable(tableName, limit = 1000) {
//     if (!/^[a-zA-Z0-9_]+$/.test(tableName)) return;

//     const query = `SELECT * FROM ${tableName} LIMIT ?`;

//     this.db.all(query, [limit], (err, rows) => {
//         if (err) {
//             console.error(err.message);
//             return;
//         }

//         console.table(rows);
//     });
// }

//   /**
//    * Get unique symbols from a table.
//    * If `interval` is provided, results will be filtered by interval.
//    * If `includeInterval` is true, returns array of { symbol, interval } objects.
//    * Otherwise returns an array of symbol strings (backwards compatible).
//    *
//    * @param {string} tableName - Table name
//    * @param {string|null} interval - Optional interval to filter (e.g., '1m')
//    * @param {boolean} includeInterval - If true, return objects with symbol and interval
//    * @returns {Promise<Array<string>|Array<Object>>}
//    */
//   async uniqueSymbol(tableName, interval = null, includeInterval = false) {
//     return new Promise((resolve, reject) => {
//       let query;
//       const params = [];

//       if (includeInterval) {
//         query = `SELECT DISTINCT symbol, interval FROM ${tableName}`;
//         if (interval) {
//           query += ` WHERE interval = ?`;
//           params.push(interval);
//         }

//         this.db.all(query, params, (err, rows) => {
//           if (err) {
//             console.error('Error fetching unique symbols with interval:', err.message);
//             reject(err);
//           } else {
//             const results = rows.map(row => ({ symbol: row.symbol, interval: row.interval }));
//             resolve(results);
//           }
//         });
//       } else {
//         if (interval) {
//           query = `SELECT DISTINCT symbol FROM ${tableName} WHERE interval = ?`;
//           params.push(interval);
//         } else {
//           query = `SELECT DISTINCT symbol FROM ${tableName}`;
//         }

//         this.db.all(query, params, (err, rows) => {
//           if (err) {
//             console.error('Error fetching unique symbols:', err.message);
//             reject(err);
//           } else {
//             const symbols = rows.map(row => row.symbol);
//             resolve(symbols);
//           }
//         });
//       }
//     });
//   }

//   async uniqueSymbolFromRSI(tableName, interval = null, includeInterval = false) {
//   return new Promise((resolve, reject) => {
//     let query;
//     const params = [];

//     if (includeInterval) {
//       query = `SELECT DISTINCT symbol, interval, rsi FROM ${tableName}`;
//       if (interval) {
//         query += ` WHERE interval = ?`;
//         params.push(interval);
//       }

//       this.db.all(query, params, (err, rows) => {
//         if (err) {
//           console.error('Error fetching unique symbols with interval:', err.message);
//           reject(err);
//         } else {
//           const results = rows.map(row => ({ 
//             symbol: row.symbol, 
//             interval: row.interval,
//             rsi: row.rsi
//           }));
//           resolve(results);
//         }
//       });

//     } else {
//       if (interval) {
//         query = `SELECT DISTINCT symbol, rsi FROM ${tableName} WHERE interval = ?`;
//         params.push(interval);
//       } else {
//         query = `SELECT DISTINCT symbol, rsi FROM ${tableName}`;
//       }

//       this.db.all(query, params, (err, rows) => {
//         if (err) {
//           console.error('Error fetching unique symbols:', err.message);
//           reject(err);
//         } else {
//           const results = rows.map(row => ({ 
//             symbol: row.symbol, 
//             rsi: row.rsi 
//           }));
//           resolve(results);
//         }
//       });
//     }
//   });
// }

//   async removeDataTable(tableName) {
//     return new Promise((resolve, reject) => {
//       const query = `DELETE FROM ${tableName}`;
//       this.db.run(query, (err) => {
//         if (err) {
//           console.error('Error removing data from table:', err.message);
//           reject(err);
//         } else {
//           console.log(`Data removed from table ${tableName} successfully.`);
//           resolve();
//         }
//       });
//     });
//   }

//   /**
//    * Drop a table entirely from the database.
//    * WARNING: this permanently removes the table and all its data.
//    * @param {string} tableName
//    * @returns {Promise<void>}
//    */
//   async removeTable(tableName) {
//     return new Promise((resolve, reject) => {
//       // Basic validation to avoid SQL injection via table name
//       if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
//         const err = new Error('Invalid table name');
//         console.error(err.message);
//         return reject(err);
//       }

//       const query = `DROP TABLE IF EXISTS ${tableName}`;
//       this.db.run(query, (err) => {
//         if (err) {
//           console.error(`Error dropping table ${tableName}:`, err.message);
//           reject(err);
//         } else {
//           console.log(`Table ${tableName} dropped successfully.`);
//           resolve();
//         }
//       });
//     });
//   }

//   async removeData(tableName, symbol, interval) {
//     return new Promise((resolve, reject) => {
//       const query = `DELETE FROM ${tableName} WHERE symbol = ? AND interval = ?`;
//       this.db.run(query, [symbol, interval], (err) => {
//         if (err) {
//           console.error(`Error removing data from table ${tableName} for symbol ${symbol} and interval ${interval}:`, err.message);
//           reject(err);
//         } else {
//           console.log(`Data removed from table ${tableName} for symbol ${symbol} and interval ${interval} successfully.`);
//           resolve();
//         }
//       });
//     });
//   }
  
//   async removeRow(symbol, timestamp, tableName) {
//     return new Promise((resolve, reject) => {
//       // Basic validation to avoid SQL injection via table name
//       if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
//         const err = new Error('Invalid table name');
//         console.error(err.message);
//         return reject(err);
//       }

//       if (!symbol || typeof symbol !== 'string') {
//         const err = new Error('Invalid symbol');
//         console.error(err.message);
//         return reject(err);
//       }

//       const ts = Number(timestamp);
//       if (!Number.isFinite(ts)) {
//         const err = new Error('Invalid timestamp');
//         console.error(err.message);
//         return reject(err);
//       }

//       const query = `DELETE FROM ${tableName} WHERE symbol = ? AND timestamp = ?`;
//       this.db.run(query, [symbol, ts], function(err) {
//         if (err) {
//           console.error(`Error removing row from table ${tableName} for symbol ${symbol} and timestamp ${ts}:`, err.message);
//           reject(err);
//         } else {
//           if (this && this.changes === 0) {
//             console.log(`No rows matched in ${tableName} for symbol ${symbol} and timestamp ${ts}.`);
//           } else {
//             console.log(`Row removed from table ${tableName} for symbol ${symbol} and timestamp ${ts} successfully.`);
//           }
//           resolve();
//         }
//       });
//     });
//   }

//   async removeRowOnSymbol(symbol, tableName, id) {
//     return new Promise((resolve, reject) => {
//       // Basic validation to avoid SQL injection via table name
//       if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
//         const err = new Error('Invalid table name');
//         console.error(err.message);
//         return reject(err);
//       }

//       if (!symbol || typeof symbol !== 'string') {
//         const err = new Error('Invalid symbol');
//         console.error(err.message);
//         return reject(err);
//       }

//       if (id !== undefined && !Number.isFinite(id)) {
//         const err = new Error('Invalid id');
//         console.error(err.message);
//         return reject(err);
//       }

//       let query = `DELETE FROM ${tableName} WHERE symbol = ?`;
//       const params = [symbol];

//       if (id !== undefined) {
//         query += ` AND id = ?`;
//         params.push(id);
//       }

//       this.db.run(query, params, function(err) {
//         if (err) {
//           console.error(`Error removing rows from table ${tableName} for symbol ${symbol}${id !== undefined ? ` and id ${id}` : ''}:`, err.message);
//           reject(err);
//         } else {
//           if (this && this.changes === 0) {
//             console.log(`No rows matched in ${tableName} for symbol ${symbol}${id !== undefined ? ` and id ${id}` : ''}.`);
//           } else {
//             console.log(`${this.changes} row(s) removed from table ${tableName} for symbol ${symbol}${id !== undefined ? ` and id ${id}` : ''} successfully.`);
//           }
//           resolve();
//         }
//       });
//     });
//   }

//   /**
//    * Remove the oldest record (with the earliest timestamp) for a given symbol and interval.
//    * @param {string} tableName - Table name
//    * @param {string} symbol - Symbol to filter
//    * @param {string} interval - Interval to filter
//    * @returns {Promise<void>}
//    */
//   async removeOldestRecord(tableName, symbol, interval) {
//     return new Promise((resolve, reject) => {
//       // Validation
//       if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
//         const err = new Error('Invalid table name');
//         console.error(err.message);
//         return reject(err);
//       }

//       if (!symbol || typeof symbol !== 'string') {
//         const err = new Error('Invalid symbol');
//         console.error(err.message);
//         return reject(err);
//       }

//       if (!interval || typeof interval !== 'string') {
//         const err = new Error('Invalid interval');
//         console.error(err.message);
//         return reject(err);
//       }

//       // Find the oldest record
//       const findQuery = `SELECT timestamp FROM ${tableName} WHERE symbol = ? AND interval = ? ORDER BY timestamp ASC LIMIT 1`;
//       this.db.get(findQuery, [symbol, interval], (err, row) => {
//         if (err) {
//           console.error(`Error finding oldest record in ${tableName}:`, err.message);
//           return reject(err);
//         }

//         if (!row) {
//           console.log(`No records found in ${tableName} for symbol ${symbol} and interval ${interval}.`);
//           return resolve();
//         }

//         // Delete the oldest record
//         const deleteQuery = `DELETE FROM ${tableName} WHERE symbol = ? AND interval = ? AND timestamp = ?`;
//         this.db.run(deleteQuery, [symbol, interval, row.timestamp], function(err) {
//           if (err) {
//             console.error(`Error deleting oldest record from ${tableName}:`, err.message);
//             reject(err);
//           } else {
//             console.log(`Oldest record (timestamp: ${row.timestamp}) removed from ${tableName} for symbol ${symbol} and interval ${interval} successfully.`);
//             resolve();
//           }
//         });
//       });
//     });
//   }

//   /**
//  * Count records in a table for given symbol and interval.
//  * @param {string} tableName - Table name
//  * @param {string} symbol - Symbol to filter
//  * @param {string} interval - Interval to filter
//  * @returns {Promise<number>} Number of records
//  */
// async countRecords(tableName, symbol, interval) {
//   return new Promise((resolve, reject) => {
//     const query = `
//       SELECT COUNT(*) as count
//       FROM ${tableName}
//       WHERE symbol = ? AND interval = ?
//     `;
//     this.db.get(query, [symbol, interval], (err, row) => {
//       if (err) {
//         console.error('Error counting records:', err.message);
//         reject(err);
//       } else {
//         resolve(row ? row.count : 0);
//       }
//     });
//   });
// }

//   /**
//    * Return the most recent row for the given symbol and interval in the specified table.
//    * @param {string} symbol
//    * @param {string} interval
//    * @param {string} tableName
//    * @returns {Promise<Object|null>} The latest row or null if none found
//    */
//   async checkRow(symbol, interval, tableName) {
//     return new Promise((resolve, reject) => {
//       // Basic validation to avoid SQL injection via table name
//       if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
//         const err = new Error('Invalid table name');
//         console.error(err.message);
//         return reject(err);
//       }

//       const query = `SELECT * FROM ${tableName} WHERE symbol = ? AND interval = ? ORDER BY timestamp DESC LIMIT 1`;
//       const params = [symbol, interval];

//       this.db.get(query, params, (err, row) => {
//         if (err) {
//           console.error(`Error fetching latest row from ${tableName}:`, err.message);
//           reject(err);
//         } else {
//           resolve(row || null);
//         }
//       });
//     });
//   }

//   async checkRowForTypeSignal(symbol, interval, typeSignal, tableName) {
//     return new Promise((resolve, reject) => {
//       // Basic validation to avoid SQL injection via table name
//       if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
//         const err = new Error('Invalid table name');
//         console.error(err.message);
//         return reject(err);
//       }

//       const query = `SELECT * FROM ${tableName} WHERE symbol = ? AND interval = ? AND type_signal = ? ORDER BY timestamp DESC LIMIT 1`;
//       const params = [symbol, interval, typeSignal];

//       this.db.get(query, params, (err, row) => {
//         if (err) {
//           console.error(`Error fetching latest row from ${tableName}:`, err.message);
//           reject(err);
//         } else {
//           resolve(row || null);
//         }
//       });
//     });
//   }

//   async checkRowRSI(symbol, tableName) {
//   return new Promise((resolve, reject) => {
//     if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
//       const err = new Error('Invalid table name');
//       console.error(err.message);
//       return reject(err);
//     }

//     const query = `SELECT * FROM ${tableName} WHERE symbol = ? LIMIT 1`;
//     const params = [symbol];

//     this.db.get(query, params, (err, row) => {
//       if (err) {
//         console.error(`Error fetching row from ${tableName}:`, err.message);
//         reject(err);
//       } else {
//         resolve(row || null);
//       }
//     });
//   });
// }

  

//   /**
//    * Save live price data to the live_prices table.
//    * Automatically removes old records if total exceeds 500 per symbol.
//    * @param {Object|Array<Object>} data - Single price object or array of price objects
//    * @param {string} data.symbol - Symbol name, e.g., 'BTCUSDT'
//    * @param {number} data.lastprice - Last price
//    * @param {number} data.markPrice - Mark price
//    * @param {number} data.indexPrice - Index price
//    * @param {number} data.timestamp - Unix timestamp (ms)
//    * @returns {Promise<void>}
//    */
//   async saveLivePrice(data) { 
//     return new Promise((resolve, reject) => {
//       // Normalize to array
//       const records = Array.isArray(data) ? data : [data];

//       this.db.serialize(() => {
//         this.db.run('BEGIN TRANSACTION');
//         const stmt = this.db.prepare(`
//           INSERT INTO live_prices 
//           (symbol, lastprice, markPrice, indexPrice, timestamp) 
//           VALUES (?, ?, ?, ?, ?)
//         `);

//         for (const record of records) {
//           console.log('DATABASE SAVE SYMBOL', record.symbol);
//           const symbol = record.symbol;
//           const lastprice = record.lastprice ?? null;
//           const markPrice = record.markPrice ?? null;
//           const indexPrice = record.indexPrice ?? null;
//           const timestamp = record.timestamp;

//           if (!symbol || !Number.isFinite(timestamp)) {
//             const err = new Error('Invalid symbol or timestamp in live price data');
//             console.error(err.message, record);
//             return reject(err);
//           }

//           stmt.run(
//             symbol,
//             lastprice,
//             markPrice,
//             indexPrice,
//             timestamp,
//             (err) => {
//               if (err) {
//                 console.error('Error inserting live price:', err.message);
//               }
//             }
//           );
//         }

//         stmt.finalize();
//         this.db.run('COMMIT', (err) => {
//           if (err) {
//             console.error('Error committing transaction:', err.message);
//             reject(err);
//           } else {
//             // console.log('Live prices saved successfully.');
//             // Delete old records if count exceeds 500 for each symbol
//             this._cleanupLivePrices();
//             resolve();
//           }
//         });
//       });
//     });
//   }

//   /**
//    * Internal method to clean up old live price records.
//    * Keeps only the latest 500 records per symbol.
//    * @private
//    */
//  /**
//  * Очищает таблицу live_prices, оставляя только последние 500 записей ДЛЯ КАЖДОГО symbol.
//  * Выполняет очистку ТОЛЬКО если в таблице >= 500 строк всего.
//  */
// _cleanupLivePrices() {
//   this.db.get(`SELECT COUNT(*) as total FROM live_prices`, (err, row) => {
//     if (err) {
//       console.error('Ошибка получения количества записей:', err.message);
//       return;
//     }

//     const total = row ? row.total : 0;

//     // Чистим только если достигли 100000
//     if (total < 100000) {
//       return;
//     }

//     this.db.run(`DELETE FROM live_prices`, (err) => {
//       if (err) {
//         console.error('Ошибка очистки live_prices:', err.message);
//       } else {
//         console.log(`Таблица очищена. Было строк: ${total}`);
//       }
//     });
//   });
// }

//   /**
//    * Get latest live prices for a symbol.
//    * @param {string} symbol - Symbol name, e.g., 'BTCUSDT'
//    * @param {number} limit - Number of records to retrieve (default 1 for latest)
//    * @returns {Promise<Array<Object>>} Array of price records
//    */
//   async getLivePrice(symbol, limit = 1) {
//     return new Promise((resolve, reject) => {
//       const query = `
//         SELECT id, symbol, lastprice, markPrice, indexPrice, timestamp, created_at
//         FROM live_prices
//         WHERE symbol = ?
//         ORDER BY timestamp DESC
//         LIMIT ?
//       `;

//       this.db.all(query, [symbol, limit], (err, rows) => {
//         if (err) {
//           console.error('Error fetching live prices:', err.message);
//           reject(err);
//         } else {
//           resolve(rows || []);
//         }
//       });
//     });
//   }

//   /**
//    * Get all live prices for a symbol (for debugging).
//    * @param {string} symbol - Symbol name, e.g., 'BTCUSDT'
//    * @returns {Promise<Array<Object>>} All price records for the symbol
//    */
//   async getLivePricesBySymbol(symbol) {
//     return new Promise((resolve, reject) => {
//       if (!symbol || typeof symbol !== 'string') {
//         const err = new Error('Invalid symbol');
//         console.error(err.message);
//         return reject(err);
//       }

//       const query = `SELECT * FROM live_prices WHERE symbol = ?`;
      
//       this.db.all(query, [symbol], (err, rows) => {
//         if (err) {
//           console.error('Error fetching live prices for symbol:', err.message);
//           reject(err);
//         } else {
//           console.log(`Found ${rows ? rows.length : 0} records for symbol: ${symbol}`);
//           resolve(rows || []);
//         }
//       });
//     });
//   }

//   /**
//    * Get the minimum (lowest) lastprice for a given symbol.
//    * @param {string} symbol - Symbol name, e.g., 'BTCUSDT'
//    * @returns {Promise<number|null>} The lowest lastprice or null if no data
//    */
//   async getMinLivePrice(symbol) {
//     return new Promise((resolve, reject) => {
//       if (!symbol || typeof symbol !== 'string') {
//         const err = new Error('Invalid symbol');
//         console.error(err.message);
//         return reject(err);
//       }

//       const query = `
//         SELECT MIN(lastprice) as minPrice
//         FROM live_prices
//         WHERE symbol = ?
//       `;

//       this.db.get(query, [symbol], (err, row) => {
//         if (err) {
//           console.error('Error fetching min live price:', err.message);
//           reject(err);
//         } else {
//           console.log(`getMinLivePrice for ${symbol}:`, row);
//           resolve(row && row.minPrice !== null ? row.minPrice : null);
//         }
//       });
//     });
//   }

//   /**
//    * Get the maximum (highest) lastprice for a given symbol.
//    * @param {string} symbol - Symbol name, e.g., 'BTCUSDT'
//    * @returns {Promise<number|null>} The highest lastprice or null if no data
//    */
//   async getMaxLivePrice(symbol) {
//     return new Promise((resolve, reject) => {
//       if (!symbol || typeof symbol !== 'string') {
//         const err = new Error('Invalid symbol');
//         console.error(err.message);
//         return reject(err);
//       }

//       const query = `
//         SELECT MAX(lastprice) as maxPrice
//         FROM live_prices
//         WHERE symbol = ?
//       `;

//       this.db.get(query, [symbol], (err, row) => {
//         if (err) {
//           console.error('Error fetching max live price:', err.message);
//           reject(err);
//         } else {
//           console.log(`getMaxLivePrice for ${symbol}:`, row);
//           resolve(row && row.maxPrice !== null ? row.maxPrice : null);
//         }
//       });
//     });
//   }

//     /**
//    * Get all live prices for a symbol within the last minute (1 minute = 60000 ms).
//    * Returns all records from the last 60 seconds based on the latest timestamp.
//    * @param {string} symbol - Symbol name, e.g., 'BTCUSDT'
//    * @returns {Promise<Array<Object>>} Array of price records from the last minute, ordered by timestamp DESC
//    */
//   async getLastMinutePrices(symbol) {
//     return new Promise((resolve, reject) => {
//       if (!symbol || typeof symbol !== 'string') {
//         const err = new Error('Invalid symbol');
//         console.error(err.message);
//         return reject(err);
//       }

//       // Get the latest timestamp for this symbol
//       this.db.get(
//         `SELECT MAX(timestamp) as maxTimestamp FROM live_prices WHERE symbol = ?`,
//         [symbol],
//         (err, row) => {
//           if (err) {
//             console.error('Error fetching max timestamp:', err.message);
//             return reject(err);
//           }

//           if (!row || row.maxTimestamp === null) {
//             // No data for this symbol
//             return resolve([]);
//           }

//           const maxTimestamp = row.maxTimestamp;
//           const minTimestamp = maxTimestamp - 60000; // 60000 ms = 1 minute

//           // Fetch all records within the last minute
//           this.db.all(
//             `SELECT * FROM live_prices WHERE symbol = ? AND timestamp >= ? ORDER BY timestamp DESC`,
//             [symbol, minTimestamp],
//             (err, rows) => {
//               if (err) {
//                 console.error('Error fetching last minute prices:', err.message);
//                 reject(err);
//               } else {
//                 resolve(rows || []);
//               }
//             }
//           );
//         }
//       );
//     });
//   }

//   /**
//    * Close the database connection.
//    * @returns {Promise<void>}
//    */
//   close() {
//     return new Promise((resolve, reject) => {
//       this.db.close((err) => {
//         if (err) {
//           console.error('Error closing database:', err.message);
//           reject(err);
//         } else {
//           console.log('Database connection closed.');
//           resolve();
//         }
//       });
//     });
//   }
// }

// module.exports = SqliteDB;

// Example usage:
// const db = new SqliteDB('./trading_bot.db');
// db.getCandles('BTCUSDT', '1m', 'candles').then(console.log).catch(console.error).finally(() => db.close());

