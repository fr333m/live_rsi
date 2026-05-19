const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const rsiCache = require('../ws/cacheRSI');
const { getRsi } = require('./rsi/rsi_value');
const { getVolatilityLevel } = require('./rsi/getVolatilityLevel');

// Простой ограничитель параллельности (без доп. зависимостей)
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
    if (interval === '1') {
        return;
    }
    const startTime = Date.now();

    try {
        console.log(
            `🔄 Обновление RSI для интервала ${interval}... (concurrency: ${concurrency})`
        );

        const contracts = await dbService.uniqueSymbol(
            'tracking_contracts',
            interval
        );

        if (!contracts?.length) {
            console.log(`Нет контрактов для интервала ${interval}`);
            return true;
        }

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
                    return;
                }

                // Параллельное выполнение двух функций
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
                } else {
                    skippedCount++;
                }
            } catch (err) {
                errors.push({
                    symbol: contract?.symbol || contract,
                    error: err.message,
                });
                console.warn(`⚠️ Ошибка RSI для || contract}:`, err.message);
            }
        });

        const duration = Date.now() - startTime;

        console.log(
            `✅ RSI обновлён для ${updatedCount}/${contracts.length} контрактов (${interval})`
        );
        console.log(
            `⏱ Время выполнения: ${duration}мс | Пропущено: ${skippedCount} | Ошибок: ${errors.length}`
        );

        if (errors.length > 5) {
            console.warn(
                `⚠️ Много ошибок (${errors.length}) при обработке интервала ${interval}`
            );
        }

        return true;
    } catch (error) {
        console.error(
            `❌ Критическая ошибка в updateRSIfromCache (${interval}):`,
            error
        );
        return false;
    }
}

module.exports = {
    updateRSIfromCache,
};
