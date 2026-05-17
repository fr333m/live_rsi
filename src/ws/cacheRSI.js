'use strict';

/**
 * RsiCache — in-memory кэш результатов расчёта RSI.
 *
 * Хранит последнее значение RSI для каждой пары symbol+interval.
 *
 * Использование:
 *   const rsiCache = require('./rsiCache');
 *
 *   rsiCache.set('BTCUSDT', '1', 72.45);
 *   const rsi = rsiCache.get('BTCUSDT', '1');
 *   rsiCache.clear('BTCUSDT', '1');
 */
class RsiCache {
    constructor() {
        /**
         * Map<string, RsiRecord>
         * Ключ: `${symbol}_${interval}` → объект с RSI и метаданными
         */
        this.cache = new Map();
    }

    // ---------------------------------------------------------------------------
    // _key
    // ---------------------------------------------------------------------------
    _key(symbol, interval) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');
        if (!interval || typeof interval !== 'string')
            throw new Error('Invalid interval');
        return `${symbol}_${interval}`;
    }

    // ---------------------------------------------------------------------------
    // set
    // ---------------------------------------------------------------------------
    /**
     * Сохранить результат расчёта RSI для symbol+interval.
     *
     * @param {string} symbol   - Например 'BTCUSDT'
     * @param {string} interval - Например '1', '15', '60'
     * @param {number} rsi      - Значение RSI (0–100)
     *
     * @example
     * rsiCache.set('BTCUSDT', '1', 72.45);
     */
    set(symbol, interval, rsi) {
        const value = parseFloat(rsi);
        if (isNaN(value) || value < 0 || value > 100) {
            throw new Error(
                `Invalid RSI value: ${rsi}. Must be a number between 0 and 100`
            );
        }

        const key = this._key(symbol, interval);
        const prev = this.cache.get(key);

        this.cache.set(key, {
            symbol,
            interval,
            rsi: value,
            prevRsi: prev?.rsi ?? null, // предыдущее значение для отслеживания динамики
            updatedAt: Date.now(),
        });

        console.log(
            `[RsiCache] set: ${symbol} ${interval} → RSI ${value}${prev ? ` (prev: ${prev.rsi})` : ''}`
        );
    }

    // ---------------------------------------------------------------------------
    // get
    // ---------------------------------------------------------------------------
    /**
     * Получить последний RSI для symbol+interval.
     *
     * @param {string} symbol
     * @param {string} interval
     * @returns {{ symbol, interval, rsi, prevRsi, updatedAt }|null}
     *
     * @example
     * const record = rsiCache.get('BTCUSDT', '1');
     * console.log(record.rsi); // 72.45
     */
    get(symbol, interval) {
        const key = this._key(symbol, interval);
        return this.cache.get(key) ?? null;
    }

    // ---------------------------------------------------------------------------
    // getValue
    // ---------------------------------------------------------------------------
    /**
     * Получить только числовое значение RSI (без метаданных).
     *
     * @param {string} symbol
     * @param {string} interval
     * @returns {number|null}
     *
     * @example
     * const rsi = rsiCache.getValue('BTCUSDT', '1'); // 72.45
     */
    getValue(symbol, interval) {
        return this.cache.get(this._key(symbol, interval))?.rsi ?? null;
    }

    // ---------------------------------------------------------------------------
    // getAll
    // ---------------------------------------------------------------------------
    /**
     * Получить все записи из кэша.
     *
     * @returns {{ symbol, interval, rsi, prevRsi, updatedAt }[]}
     *
     * @example
     * rsiCache.getAll();
     * // [
     * //   { symbol: 'BTCUSDT', interval: '1', rsi: 72.45, prevRsi: 68.1, updatedAt: ... },
     * //   { symbol: 'ETHUSDT', interval: '1', rsi: 55.3,  prevRsi: 60.2, updatedAt: ... },
     * // ]
     */
    getAll() {
        return [...this.cache.values()];
    }

    // ---------------------------------------------------------------------------
    // getByInterval
    // ---------------------------------------------------------------------------
    /**
     * Получить все RSI для заданного interval (все символы).
     *
     * @param {string} interval
     * @returns {{ symbol, interval, rsi, prevRsi, updatedAt }[]}
     *
     * @example
     * rsiCache.getByInterval('1');
     * // [{ symbol: 'BTCUSDT', rsi: 72.45 }, { symbol: 'ETHUSDT', rsi: 55.3 }, ...]
     */
    getByInterval(interval) {
        if (!interval || typeof interval !== 'string')
            throw new Error('Invalid interval');
        const result = [];
        for (const record of this.cache.values()) {
            if (record.interval === interval) result.push(record);
        }
        return result;
    }

    // ---------------------------------------------------------------------------
    // getOverbought
    // ---------------------------------------------------------------------------
    /**
     * Получить все символы где RSI >= threshold (зона перекупленности).
     *
     * @param {string} interval
     * @param {number} threshold - Порог (по умолчанию 70)
     * @returns {{ symbol, interval, rsi, prevRsi, updatedAt }[]}
     *
     * @example
     * rsiCache.getOverbought('1');      // RSI >= 70
     * rsiCache.getOverbought('1', 80);  // RSI >= 80
     */
    getOverbought(interval, threshold = 70) {
        return this.getByInterval(interval).filter((r) => r.rsi >= threshold);
    }

    // ---------------------------------------------------------------------------
    // getOversold
    // ---------------------------------------------------------------------------
    /**
     * Получить все символы где RSI <= threshold (зона перепроданности).
     *
     * @param {string} interval
     * @param {number} threshold - Порог (по умолчанию 30)
     * @returns {{ symbol, interval, rsi, prevRsi, updatedAt }[]}
     *
     * @example
     * rsiCache.getOversold('1');      // RSI <= 30
     * rsiCache.getOversold('1', 20);  // RSI <= 20
     */
    getOversold(interval, threshold = 30) {
        return this.getByInterval(interval).filter((r) => r.rsi <= threshold);
    }

    // ---------------------------------------------------------------------------
    // has
    // ---------------------------------------------------------------------------
    /**
     * Проверить наличие RSI для symbol+interval.
     *
     * @param {string} symbol
     * @param {string} interval
     * @returns {boolean}
     */
    has(symbol, interval) {
        return this.cache.has(this._key(symbol, interval));
    }

    // ---------------------------------------------------------------------------
    // clear
    // ---------------------------------------------------------------------------
    /**
     * Удалить RSI для конкретного symbol+interval.
     *
     * @param {string} symbol
     * @param {string} interval
     */
    clear(symbol, interval) {
        const key = this._key(symbol, interval);
        this.cache.delete(key);
        console.log(`[RsiCache] clear: ${symbol} ${interval}`);
    }

    // ---------------------------------------------------------------------------
    // clearByInterval
    // ---------------------------------------------------------------------------
    /**
     * Удалить все RSI для заданного interval (все символы).
     *
     * @param {string} interval
     * @returns {number} Количество удалённых записей
     */
    clearByInterval(interval) {
        if (!interval || typeof interval !== 'string')
            throw new Error('Invalid interval');

        let deleted = 0;
        for (const [key, record] of this.cache.entries()) {
            if (record.interval === interval) {
                this.cache.delete(key);
                deleted++;
            }
        }

        if (deleted > 0) {
            console.log(
                `[RsiCache] clearByInterval: удалено ${deleted} записей для interval="${interval}"`
            );
        } else {
            console.warn(
                `[RsiCache] clearByInterval: нет данных для interval="${interval}"`
            );
        }

        return deleted;
    }

    // ---------------------------------------------------------------------------
    // clearBySymbol
    // ---------------------------------------------------------------------------
    /**
     * Удалить все RSI для заданного symbol (все интервалы).
     *
     * @param {string} symbol
     * @returns {number} Количество удалённых записей
     */
    clearBySymbol(symbol) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');

        let deleted = 0;
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${symbol}_`)) {
                this.cache.delete(key);
                deleted++;
            }
        }

        if (deleted > 0) {
            console.log(
                `[RsiCache] clearBySymbol: удалено ${deleted} записей для ${symbol}`
            );
        } else {
            console.warn(`[RsiCache] clearBySymbol: нет данных для ${symbol}`);
        }

        return deleted;
    }

    // ---------------------------------------------------------------------------
    // clearAll
    // ---------------------------------------------------------------------------
    /**
     * Полностью очистить весь кэш.
     */
    clearAll() {
        this.cache.clear();
        console.log('[RsiCache] clearAll: кэш очищен');
    }

    // ---------------------------------------------------------------------------
    // stats
    // ---------------------------------------------------------------------------
    /**
     * Статистика по кэшу — количество записей и диапазон RSI по интервалам.
     * @returns {Object}
     */
    stats() {
        const byInterval = {};

        for (const record of this.cache.values()) {
            if (!byInterval[record.interval]) {
                byInterval[record.interval] = { count: 0, min: 100, max: 0 };
            }
            const entry = byInterval[record.interval];
            entry.count++;
            if (record.rsi < entry.min) entry.min = record.rsi;
            if (record.rsi > entry.max) entry.max = record.rsi;
        }

        return {
            totalSymbols: this.cache.size,
            byInterval,
        };
    }
}

// Синглтон
const instance = new RsiCache();
module.exports = instance;

// =============================================================================
// ПРИМЕР ИСПОЛЬЗОВАНИЯ
// =============================================================================
//
// const rsiCache = require('./src/cache/rsiCache');
//
// === После расчёта RSI ===
//
// const rsi = calculateRSI(candles); // твоя функция
// rsiCache.set('BTCUSDT', '1', rsi);
//
//
// === Получить значение ===
//
// const value = rsiCache.getValue('BTCUSDT', '1'); // 72.45
// const record = rsiCache.get('BTCUSDT', '1');
// // { symbol: 'BTCUSDT', interval: '1', rsi: 72.45, prevRsi: 68.1, updatedAt: 1778944020000 }
//
//
// === Все RSI для интервала ===
//
// const all = rsiCache.getByInterval('1');
// // [{ symbol: 'BTCUSDT', rsi: 72.45 }, { symbol: 'ETHUSDT', rsi: 55.3 }, ...]
//
//
// === Перекупленность / перепроданность ===
//
// const overbought = rsiCache.getOverbought('1');     // RSI >= 70
// const oversold   = rsiCache.getOversold('1');       // RSI <= 30
// const extremeOB  = rsiCache.getOverbought('1', 80); // RSI >= 80
//
//
// === Статистика ===
//
// console.log(rsiCache.stats());
// // {
// //   totalSymbols: 35,
// //   byInterval: {
// //     '1':  { count: 35, min: 22.3, max: 78.9 },
// //     '15': { count: 35, min: 30.1, max: 65.4 },
// //   }
// // }
