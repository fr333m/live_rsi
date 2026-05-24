const dbService = require('../db/dbInstance');
const priceCache = require('../ws/priceCache'); // пока не используется
const logger = require('../utils/logger');

/**
 * Формирует минутную OHLC-свечу из данных priceCache
 * @param {string} symbol
 * @param {string} interval - приходит как '1', '5', '15' и т.д.
 * @param {number} currentTimestamp
 *
 *
 */

async function updateOHLC(symbol, interval) {
    try {
        if (
            !interval ||
            !Number.isInteger(Number(interval)) ||
            Number(interval) <= 0
        ) {
            logger.warn(
                `[OHLC] Некорректный интервал "${interval}" для ${symbol}`
            );
            return false;
        }

        const intervalMs = Number(interval) * 60 * 1000;

        logger.debug(`[OHLC] Starting update for ${symbol} (${interval}m)`);

        const ohlcData = priceCache.getBySymbol(symbol);

        if (!ohlcData || !Array.isArray(ohlcData) || ohlcData.length === 0) {
            logger.debug(`[OHLC] Нет данных в кэше для ${symbol}`);
            return false;
        }

        const validData = ohlcData
            .filter(
                (item) =>
                    item &&
                    typeof item.lastPrice === 'number' &&
                    Number.isFinite(item.lastPrice) &&
                    typeof item.timestamp === 'number'
            )
            .sort((a, b) => a.timestamp - b.timestamp);

        if (validData.length === 0) {
            logger.warn(`[OHLC] Нет валидных цен для ${symbol}`);
            return false;
        }

        // Определяем границы завершённой минуты по системному времени,
        // а не по первому тику в кэше — иначе stale-данные сдвигают период
        const currentPeriodStart =
            Math.floor(Date.now() / intervalMs) * intervalMs;
        const candleTimestamp = currentPeriodStart - intervalMs;
        const candleEnd = currentPeriodStart;

        // Берём только тики завершённой минуты
        const currentCandleData = validData.filter(
            (item) =>
                item.timestamp >= candleTimestamp && item.timestamp < candleEnd
        );

        if (currentCandleData.length === 0) {
            logger.warn(
                `[OHLC] Нет тиков для текущей свечи | symbol=${symbol} | interval=${interval}`
            );
            return false;
        }

        const open = currentCandleData[0].lastPrice;
        const close = currentCandleData[currentCandleData.length - 1].lastPrice;

        let high = -Infinity;
        let low = Infinity;
        for (const item of currentCandleData) {
            if (item.lastPrice > high) high = item.lastPrice;
            if (item.lastPrice < low) low = item.lastPrice;
        }

        const ohlcArr = [[candleTimestamp, open, high, low, close]];

        await dbService.saveCandles(symbol, interval, ohlcArr);

        logger.info(
            `[OHLC] ✅ ${symbol} (${interval}m) | ` +
                `O:${open.toFixed(8)} H:${high.toFixed(8)} L:${low.toFixed(8)} C:${close.toFixed(8)} | ` +
                `${currentCandleData.length} ticks | Candle TS: ${new Date(candleTimestamp).toISOString()}`
        );

        // Удаляем тики только завершённой минуты — тики следующей остаются
        priceCache.clearBefore(symbol, candleEnd);

        return true;
    } catch (error) {
        logger.error(
            `[OHLC] ❌ Error in updateOHLC(${symbol}, ${interval}):`,
            error
        );
        return false;
    }
}

module.exports = { updateOHLC };
// async function updateOHLC(symbol, interval) {
//     try {
//         if (!interval || isNaN(Number(interval))) {
//             logger.warn(
//                 `updateOHLC: некорректный интервал "${interval}" для ${symbol}`
//             );
//             return false;
//         }

//         const intervalMs = Number(interval) * 60 * 1000;
//         const candleTimestamp =
//             Math.floor(Date.now() / intervalMs) * intervalMs;

//         logger.debug(`[OHLC] Starting update for ${symbol} (${interval}m)`);

//         let ohlcData = priceCache.getBySymbol(symbol);

//         if (!ohlcData || !Array.isArray(ohlcData) || ohlcData.length === 0) {
//             logger.debug(`[OHLC] Нет данных в кэше для ${symbol}`);
//             return false;
//         }

//         const validData = ohlcData
//             .filter(
//                 (item) =>
//                     item &&
//                     typeof item.lastPrice === 'number' &&
//                     Number.isFinite(item.lastPrice) &&
//                     typeof item.timestamp === 'number'
//             )
//             // Сортировка всё равно желательна на всякий случай
//             .sort((a, b) => a.timestamp - b.timestamp);

//         if (validData.length === 0) {
//             logger.warn(`[OHLC] Нет валидных цен для ${symbol}`);
//             return false;
//         }

//         const open = validData[0].lastPrice;
//         const close = validData[validData.length - 1].lastPrice;

//         let high = open;
//         let low = open;

//         for (let i = 1; i < validData.length; i++) {
//             const price = validData[i].lastPrice;
//             if (price > high) high = price;
//             if (price < low) low = price;
//         }

//         const ohlcArr = [[candleTimestamp, open, high, low, close]];

//         await dbService.saveCandles(symbol, interval, ohlcArr);

//         logger.info(
//             `[OHLC] ✅ ${symbol} (${interval}m) | ` +
//                 `O:${open.toFixed(8)} H:${high.toFixed(8)} L:${low.toFixed(8)} C:${close.toFixed(8)} | ` +
//                 `${validData.length} ticks`
//         );

//         // Важно: очищаем кэш после успешного сохранения свечи
//         priceCache.clearBySymbol(symbol); // или priceCache.reset(symbol)

//         return true;
//     } catch (error) {
//         logger.error(
//             `[OHLC] ❌ Error in updateOHLC(${symbol}, ${interval}):`,
//             error
//         );
//         return false;
//     }
// }

// /**
//  * Обновляет минутную OHLC-свечу на основе тиковых данных
//  * @param {string} symbol - Тикер
//  * @param {string} interval - Сейчас поддерживается только '1m'
//  * @param {number} currentTimestamp - Текущее время (ms)
//  * @returns {Promise<boolean>}
//  */
// async function updateOHLC(symbol, interval) {
//     try {
//         const ohlcData = priceCache.getBySymbol(symbol);
//         logger.info(
//             `[OHLC] ✅ ${ohlcData.length} тиков для ${symbol} получены из кэша`
//         );

//         if (!ohlcData || ohlcData.length === 0) {
//             logger.debug(`[OHLC] Нет данных за последнюю минуту: ${symbol}`);
//             return false;
//         }

//         const validData = ohlcData.filter(
//             (item) =>
//                 typeof item.lastprice === 'number' &&
//                 Number.isFinite(item.lastprice) &&
//                 typeof item.timestamp === 'number'
//         );

//         if (validData.length === 0) {
//             logger.warn(`[OHLC] Нет валидных цен для ${symbol}`);
//             return false;
//         }

//         const open = validData[0].lastprice;
//         const close = validData[validData.length - 1].lastprice;

//         let high = open;
//         let low = open;

//         for (let i = 1; i < validData.length; i++) {
//             const p = validData[i].lastprice;
//             if (p > high) high = p;
//             if (p < low) low = p;
//         }

//         const candleTimestamp = validData[validData.length - 1].timestamp;

//         await dbService.saveCandles(symbol, interval, [
//             [candleTimestamp, open, high, low, close],
//         ]);

//         logger.info(
//             `[OHLC] ✅ ${symbol} | O:${open.toFixed(8)} H:${high.toFixed(8)} L:${low.toFixed(8)} C:${close.toFixed(8)} | ${validData.length} ticks`
//         );

//         return true;
//     } catch (error) {
//         logger.error(
//             `[OHLC] ❌ updateOHLC(${symbol}, ${interval}) failed:`,
//             error.message
//         );
//         return false;
//     }
// }

// async function updateOHLC(symbol, interval, currentTimestamp) {
//     try {
//         const ohlcData = await dbService.getLastMinutePrices(
//             symbol,
//             currentTimestamp
//         );

//         if (!ohlcData || ohlcData.length === 0) {
//             console.log(`⚠️ Нет ценовых данных для ${symbol} (${interval})`);
//             return false;
//         }

//         // Фильтруем и валидируем данные
//         const validData = ohlcData.filter(
//             (item) =>
//                 item &&
//                 typeof item.lastprice === 'number' &&
//                 item.timestamp != null
//         );

//         if (validData.length === 0) {
//             console.log(`⚠️ Нет валидных данных для ${symbol}`);
//             return false;
//         }

//         // Сортируем по времени на всякий случай
//         validData.sort((a, b) => a.timestamp - b.timestamp);

//         const open = validData[0].lastprice;
//         const close = validData[validData.length - 1].lastprice;

//         // Более безопасный и быстрый расчёт high/low
//         let high = -Infinity;
//         let low = Infinity;

//         for (const item of validData) {
//             const price = item.lastprice;
//             if (price > high) high = price;
//             if (price < low) low = price;
//         }

//         const timestamp = validData[validData.length - 1].timestamp;

//         const ohlcArr = [[timestamp, open, high, low, close]];

//         await dbService.saveCandles(symbol, interval, ohlcArr);

//         // Опционально: обновляем кэш цены
//         // priceCache.update(symbol, close);

//         return true;
//     } catch (error) {
//         console.error(
//             `❌ Ошибка в updateOHLC(${symbol}, ${interval}):`,
//             error.message
//         );
//         return false;
//     }
// }
