const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const rsiCache = require('../ws/cacheRSI');
const { getRsi } = require('./rsi/rsi_value');
const { getVolatilityLevel } = require('./rsi/getVolatilityLevel');
const logger = require('../utils/logger');

// Простой ограничитель параллельности
async function asyncPool(concurrency, items, iteratorFn) {
    const results = [];
    const executing = new Set();

    for (const item of items) {
        const promise = iteratorFn(item).then((result) => {
            executing.delete(promise);
            return result;
        });

        executing.add(promise);
        results.push(promise);

        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }

    return Promise.allSettled(results);
}

async function updateRSIfromCache(interval, concurrency = 12) {
    const startTime = Date.now();
    const logMeta = { interval, concurrency };

    try {
        logger.info(`Запуск обновления RSI`, logMeta);

        const statusRSIcache = rsiCache.getByInterval(interval);
        if (statusRSIcache.length > 0) {
            rsiCache.clearByInterval(interval);
            logger.debug(
                `Кэш RSI для интервала ${interval} очищен перед обновлением`
            );
        }

        const contracts = await dbService.uniqueSymbol(
            'tracking_contracts',
            interval
        );

        if (!contracts?.length) {
            logger.info(`Нет контрактов для обновления RSI`, {
                ...logMeta,
                contractsCount: 0,
            });
            return true;
        }

        logger.info(`Найдено контрактов для RSI: ${contracts.length}`, logMeta);

        // Очищаем старый кэш
        rsiCache.clearByInterval(interval);

        let updatedCount = 0;
        let skippedCount = 0;
        const errors = [];

        await asyncPool(concurrency, contracts, async (contract) => {
            try {
                const symbol =
                    typeof contract === 'string' ? contract : contract?.symbol;
                if (!symbol) return;

                const candles = await dbService.getCandles(
                    symbol,
                    interval,
                    'tracking_contracts',
                    400
                );

                if (!candles || candles.length < 30) {
                    skippedCount++;
                    logger.debug(
                        `Недостаточно свечей для ${symbol} (${candles?.length || 0})`
                    );
                    return;
                }

                const [volatilityData, rsiValue] = await Promise.all([
                    getVolatilityLevel(candles, interval),
                    getRsi(candles),
                ]);

                if (rsiValue !== null && (rsiValue >= 60 || rsiValue <= 35)) {
                    rsiCache.set(
                        symbol,
                        interval,
                        rsiValue,
                        volatilityData.volatilityForSignal
                    );
                    updatedCount++;

                    logger.debug(
                        `RSI обновлён → ${symbol} | RSI: ${rsiValue} | Vol: ${volatilityData.volatilityForSignal}`
                    );
                } else {
                    skippedCount++;
                }
            } catch (err) {
                errors.push({
                    symbol: contract?.symbol || contract,
                    error: err.message,
                });
                logger.warn(`Ошибка при расчёте RSI`, {
                    symbol: contract?.symbol || contract,
                    interval,
                    error: err.message,
                });
            }
        });

        const duration = Date.now() - startTime;

        // Итоговый лог
        logger.info(`Обновление RSI завершено`, {
            interval,
            totalContracts: contracts.length,
            updated: updatedCount,
            skipped: skippedCount,
            errors: errors.length,
            durationMs: duration,
            concurrency,
        });

        if (errors.length > 0) {
            logger.warn(`Ошибки при обновлении RSI`, {
                interval,
                errorCount: errors.length,
                sampleErrors: errors.slice(0, 3), // показываем только первые 3
            });
        }

        return true;
    } catch (error) {
        const duration = Date.now() - startTime;

        logger.error(`Критическая ошибка в updateRSIfromCache`, {
            interval,
            durationMs: duration,
            error: error.message,
            stack: error.stack,
        });

        return false;
    }
}

module.exports = {
    updateRSIfromCache,
};
