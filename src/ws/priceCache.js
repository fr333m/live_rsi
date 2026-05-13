"use strict";

/**
 * PriceCache — in-memory буфер для live-цен с Bybit WebSocket.
 *
 * Вместо INSERT в БД на каждый тик:
 *   1. WebSocket → priceCache.update()       (только память, ~0ms)
 *   2. setInterval раз в N секунд → flush()  (один batch INSERT в БД)
 *
 * Использование:
 *   const priceCache = require('./priceCache');
 *
 *   // В WebSocket-обработчике:
 *   priceCache.update(symbol, { lastPrice, markPrice, indexPrice, timestamp });
 *
 *   // В интервале сброса в БД:
 *   const records = priceCache.flush();
 *   if (records.length) await db.saveLivePrice(records);
 */
"use strict";

class PriceCache {
  constructor() {
    /** @type {Map<string, PriceRecord[]>} symbol → массив тиков за текущую минуту */
    this.ticks = new Map();
  }

  // Добавить тик в историю символа
  update(symbol, data) {
    if (!symbol || typeof symbol !== "string") return;

    if (!this.ticks.has(symbol)) {
      this.ticks.set(symbol, []);
    }

    this.ticks.get(symbol).push({
      symbol,
      lastPrice: data.lastPrice != null ? parseFloat(data.lastPrice) : null,
      markPrice: data.markPrice != null ? parseFloat(data.markPrice) : null,
      indexPrice: data.indexPrice != null ? parseFloat(data.indexPrice) : null,
      timestamp: data.timestamp ?? Date.now(),
    });
  }

  // Вернуть все тики и очистить историю
  flush() {
    const result = [];

    for (const [symbol, ticks] of this.ticks.entries()) {
      result.push(...ticks);
    }

    this.ticks.clear(); // ← стираем после flush
    return result;
  }

  // Получить последний тик для символа (без flush)
  getLast(symbol) {
    const ticks = this.ticks.get(symbol);
    return ticks?.at(-1) ?? null;
  }

  // Сколько тиков накоплено для символа
  count(symbol) {
    return this.ticks.get(symbol)?.length ?? 0;
  }

  stats() {
    const info = {};
    for (const [symbol, ticks] of this.ticks.entries()) {
      info[symbol] = ticks.length;
    }
    return info;
  }
}

// Синглтон — один кэш на весь процесс Node.js
const instance = new PriceCache();
module.exports = instance;

// =============================================================================
// ПРИМЕР ИСПОЛЬЗОВАНИЯ
// =============================================================================
//
// === index.js / websocket-handler ===
//
// const priceCache = require('./src/cache/priceCache');
//
// ws.on('message', (raw) => {
//   const data = JSON.parse(raw);
//   if (data.topic?.startsWith('tickers.')) {
//     const { symbol, lastPrice, markPrice, indexPrice } = data.data;
//     priceCache.update(symbol, { lastPrice, markPrice, indexPrice, timestamp: Date.now() });
//   }
// });
//
//
// === Интервал сброса в БД (в том же index.js) ===
//
// const FLUSH_INTERVAL_MS = 5000; // раз в 5 секунд
//
// setInterval(async () => {
//   const records = priceCache.flush();
//   if (!records.length) return;
//
//   try {
//     await db.saveLivePrice(records);
//   } catch (err) {
//     console.error('[PriceCache flush] DB error:', err.message);
//     // Данные не теряются — в prices они остаются, dirty уже сброшен.
//     // Можно добавить retry-логику при необходимости.
//   }
// }, FLUSH_INTERVAL_MS);
//
//
// === Логирование статистики (опционально) ===
//
// setInterval(() => {
//   console.log('[PriceCache stats]', priceCache.stats());
// }, 60_000);
//
//
// === Получить текущую цену без БД (например перед расчётом RSI) ===
//
// const price = priceCache.get('BTCUSDT');
// console.log(price);
// // {
// //   symbol: 'BTCUSDT',
// //   lastPrice: 67432.5,
// //   markPrice: 67430.1,
// //   indexPrice: 67428.9,
// //   timestamp: 1715600000000
// // }
