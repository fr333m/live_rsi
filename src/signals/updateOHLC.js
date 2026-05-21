const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const logger = require('../utils/logger');

async function aggregateLastCandle(symbol, targetInterval) {
    try {
        logger.info(
            `[AGGREGATE] 🚀 Начало агрегации ${symbol} ${targetInterval}m`
        );

        // Сколько минут входит в таймфрейм
        const intervalMinutes = parseInt(targetInterval);

        logger.info(`[AGGREGATE] ⏱ intervalMinutes = ${intervalMinutes}`);

        // Получаем минутные свечи
        const minuteCandles = await dbService.getCandles(
            symbol,
            '1',
            'tracking_contracts',
            intervalMinutes
        );

        logger.info(
            `[AGGREGATE] 📥 Получено свечей: ${minuteCandles?.length || 0}`
        );

        logger.info(
            `[AGGREGATE] 📊 Минутные свечи:\n${JSON.stringify(
                minuteCandles,
                null,
                2
            )}`
        );

        if (!minuteCandles || minuteCandles.length === 0) {
            logger.warn(`[AGGREGATE] ⚠️ Нет минутных свечей для ${symbol}`);
            return null;
        }

        // Сортировка
        minuteCandles.sort((a, b) => a.timestamp - b.timestamp);

        logger.info(`[AGGREGATE] 🔄 Свечи отсортированы`);

        const first = minuteCandles[0];
        const last = minuteCandles[minuteCandles.length - 1];

        logger.info(
            `[AGGREGATE] 🟢 Первая свеча:\n${JSON.stringify(first, null, 2)}`
        );

        logger.info(
            `[AGGREGATE] 🔴 Последняя свеча:\n${JSON.stringify(last, null, 2)}`
        );

        // OHLC
        const open = first.open;
        const close = last.close;

        let high = first.high;
        let low = first.low;

        for (const candle of minuteCandles) {
            if (candle.high > high) {
                high = candle.high;
            }

            if (candle.low < low) {
                low = candle.low;
            }
        }

        logger.info(
            `[AGGREGATE] 📈 OHLC => open=${open}, high=${high}, low=${low}, close=${close}`
        );

        // Время свечи
        const candleTime =
            Math.floor(first.timestamp / (intervalMinutes * 60 * 1000)) *
            intervalMinutes *
            60 *
            1000;

        logger.info(
            `[AGGREGATE] 🕒 candleTime=${candleTime} (${new Date(
                candleTime
            ).toISOString()})`
        );

        const aggregated = [
            [
                candleTime,
                parseFloat(open),
                parseFloat(high),
                parseFloat(low),
                parseFloat(close),
            ],
        ];

        logger.info(
            `[AGGREGATE] 📦 Aggregated candle:\n${JSON.stringify(
                aggregated,
                null,
                2
            )}`
        );

        // Сохраняем свечу
        await dbService.saveCandles(symbol, targetInterval, aggregated);

        logger.info(
            `[AGGREGATE] ✅ Свеча сохранена ${symbol} ${targetInterval}m`
        );

        return aggregated;
    } catch (error) {
        logger.error(
            `[AGGREGATE ERROR] ❌ ${symbol} ${targetInterval}m: ${
                error.stack || error.message
            }`
        );

        return null;
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
