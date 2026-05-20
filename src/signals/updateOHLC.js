const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const logger = require('../utils/logger');

/**
 * Агрегирует последние N минутных свечей в одну свечу нужного таймфрейма
 */
async function aggregateLastCandle(symbol, targetInterval) {
    try {
        const minutesMap = { 5: 5, 15: 15, 30: 30, 60: 60, 240: 240 };
        const minutes = minutesMap[targetInterval];

        if (!minutes) {
            throw new Error(`Неподдерживаемый интервал: ${targetInterval}`);
        }

        logger.debug(
            `Агрегация последней свечи ${symbol} → ${targetInterval}min`
        );

        // Получаем ровно нужное количество минутных свечей
        const minuteCandles = await dbService.getCandles(
            symbol,
            '1', // минутный таймфрейм
            'tracking_contracts',
            minutes + 5 // небольшой запас на всякий случай
        );

        if (!minuteCandles || minuteCandles.length < minutes) {
            logger.warn(
                `Недостаточно минутных свечей для ${symbol} (${minuteCandles?.length || 0}/${minutes})`
            );
            return false;
        }

        // Берём последние N свечей
        const relevantCandles = minuteCandles.slice(-minutes);

        // Формируем агрегированную свечу
        const open = relevantCandles[0].open;
        let high = relevantCandles[0].high;
        let low = relevantCandles[0].low;
        const close = relevantCandles[relevantCandles.length - 1].close;

        for (const c of relevantCandles) {
            high = Math.max(high, c.high);
            low = Math.min(low, c.low);
        }

        // Время свечи = время первой свечи в группе
        const candleTime = relevantCandles[0].timestamp;

        const aggregated = [
            [
                candleTime,
                parseFloat(open),
                parseFloat(high),
                parseFloat(low),
                parseFloat(close),
            ],
        ];

        await dbService.saveCandles(symbol, targetInterval, aggregated);

        logger.info(`✓ ${targetInterval}min | 1 свеча обновлена | ${symbol}`);
        return true;
    } catch (error) {
        logger.error(`Ошибка агрегации ${symbol} → ${targetInterval}min`, {
            error: error.message,
        });
        return false;
    }
}

/**
 * Обновляет последнюю свечу по всем таймфреймам
 */
async function updateLastCandles(symbol) {
    const intervals = [5, 15, 30, 60];
    let successCount = 0;

    logger.info(`🔄 Обновление свечей для ${symbol}`);

    for (const tf of intervals) {
        const ok = await aggregateLastCandle(symbol, tf);
        if (ok) successCount++;
    }

    logger.info(
        `✅ ${symbol} | Обновлено ${successCount}/${intervals.length} таймфреймов`
    );
    return successCount;
}

/**
 * Массовое обновление
 */
async function updateLastCandlesMultiple(symbols, concurrency = 5) {
    logger.info(`🚀 Массовое обновление для ${symbols.length} символов`);

    let index = 0;
    const runNext = async () => {
        while (index < symbols.length) {
            const symbol = symbols[index++];
            await updateLastCandles(symbol);
        }
    };

    const workers = Array.from({ length: concurrency }, runNext);
    await Promise.all(workers);

    logger.info(`🎉 Обновление завершено для ${symbols.length} символов`);
}

module.exports = {
    aggregateLastCandle,
    updateLastCandles,
    updateLastCandlesMultiple,
};
