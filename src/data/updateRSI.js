const dbService = require('../db/index');
const rsiCache = require('../cache/rsiCache');
const { getRsi } = require('../analysis/rsi/rsiCalc');
const { getVolatilityLevel } = require('../analysis/rsi/volatility');
const { calcADX } = require('../analysis/trendDetector/trend_detector');
const logger = require('../utils/logger');

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

    try {
        logger.info(`Запуск обновления RSI`, { interval, concurrency });

        const contracts = await dbService.uniqueSymbol(
            'tracking_contracts',
            interval
        );

        if (!contracts?.length) {
            logger.info(`Нет контрактов для обновления RSI`, { interval });
            return true;
        }

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
                    return;
                }

                let adx = null;
                const adxData = calcADX(candles);
                if (adxData) {
                    adx = adxData.adx;
                    logger.debug('[updateRSI] ADX result', {
                        symbol,
                        trend: adxData.adx,
                    });
                }

                const [volatilityData, rsiValue] = await Promise.all([
                    getVolatilityLevel(candles, interval),
                    getRsi(candles),
                ]);

                if (rsiValue != null && volatilityData != null) {
                    rsiCache.set(
                        symbol,
                        interval,
                        rsiValue,
                        volatilityData.volatilityForSignal,
                        volatilityData.volatilityPercent,
                        volatilityData.atr,
                        adx
                    );
                    updatedCount++;
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

        logger.info(`Обновление RSI завершено`, {
            interval,
            updated: updatedCount,
            skipped: skippedCount,
            errors: errors.length,
            durationMs: Date.now() - startTime,
        });

        return true;
    } catch (error) {
        logger.error(`Критическая ошибка в updateRSIfromCache`, {
            interval,
            error: error.message,
        });
        return false;
    }
}

module.exports = { updateRSIfromCache };
