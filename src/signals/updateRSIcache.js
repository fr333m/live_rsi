const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const rsiCache = require('../ws/cacheRSI');
const { getRsi } = require('./rsi/rsi_value');

async function updateRSIfromCache(interval) {
    try {
        console.log(`🔄 Обновление RSI для интервала ${interval}...`);

        const contracts = await dbService.uniqueSymbol(
            'tracking_contracts',
            interval
        );

        if (!contracts || contracts.length === 0) {
            console.log(`Нет контрактов для интервала ${interval}`);
            return true;
        }

        // Очищаем старый кэш
        const rsiStatus = rsiCache.getByInterval(interval);
        if (rsiStatus.length !== 0) {
            rsiCache.clearByInterval(interval);
        }

        let updatedCount = 0;

        for (const contract of contracts) {
            try {
                const symbol =
                    typeof contract === 'string' ? contract : contract.symbol;

                if (!symbol) continue;

                const candles = await dbService.getCandles(
                    symbol,
                    interval,
                    'tracking_contracts',
                    400
                );

                if (!candles || candles.length < 30) {
                    // минимум свечей для RSI
                    continue;
                }

                const rsiValue = await getRsi(candles);

                if (rsiValue) {
                    rsiCache.set(symbol, interval, rsiValue);
                    updatedCount++;
                }
            } catch (err) {
                console.warn(
                    `Ошибка при обновлении RSI для ${contract?.symbol || contract}:`,
                    err.message
                );
            }
        }

        console.log(
            `✅ RSI обновлён для ${updatedCount}/${contracts.length} контрактов (${interval})`
        );
        return true;
    } catch (error) {
        console.error(`❌ Ошибка в updateRSIfromCache (${interval}):`, error);
        return false;
    }
}

module.exports = {
    updateRSIfromCache,
};
