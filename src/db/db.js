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
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT,
            max: 35, // Снижено до 35 для стабильности
            min: 2, // Минимум свободных соединений
            idleTimeoutMillis: 60000, // Закрыть неиспользуемое через 60сек
            connectionTimeoutMillis: 10000, // Таймаут подключения 10сек
            statement_timeout: 30000, // Таймаут запроса 30 сек
        });
    }

    /**
     * Execute a query using a pooled connection with retry logic.
     * @param {string} text - SQL query
     * @param {Array} params - Query parameters
     * @param {number} retries - Number of retry attempts
     */
    async query(text, params = [], retries = 5) {
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                const client = await this.pool.connect();
                try {
                    return await client.query(text, params);
                } finally {
                    client.release();
                }
            } catch (err) {
                lastError = err;
                // Retry on connection errors
                if (
                    (err.code === 'ECONNRESET' ||
                        err.code === 'ETIMEDOUT' ||
                        err.code === '53300') &&
                    i < retries - 1
                ) {
                    const delay = Math.pow(2, i) * 150; // Экспоненциальная задержка: 150ms, 300ms, 600ms, 1200ms, 2400ms
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
                throw err;
            }
        }
        throw lastError;
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
            await this.query(
                `CREATE INDEX IF NOT EXISTS idx_tracking_symbol_interval ON tracking_contracts(symbol, interval);`
            );
            await this.query(
                `CREATE INDEX IF NOT EXISTS idx_tracking_timestamp ON tracking_contracts(timestamp);`
            );
            await this.query(
                `CREATE INDEX IF NOT EXISTS idx_tracking_symbol_ts ON tracking_contracts(symbol, timestamp);`
            );

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

            await this.query(
                `CREATE INDEX IF NOT EXISTS idx_live_symbol ON live_prices(symbol);`
            );
            await this.query(
                `CREATE INDEX IF NOT EXISTS idx_live_timestamp ON live_prices(timestamp);`
            );

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
                level_timestamp BIGINT,
                UNIQUE(symbol, timestamp, interval, type_signal, level_timestamp)
            );
        `);

            console.log(
                '✅ PostgreSQL: tables and indexes ensured successfully.'
            );
        } catch (err) {
            console.error('❌ Error during DB initialization:', err);
            throw err;
        }
    }

    // ---------------------------------------------------------------------------
    // saveSendSignalControl
    // ---------------------------------------------------------------------------
    /**
     * Сохраняет контрольную запись о отправленном сигнале
     */
    async saveSendSignalControl(
        symbol,
        timestamp,
        interval,
        typeSignal,
        levelTimeStamp
    ) {
        try {
            // Базовая валидация
            if (!symbol || !interval || !typeSignal || !levelTimeStamp) {
                throw new Error(
                    'Missing required parameters for saveSendSignalControl'
                );
            }

            const normalizedTimestamp = Number(timestamp);
            if (isNaN(normalizedTimestamp)) {
                throw new Error('Timestamp must be a valid number');
            }

            const result = await this.query(
                `
            INSERT INTO control_send_signal 
                (symbol, timestamp, interval, type_signal, level_timestamp)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING
            RETURNING id
        `,
                [
                    symbol,
                    normalizedTimestamp,
                    interval,
                    typeSignal,
                    levelTimeStamp,
                ]
            );

            if (result.rowCount > 0) {
                console.log(
                    `[Control Save] ✅ Successfully saved: ${symbol} | ${interval} | ${typeSignal}`
                );
            } else {
                console.log(
                    `[Control Save] ⚠️ Already exists (ON CONFLICT): ${symbol} | ${interval} | ${typeSignal}`
                );
            }

            return result.rowCount > 0; // возвращаем true, если была вставка
        } catch (error) {
            console.error(
                `[Control Save ERROR] Failed to save signal control:`,
                {
                    symbol,
                    interval,
                    typeSignal,
                    levelTimeStamp,
                    error: error.message,
                    stack: error.stack,
                }
            );

            // Перебрасываем ошибку дальше, чтобы вызывающая функция могла обработать
            throw new Error(
                `saveSendSignalControl failed for ${symbol} ${interval} ${typeSignal}: ${error.message}`
            );
        }
    }

    // ---------------------------------------------------------------------------
    // saveFilteredMinimum
    // ---------------------------------------------------------------------------
    async saveFilteredMinimum(symbol, interval, minima) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const min of minima) {
                await client.query(
                    `
          INSERT INTO filteredMinimum (symbol, timestamp, price, interval, datetime)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING
        `,
                    [
                        symbol,
                        min.timestamp,
                        min.closePrice,
                        interval,
                        min.dateTime,
                    ]
                );
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
        if (!candles?.length) return;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Подготовка данных для bulk insert
            const values = [];
            const placeholders = [];

            candles.forEach((candle, i) => {
                const timestamp = parseInt(candle[0]);
                const open = parseFloat(candle[1]);
                const high = parseFloat(candle[2]);
                const low = parseFloat(candle[3]);
                const close = parseFloat(candle[4]);

                const idx = i * 8;
                placeholders.push(
                    `($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, $${idx + 8})`
                );

                values.push(
                    symbol,
                    timestamp,
                    open,
                    high,
                    low,
                    close,
                    interval,
                    new Date(timestamp)
                        .toISOString()
                        .slice(0, 19)
                        .replace('T', ' ')
                );
            });

            const query = `
      INSERT INTO tracking_contracts 
        (symbol, timestamp, open, high, low, close, interval, datetime)
      VALUES ${placeholders.join(',')}
      ON CONFLICT (symbol, timestamp, interval) DO NOTHING
    `;

            await client.query(query, values);

            await client.query('COMMIT');

            // Очистка — только если действительно нужно
            await this._cleanupCandlesTable();

            console.log(
                `Saved ${candles.length} candles for ${symbol} ${interval}`
            );
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error saving candles:', err.message);
            throw err;
        } finally {
            client.release();
        }
    }

    async _cleanupCandlesTable() {
        // Вариант A — оставить последние N записей (рекомендую)
        const MAX_ROWS = 200_000;

        const res = await this.query(`
    SELECT COUNT(*) AS total FROM tracking_contracts
  `);

        const total = parseInt(res.rows[0].total);

        if (total < MAX_ROWS) return;

        // Удаляем самые старые записи, оставляем последние 400k
        await this.query(
            `
    DELETE FROM tracking_contracts
    WHERE ctid IN (
      SELECT ctid 
      FROM tracking_contracts 
      ORDER BY timestamp ASC 
      LIMIT $1
    )
  `,
            [total - 100_000]
        );

        console.log(`Cleanup done. Removed ${total - 100_000} old rows.`);
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
        if (!/^[a-zA-Z0-9_]+$/.test(table))
            throw new Error('Invalid table name');

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
        let candles = res.rows.map((row) => ({
            timestamp: parseInt(row.timestamp),
            datetime: row.datetime,
            open: parseFloat(row.open),
            high: parseFloat(row.high),
            low: parseFloat(row.low),
            close: parseFloat(row.close),
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
                await client.query(
                    `
          INSERT INTO all_contracts_tracking (symbol, interval, volatility)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `,
                    [item.symbol, item.interval, item.volatility]
                );
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
        const res = await this.query(`SELECT * FROM ${tableName} LIMIT $1 `, [
            limit,
        ]);
        console.table(res.rows);
    }

    // ---------------------------------------------------------------------------
    // uniqueSymbol
    // ---------------------------------------------------------------------------
    async uniqueSymbol(tableName, interval = null, includeInterval = false) {
        if (!/^[a-zA-Z0-9_]+$/.test(tableName))
            throw new Error('Invalid table name');

        const params = [];
        let query;

        if (includeInterval) {
            query = `SELECT DISTINCT symbol, interval FROM ${tableName}`;
            if (interval) {
                params.push(interval);
                query += ` WHERE interval = $1`;
            }
            const res = await this.query(query, params);
            return res.rows.map((r) => ({
                symbol: r.symbol,
                interval: r.interval,
            }));
        } else {
            if (interval) {
                params.push(interval);
                query = `SELECT DISTINCT symbol FROM ${tableName} WHERE interval = $1`;
            } else {
                query = `SELECT DISTINCT symbol FROM ${tableName}`;
            }
            const res = await this.query(query, params);
            return res.rows.map((r) => r.symbol);
        }
    }

    // ---------------------------------------------------------------------------
    // uniqueSymbolFromRSI
    // ---------------------------------------------------------------------------
    async uniqueSymbolFromRSI(
        tableName,
        interval = null,
        includeInterval = false
    ) {
        if (!/^[a-zA-Z0-9_]+$/.test(tableName))
            throw new Error('Invalid table name');

        const params = [];
        let query;

        if (includeInterval) {
            query = `SELECT DISTINCT symbol, interval, rsi FROM ${tableName}`;
            if (interval) {
                params.push(interval);
                query += ` WHERE interval = $1`;
            }
            const res = await this.query(query, params);
            return res.rows.map((r) => ({
                symbol: r.symbol,
                interval: r.interval,
                rsi: r.rsi,
            }));
        } else {
            if (interval) {
                params.push(interval);
                query = `SELECT DISTINCT symbol, rsi FROM ${tableName} WHERE interval = $1`;
            } else {
                query = `SELECT DISTINCT symbol, rsi FROM ${tableName}`;
            }
            const res = await this.query(query, params);
            return res.rows.map((r) => ({ symbol: r.symbol, rsi: r.rsi }));
        }
    }

    // ---------------------------------------------------------------------------
    // removeDataTable
    // ---------------------------------------------------------------------------
    async removeDataTable(tableName) {
        if (!/^[a-zA-Z0-9_]+$/.test(tableName))
            throw new Error('Invalid table name');
        await this.query(`DELETE FROM ${tableName}`);
        console.log(`Data removed from table ${tableName} successfully.`);
    }

    // ---------------------------------------------------------------------------
    // removeTable
    // ---------------------------------------------------------------------------
    async removeTable(tableName) {
        if (!/^[A-Za-z0-9_]+$/.test(tableName))
            throw new Error('Invalid table name');
        await this.query(`DROP TABLE IF EXISTS ${tableName}`);
        console.log(`Table ${tableName} dropped successfully.`);
    }

    // ---------------------------------------------------------------------------
    // removeData
    // ---------------------------------------------------------------------------
    async removeData(tableName, symbol, interval) {
        if (!/^[a-zA-Z0-9_]+$/.test(tableName))
            throw new Error('Invalid table name');
        await this.query(
            `DELETE FROM ${tableName} WHERE symbol = $1 AND interval = $2`,
            [symbol, interval]
        );
        console.log(
            `Data removed from table ${tableName} for symbol ${symbol} and interval ${interval} successfully.`
        );
    }

    // ---------------------------------------------------------------------------
    // removeRow
    // ---------------------------------------------------------------------------
    async removeRow(symbol, timestamp, tableName) {
        if (!/^[A-Za-z0-9_]+$/.test(tableName))
            throw new Error('Invalid table name');
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');
        const ts = Number(timestamp);
        if (!Number.isFinite(ts)) throw new Error('Invalid timestamp');

        const res = await this.query(
            `DELETE FROM ${tableName} WHERE symbol = $1 AND timestamp = $2`,
            [symbol, ts]
        );
        if (res.rowCount === 0) {
            console.log(
                `No rows matched in ${tableName} for symbol ${symbol} and timestamp ${ts}.`
            );
        } else {
            console.log(
                `Row removed from table ${tableName} for symbol ${symbol} and timestamp ${ts} successfully.`
            );
        }
    }

    // ---------------------------------------------------------------------------
    // removeRowOnSymbol
    // ---------------------------------------------------------------------------
    async removeRowOnSymbol(symbol, tableName, id, interval) {
        if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
            throw new Error('Invalid table name');
        }

        if (!symbol || typeof symbol !== 'string') {
            throw new Error('Invalid symbol');
        }

        if (id !== undefined && !Number.isFinite(id)) {
            throw new Error('Invalid id');
        }

        if (interval !== undefined && typeof interval !== 'string') {
            throw new Error('Invalid interval');
        }

        let query = `DELETE FROM ${tableName} WHERE symbol = $1`;
        const params = [symbol];

        // Добавляем id если указан
        if (id !== undefined) {
            params.push(id);
            query += ` AND id = $${params.length}`;
        }

        // Добавляем interval если указан
        if (interval !== undefined) {
            params.push(interval);
            query += ` AND interval = $${params.length}`;
        }

        const res = await this.query(query, params);

        const extraInfo = [
            id !== undefined ? `id ${id}` : null,
            interval !== undefined ? `interval ${interval}` : null,
        ]
            .filter(Boolean)
            .join(' and ');

        if (res.rowCount === 0) {
            console.log(
                `No rows matched in ${tableName} for symbol ${symbol}${extraInfo ? ` and ${extraInfo}` : ''}.`
            );
        } else {
            console.log(
                `${res.rowCount} row(s) removed from table ${tableName} for symbol ${symbol}${extraInfo ? ` and ${extraInfo}` : ''} successfully.`
            );
        }
    }
    async getRowsByInterval(interval, tableName) {
        if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
            throw new Error('Invalid table name');
        }

        if (!interval || typeof interval !== 'string') {
            throw new Error('Invalid interval');
        }

        const res = await this.query(
            `SELECT * FROM ${tableName} WHERE interval = $1`,
            [interval]
        );

        if (res.rowCount === 0) {
            console.log(
                `No rows matched in ${tableName} for interval ${interval}.`
            );

            return [];
        }

        console.log(
            `${res.rowCount} row(s) found in table ${tableName} for interval ${interval}.`
        );

        return res.rows;
    }

    // ---------------------------------------------------------------------------
    // removeOldestRecord
    // ---------------------------------------------------------------------------
    async removeOldestRecord(tableName, symbol, interval) {
        if (!/^[a-zA-Z0-9_]+$/.test(tableName))
            throw new Error('Invalid table name');
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');
        if (!interval || typeof interval !== 'string')
            throw new Error('Invalid interval');

        // PostgreSQL supports DELETE ... RETURNING, so we can do it in one query
        const res = await this.query(
            `
      DELETE FROM ${tableName}
      WHERE id = (
        SELECT id FROM ${tableName}
        WHERE symbol = $1 AND interval = $2
        ORDER BY timestamp ASC
        LIMIT 1
      )
      RETURNING timestamp
    `,
            [symbol, interval]
        );

        if (res.rowCount === 0) {
            console.log(
                `No records found in ${tableName} for symbol ${symbol} and interval ${interval}.`
            );
        } else {
            console.log(
                `Oldest record (timestamp: ${res.rows[0].timestamp}) removed from ${tableName} for symbol ${symbol} and interval ${interval} successfully.`
            );
        }
    }

    // ---------------------------------------------------------------------------
    // countRecords
    // ---------------------------------------------------------------------------
    async countRecords(tableName, symbol, interval) {
        if (!/^[a-zA-Z0-9_]+$/.test(tableName))
            throw new Error('Invalid table name');
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
        if (!/^[A-Za-z0-9_]+$/.test(tableName))
            throw new Error('Invalid table name');
        const res = await this.query(
            `SELECT * FROM ${tableName} WHERE symbol = $1 AND interval = $2 ORDER BY timestamp DESC LIMIT 1`,
            [symbol, interval]
        );
        return res.rows[0] || null;
    }

    // ---------------------------------------------------------------------------
    // checkRowForTypeSignal
    // ---------------------------------------------------------------------------
    async checkRowForTypeSignal(
        symbol,
        interval,
        typeSignal,
        tableName,
        levelTimeStamp
    ) {
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
            query += ` AND level_timestamp = $4`;
        }

        query += ` ORDER BY timestamp DESC LIMIT 1`;

        const res = await this.query(query, params);

        return res.rows[0] || null;
    }

    // ---------------------------------------------------------------------------
    // checkRowRSI
    // ---------------------------------------------------------------------------
    async checkRowRSI(symbol, tableName) {
        if (!/^[A-Za-z0-9_]+$/.test(tableName))
            throw new Error('Invalid table name');
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
        // Фильтрация до транзакции
        const records = (Array.isArray(data) ? data : [data]).filter((r) => {
            if (!r.symbol || !Number.isFinite(r.timestamp)) {
                console.warn('[saveLivePrice] Невалидная запись пропущена:', r);
                return false;
            }
            return true;
        });

        if (!records.length) return;

        // Bulk INSERT
        const values = [];
        const placeholders = records.map((r, i) => {
            const idx = i * 5;
            values.push(
                r.symbol,
                r.lastPrice ?? null,
                r.markPrice ?? null,
                r.indexPrice ?? null,
                r.timestamp
            );
            return `($${idx + 1},$${idx + 2},$${idx + 3},$${idx + 4},$${idx + 5})`;
        });

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `
      INSERT INTO live_prices (symbol, lastprice, markprice, indexprice, timestamp)
      VALUES ${placeholders.join(',')}
    `,
                values
            );
            await client.query('COMMIT');
            console.log(`[saveLivePrice] Сохранено ${records.length} записей`);
            await this._cleanupLivePrices();
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('[saveLivePrice] Ошибка:', err.message);
            throw err;
        } finally {
            client.release();
        }
    }

    async _cleanupLivePrices() {
        const res = await this.query(
            `SELECT COUNT(*) AS total FROM live_prices`
        );
        const total = parseInt(res.rows[0].total, 10);
        if (total < 1500_000) return;

        await this.query(
            `
    DELETE FROM live_prices
    WHERE id IN (
      SELECT id FROM live_prices
      ORDER BY timestamp ASC
      LIMIT $1
    )
  `,
            [total - 500_000]
        );

        console.log(
            `[cleanup] Удалено ${total - 500_000} старых записей, осталось 500k`
        );
    }

    // ---------------------------------------------------------------------------
    // getLivePrice
    // ---------------------------------------------------------------------------
    async getLivePrice(symbol, limit = 1) {
        const res = await this.query(
            `
      SELECT id, symbol, lastprice, markprice, indexprice, timestamp, created_at
      FROM live_prices
      WHERE symbol = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `,
            [symbol, limit]
        );
        return res.rows;
    }

    // ---------------------------------------------------------------------------
    // getLivePricesBySymbol
    // ---------------------------------------------------------------------------
    async getLivePricesBySymbol(symbol) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');
        const res = await this.query(
            `SELECT * FROM live_prices WHERE symbol = $1`,
            [symbol]
        );
        console.log(`Found ${res.rows.length} records for symbol: ${symbol}`);
        return res.rows;
    }

    // ---------------------------------------------------------------------------
    // getMinLivePrice
    // ---------------------------------------------------------------------------
    async getMinLivePrice(symbol) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');
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
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');
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
    async getLastMinutePrices(symbol, currentTimestamp) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');

        // Get max timestamp, then fetch last-minute records — single query in Postgres
        const res = await this.query(
            `
      SELECT * FROM live_prices
      WHERE symbol = $1
        AND timestamp >= (
          SELECT MAX(timestamp) - $2 FROM live_prices WHERE symbol = $1
        )
      ORDER BY timestamp ASC
    `,
            [symbol, currentTimestamp]
        );
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
