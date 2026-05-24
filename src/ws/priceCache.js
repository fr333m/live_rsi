'use strict';

/**
 * PriceCache — in-memory буфер для live-цен с Bybit WebSocket.
 * Хранит историю тиков за текущую минуту для каждого символа.
 * Раз в минуту — flush() сбрасывает всё в БД и очищает историю.
 */
class PriceCache {
    constructor() {
        /** @type {Map<string, PriceRecord[]>} symbol → массив тиков за текущую минуту */
        this.ticks = new Map();
    }

    // ---------------------------------------------------------------------------
    // update
    // ---------------------------------------------------------------------------
    /**
     * Добавить тик в историю символа.
     * @param {string} symbol
     * @param {Object} data
     */
    update(symbol, data) {
        if (!symbol || typeof symbol !== 'string') return;

        if (!this.ticks.has(symbol)) {
            this.ticks.set(symbol, []);
        }

        this.ticks.get(symbol).push({
            symbol,
            lastPrice:
                data.lastPrice != null ? parseFloat(data.lastPrice) : null,
            markPrice:
                data.markPrice != null ? parseFloat(data.markPrice) : null,
            indexPrice:
                data.indexPrice != null ? parseFloat(data.indexPrice) : null,
            timestamp: data.timestamp ?? Date.now(),
        });
    }

    // ---------------------------------------------------------------------------
    // flush
    // ---------------------------------------------------------------------------
    /**
     * Вернуть все тики и очистить историю.
     * Вызывать раз в минуту → результат передавать в db.saveLivePrice().
     * @returns {PriceRecord[]}
     */
    flush() {
        const result = [];
        for (const ticks of this.ticks.values()) {
            result.push(...ticks);
        }
        this.ticks.clear();
        return result;
    }

    // ---------------------------------------------------------------------------
    // getLast
    // ---------------------------------------------------------------------------
    /**
     * Получить последний тик для символа (без flush).
     * @param {string} symbol
     * @returns {PriceRecord|null}
     */
    getLast(symbol) {
        const ticks = this.ticks.get(symbol);
        return ticks?.at(-1) ?? null;
    }

    // ---------------------------------------------------------------------------
    // getBySymbol
    // ---------------------------------------------------------------------------
    /**
     * Получить все тики для конкретного символа.
     * @param {string} symbol
     * @returns {PriceRecord[]}
     *
     * @example
     * priceCache.getBySymbol('BTCUSDT');
     * // [{ symbol: 'BTCUSDT', lastPrice: 67432.5, ... }, ...]
     */
    getBySymbol(symbol) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');
        return [...(this.ticks.get(symbol) ?? [])];
    }

    // ---------------------------------------------------------------------------
    // getAll
    // ---------------------------------------------------------------------------
    /**
     * Получить все тики из кэша (все символы, все тики).
     * @returns {PriceRecord[]}
     *
     * @example
     * priceCache.getAll();
     * // [{ symbol: 'BTCUSDT', lastPrice: 67432.5, ... }, { symbol: 'ETHUSDT', ... }, ...]
     */
    getAll() {
        const result = [];
        for (const ticks of this.ticks.values()) {
            result.push(...ticks);
        }
        return result;
    }

    // ---------------------------------------------------------------------------
    // getAllSymbols
    // ---------------------------------------------------------------------------
    /**
     * Получить список всех символов в кэше.
     * @returns {string[]}
     *
     * @example
     * priceCache.getAllSymbols();
     * // ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', ...]
     */
    getAllSymbols() {
        return [...this.ticks.keys()];
    }

    // ---------------------------------------------------------------------------
    // has
    // ---------------------------------------------------------------------------
    /**
     * Проверить наличие символа в кэше.
     * @param {string} symbol
     * @returns {boolean}
     */
    has(symbol) {
        return (
            this.ticks.has(symbol) && (this.ticks.get(symbol)?.length ?? 0) > 0
        );
    }

    // ---------------------------------------------------------------------------
    // count
    // ---------------------------------------------------------------------------
    /**
     * Сколько тиков накоплено для символа.
     * @param {string} symbol
     * @returns {number}
     */
    count(symbol) {
        return this.ticks.get(symbol)?.length ?? 0;
    }

    // ---------------------------------------------------------------------------
    // clear
    // ---------------------------------------------------------------------------
    /**
     * Удалить все тики для конкретного символа.
     * @param {string} symbol
     */
    clear(symbol) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');
        this.ticks.delete(symbol);
        console.log(`[PriceCache] clear: ${symbol}`);
    }

    // ---------------------------------------------------------------------------
    // clearBySymbol
    // ---------------------------------------------------------------------------
    /**
     * Алиас для clear() — удалить все тики для символа.
     * @param {string} symbol
     */
    clearBySymbol(symbol) {
        this.clear(symbol);
    }

    // ---------------------------------------------------------------------------
    // clearBefore
    // ---------------------------------------------------------------------------
    /**
     * Удалить тики символа с timestamp < beforeTs, сохранив более новые.
     * Используется после сохранения свечи — тики следующей минуты остаются.
     * @param {string} symbol
     * @param {number} beforeTs - граница (не включается)
     */
    clearBefore(symbol, beforeTs) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');

        const ticks = this.ticks.get(symbol);
        if (!ticks) return;

        const remaining = ticks.filter((t) => t.timestamp >= beforeTs);
        if (remaining.length === 0) {
            this.ticks.delete(symbol);
        } else {
            this.ticks.set(symbol, remaining);
        }
    }

    // ---------------------------------------------------------------------------
    // clearAll
    // ---------------------------------------------------------------------------
    /**
     * Полностью очистить весь кэш (все символы).
     */
    clearAll() {
        this.ticks.clear();
        console.log('[PriceCache] clearAll: кэш очищен');
    }

    // ---------------------------------------------------------------------------
    // stats
    // ---------------------------------------------------------------------------
    /**
     * Статистика — сколько тиков накоплено по каждому символу.
     * @returns {Object}
     *
     * @example
     * priceCache.stats();
     * // { BTCUSDT: 42, ETHUSDT: 38, BNBUSDT: 45, totalTicks: 125 }
     */
    stats() {
        const info = {};
        let totalTicks = 0;
        for (const [symbol, ticks] of this.ticks.entries()) {
            info[symbol] = ticks.length;
            totalTicks += ticks.length;
        }
        return { ...info, totalTicks };
    }
}

// Синглтон — один кэш на весь процесс Node.js
const instance = new PriceCache();
module.exports = instance;

// =============================================================================
// ПРИМЕР ИСПОЛЬЗОВАНИЯ
// =============================================================================
//
// const priceCache = require('./src/cache/priceCache');
//
// === WebSocket-обработчик ===
//
// priceCache.update('BTCUSDT', { lastPrice: 67432.5, markPrice: 67430.1, indexPrice: 67428.9 });
//
//
// === Flush раз в минуту → в БД ===
//
// setInterval(async () => {
//   const records = priceCache.flush();
//   if (!records.length) return;
//   await db.saveLivePrice(records);
//   console.log(`[PriceCache] Сохранено ${records.length} тиков`);
// }, 60_000);
//
//
// === Получить последний тик ===
//
// priceCache.getLast('BTCUSDT');
// // { symbol: 'BTCUSDT', lastPrice: 67432.5, markPrice: 67430.1, ... }
//
//
// === Получить все тики для символа ===
//
// priceCache.getBySymbol('BTCUSDT');
// // [{ symbol: 'BTCUSDT', lastPrice: 67100, ... }, { lastPrice: 67200, ... }, ...]
//
//
// === Все тики из кэша ===
//
// priceCache.getAll();
// // [{ symbol: 'BTCUSDT', ... }, { symbol: 'ETHUSDT', ... }, ...]
//
//
// === Список всех символов ===
//
// priceCache.getAllSymbols();
// // ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', ...]
//
//
// === Проверка и статистика ===
//
// priceCache.has('BTCUSDT');   // true/false
// priceCache.count('BTCUSDT'); // 42
// priceCache.stats();          // { BTCUSDT: 42, ETHUSDT: 38, totalTicks: 80 }
//
//
// === Удаление ===
//
// priceCache.clear('BTCUSDT');    // удалить один символ
// priceCache.clearBySymbol('BTCUSDT'); // то же самое
// priceCache.clearAll();          // очистить весь кэш

// "use strict";

// /**
//  * PriceCache — in-memory буфер для live-цен с Bybit WebSocket.
//  *
//  * Вместо INSERT в БД на каждый тик:
//  *   1. WebSocket → priceCache.update()       (только память, ~0ms)
//  *   2. setInterval раз в N секунд → flush()  (один batch INSERT в БД)
//  *
//  * Использование:
//  *   const priceCache = require('./priceCache');
//  *
//  *   // В WebSocket-обработчике:
//  *   priceCache.update(symbol, { lastPrice, markPrice, indexPrice, timestamp });
//  *
//  *   // В интервале сброса в БД:
//  *   const records = priceCache.flush();
//  *   if (records.length) await db.saveLivePrice(records);
//  */
// "use strict";

// class PriceCache {
//   constructor() {
//     /** @type {Map<string, PriceRecord[]>} symbol → массив тиков за текущую минуту */
//     this.ticks = new Map();
//   }

//   // Добавить тик в историю символа
//   update(symbol, data) {
//     if (!symbol || typeof symbol !== "string") return;

//     if (!this.ticks.has(symbol)) {
//       this.ticks.set(symbol, []);
//     }

//     this.ticks.get(symbol).push({
//       symbol,
//       lastPrice: data.lastPrice != null ? parseFloat(data.lastPrice) : null,
//       markPrice: data.markPrice != null ? parseFloat(data.markPrice) : null,
//       indexPrice: data.indexPrice != null ? parseFloat(data.indexPrice) : null,
//       timestamp: data.timestamp ?? Date.now(),
//     });
//   }

//   // Вернуть все тики и очистить историю
//   flush() {
//     const result = [];

//     for (const [symbol, ticks] of this.ticks.entries()) {
//       result.push(...ticks);
//     }

//     this.ticks.clear(); // ← стираем после flush
//     return result;
//   }

//   // Получить последний тик для символа (без flush)
//   getLast(symbol) {
//     const ticks = this.ticks.get(symbol);
//     return ticks?.at(-1) ?? null;
//   }

//   // Сколько тиков накоплено для символа
//   count(symbol) {
//     return this.ticks.get(symbol)?.length ?? 0;
//   }

//   stats() {
//     const info = {};
//     for (const [symbol, ticks] of this.ticks.entries()) {
//       info[symbol] = ticks.length;
//     }
//     return info;
//   }
// }

// // Синглтон — один кэш на весь процесс Node.js
// const instance = new PriceCache();
// module.exports = instance;

// // =============================================================================
// // ПРИМЕР ИСПОЛЬЗОВАНИЯ
// // =============================================================================
// //
// // === index.js / websocket-handler ===
// //
// // const priceCache = require('./src/cache/priceCache');
// //
// // ws.on('message', (raw) => {
// //   const data = JSON.parse(raw);
// //   if (data.topic?.startsWith('tickers.')) {
// //     const { symbol, lastPrice, markPrice, indexPrice } = data.data;
// //     priceCache.update(symbol, { lastPrice, markPrice, indexPrice, timestamp: Date.now() });
// //   }
// // });
// //
// //
// // === Интервал сброса в БД (в том же index.js) ===
// //
// // const FLUSH_INTERVAL_MS = 5000; // раз в 5 секунд
// //
// // setInterval(async () => {
// //   const records = priceCache.flush();
// //   if (!records.length) return;
// //
// //   try {
// //     await db.saveLivePrice(records);
// //   } catch (err) {
// //     console.error('[PriceCache flush] DB error:', err.message);
// //     // Данные не теряются — в prices они остаются, dirty уже сброшен.
// //     // Можно добавить retry-логику при необходимости.
// //   }
// // }, FLUSH_INTERVAL_MS);
// //
// //
// // === Логирование статистики (опционально) ===
// //
// // setInterval(() => {
// //   console.log('[PriceCache stats]', priceCache.stats());
// // }, 60_000);
// //
// //
// // === Получить текущую цену без БД (например перед расчётом RSI) ===
// //
// // const price = priceCache.get('BTCUSDT');
// // console.log(price);
// // // {
// // //   symbol: 'BTCUSDT',
// // //   lastPrice: 67432.5,
// // //   markPrice: 67430.1,
// // //   indexPrice: 67428.9,
// // //   timestamp: 1715600000000
// // // }
