const dbService = require('../db/dbInstance');
const logger = require('../utils/logger');

async function aggregateLastCandle(symbol, targetInterval) {
    const intervalMinutes = {
        3: 3,
        5: 5,
        15: 15,
        30: 30,
        60: 60,
        120: 120,
        240: 240,
        '1D': 1440,
    };

    const minutes = intervalMinutes[targetInterval];
    if (!minutes) {
        logger.error(
            `[aggregateCandles] Неизвестный таймфрейм: ${targetInterval}`
        );
        throw new Error(`Неизвестный таймфрейм: ${targetInterval}`);
    }

    logger.info(
        `[aggregateCandles] Запуск агрегации | symbol=${symbol} | targetInterval=${targetInterval} | minutes=${minutes}`
    );

    // Получаем минутные свечи с запасом, чтобы при задержке вызова
    // предыдущий период был представлен полностью
    let minuteCandles;
    try {
        minuteCandles = await dbService.getCandles(
            symbol,
            '1',
            'tracking_contracts',
            minutes * 2
        );
    } catch (err) {
        logger.error(
            `[aggregateCandles] Ошибка получения минутных свечей | symbol=${symbol} | ${err.message}`
        );
        throw err;
    }

    if (!minuteCandles || minuteCandles.length === 0) {
        logger.warn(
            `[aggregateCandles] Нет минутных свечей | symbol=${symbol} | targetInterval=${targetInterval}`
        );
        return;
    }

    logger.debug(
        `[aggregateCandles] Получено минутных свечей: ${minuteCandles.length} | symbol=${symbol}`
    );

    // Сортируем по времени на всякий случай
    minuteCandles.sort((a, b) => a.timestamp - b.timestamp);

    const firstTs = new Date(minuteCandles[0].timestamp).toISOString();
    const lastTs = new Date(
        minuteCandles[minuteCandles.length - 1].timestamp
    ).toISOString();
    logger.debug(
        `[aggregateCandles] Диапазон свечей: ${firstTs} — ${lastTs} | symbol=${symbol}`
    );

    // Группируем свечи по временным блокам
    const groups = new Map();

    for (const candle of minuteCandles) {
        const periodStart =
            Math.floor(candle.timestamp / (minutes * 60 * 1000)) *
            (minutes * 60 * 1000);

        if (!groups.has(periodStart)) {
            groups.set(periodStart, []);
        }
        groups.get(periodStart).push(candle);
    }

    logger.debug(
        `[aggregateCandles] Сформировано групп: ${groups.size} | symbol=${symbol} | targetInterval=${targetInterval}`
    );

    // Граница текущего (незавершённого) периода — всё начиная с неё пропускаем
    const now = Date.now();
    const currentPeriodStart =
        Math.floor(now / (minutes * 60 * 1000)) * (minutes * 60 * 1000);

    // Агрегируем только завершённые периоды
    const aggregated = [];

    for (const [periodStart, candles] of groups) {
        if (periodStart >= currentPeriodStart) {
            logger.debug(
                `[aggregateCandles] Пропуск текущего периода | period=${new Date(periodStart).toISOString()} | candles=${candles.length} | symbol=${symbol}`
            );
            continue;
        }

        const open = candles[0].open;
        const close = candles[candles.length - 1].close;
        const high = candles.reduce((m, c) => Math.max(m, c.high), -Infinity);
        const low = candles.reduce((m, c) => Math.min(m, c.low), Infinity);

        logger.debug(
            `[aggregateCandles] Свеча [${targetInterval}] | time=${new Date(periodStart).toISOString()} | ` +
                `O=${open} H=${high} L=${low} C=${close} | минуток в группе: ${candles.length}`
        );

        aggregated.push([
            periodStart,
            parseFloat(open),
            parseFloat(high),
            parseFloat(low),
            parseFloat(close),
        ]);
    }

    if (aggregated.length === 0) {
        logger.warn(
            `[aggregateCandles] Нет завершённых периодов для сохранения | symbol=${symbol} | targetInterval=${targetInterval}`
        );
        return;
    }

    // Сохраняем агрегированные свечи
    try {
        await dbService.saveCandles(symbol, targetInterval, aggregated);
        logger.info(
            `[aggregateCandles] Успешно сохранено ${aggregated.length} свечей | symbol=${symbol} | targetInterval=${targetInterval}`
        );
    } catch (err) {
        logger.error(
            `[aggregateCandles] Ошибка сохранения свечей | symbol=${symbol} | targetInterval=${targetInterval} | ${err.message}`
        );
        throw err;
    }
}
module.exports = {
    aggregateLastCandle,
};

/**
 * Агрегирует последние N минутных свечей в одну свечу нужного таймфрейма
 */
// async function aggregateLastCandle(symbol, targetInterval) {
//     try {
//         const minutesMap = { 5: 5, 15: 15, 30: 30, 60: 60, 240: 240 };
//         const minutes = minutesMap[targetInterval];

//         if (!minutes) {
//             throw new Error(`Неподдерживаемый интервал: ${targetInterval}`);
//         }

//         logger.debug(
//             `Агрегация последней свечи ${symbol} → ${targetInterval}min`
//         );

//         // Получаем ровно нужное количество минутных свечей
//         const minuteCandles = await dbService.getCandles(
//             symbol,
//             '1', // минутный таймфрейм
//             'tracking_contracts',
//             minutes // небольшой запас на всякий случай
//         );

//         if (!minuteCandles || minuteCandles.length < minutes) {
//             logger.warn(
//                 `Недостаточно минутных свечей для ${symbol} (${minuteCandles?.length || 0}/${minutes})`
//             );
//             return false;
//         }

//         // Берём последние N свечей
//         const relevantCandles = minuteCandles.slice(-minutes);

//         // Формируем агрегированную свечу
//         const open = relevantCandles[0].open;
//         let high = relevantCandles[0].high;
//         let low = relevantCandles[0].low;
//         const close = relevantCandles[relevantCandles.length - 1].close;

//         for (const c of relevantCandles) {
//             high = Math.max(high, c.high);
//             low = Math.min(low, c.low);
//         }

//         // Время свечи = время первой свечи в группе
//         const candleTime = relevantCandles[0].timestamp;

//         const aggregated = [
//             [
//                 candleTime,
//                 parseFloat(open),
//                 parseFloat(high),
//                 parseFloat(low),
//                 parseFloat(close),
//             ],
//         ];

//         await dbService.saveCandles(symbol, targetInterval, aggregated);

//         logger.info(`✓ ${targetInterval}min | 1 свеча обновлена | ${symbol}`);
//         return true;
//     } catch (error) {
//         logger.error(`Ошибка агрегации ${symbol} → ${targetInterval}min`, {
//             error: error.message,
//         });
//         return false;
//     }
// }
