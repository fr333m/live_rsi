const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const logger = require('../utils/logger');

/**
 * Агрегирует ТОЛЬКО самую последнюю свечу для указанного интервала
 */
async function aggregateLastCandle(symbol, targetInterval) {
    try {
        const minutesMap = { 5: 5, 15: 15, 30: 30, 60: 60 };
        const minutes = minutesMap[targetInterval];

        if (!minutes)
            throw new Error(`Неподдерживаемый интервал: ${targetInterval}`);

        logger.debug(`Агрегация последней свечи ${symbol} → ${targetInterval}`);

        // Получаем последние N минутных свечей (немного больше, чем нужно)
        const minuteCandles = await dbService.getCandles(
            symbol,
            '1',
            'tracking_contracts',
            minutes * 2 + 10 // небольшой запас
        );

        if (!minuteCandles || minuteCandles.length < minutes) {
            logger.warn(`Недостаточно минутных данных для ${symbol}`);
            return false;
        }

        // Сортируем по времени (на всякий случай)
        minuteCandles.sort((a, b) => a.timestamp - b.timestamp);

        const now = Date.now();
        // Находим начало текущего периода
        const lastCandleTime =
            minuteCandles[minuteCandles.length - 1].timestamp;
        const periodStart =
            Math.floor(lastCandleTime / (minutes * 60 * 1000)) *
            (minutes * 60 * 1000);

        // Берём только свечи, которые входят в текущий период
        const relevantCandles = minuteCandles.filter(
            (c) =>
                c.timestamp >= periodStart &&
                c.timestamp < periodStart + minutes * 60 * 1000
        );

        if (relevantCandles.length === 0) {
            return false;
        }

        const open = relevantCandles[0].open;
        let high = relevantCandles[0].high;
        let low = relevantCandles[0].low;
        const close = relevantCandles[relevantCandles.length - 1].close;

        for (const c of relevantCandles) {
            high = Math.max(high, c.high);
            low = Math.min(low, c.low);
        }

        const aggregated = [
            [
                periodStart,
                parseFloat(open),
                parseFloat(high),
                parseFloat(low),
                parseFloat(close),
            ],
        ];

        await dbService.saveCandles(symbol, targetInterval, aggregated);

        logger.info(`✓ ${targetInterval} | 1 свеча обновлена | ${symbol}`);
        return true;
    } catch (error) {
        logger.error(
            `Ошибка агрегации последней свечи ${symbol} → ${targetInterval}`,
            {
                error: error.message,
            }
        );
        return false;
    }
}

/**
 * Обновляет последнюю свечу по всем таймфреймам
 */
async function updateLastCandles(symbol) {
    const intervals = [5, 15, 30, 60];
    let successCount = 0;

    logger.info(`🔄 Обновление последних свечей для ${symbol}`);

    for (const tf of intervals) {
        const ok = await aggregateLastCandle(symbol, tf);
        if (ok) successCount++;
    }

    logger.info(
        `✅ Завершено обновление ${symbol} | Обновлено ${successCount}/${intervals.length} таймфреймов`
    );
    return successCount;
}

/**
 * Массовое обновление для списка символов
 */
async function updateLastCandlesMultiple(symbols, concurrency = 5) {
    logger.info(
        `🚀 Массовое обновление последних свечей для ${symbols.length} символов`
    );

    let index = 0;

    const runNext = async () => {
        while (index < symbols.length) {
            const symbol = symbols[index++];
            await updateLastCandles(symbol);
        }
    };

    const workers = Array.from({ length: concurrency }, runNext);
    await Promise.all(workers);

    logger.info(
        `🎉 Обновление последних свечей завершено для ${symbols.length} символов`
    );
}

module.exports = {
    aggregateLastCandle,
    updateLastCandles,
    updateLastCandlesMultiple,
};
