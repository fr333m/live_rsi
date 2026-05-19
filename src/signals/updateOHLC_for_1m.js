const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const priceCache = require('../ws/priceCache'); // пока не используется

async function updateOHLC(symbol, interval, currentTimestamp) {
    try {
        const ohlcData = await dbService.getLastMinutePrices(
            symbol,
            currentTimestamp
        );

        if (!ohlcData || ohlcData.length === 0) {
            console.log(`⚠️ Нет ценовых данных для ${symbol} (${interval})`);
            return false;
        }

        // Фильтруем и валидируем данные
        const validData = ohlcData.filter(
            (item) =>
                item &&
                typeof item.lastprice === 'number' &&
                item.timestamp != null
        );

        if (validData.length === 0) {
            console.log(`⚠️ Нет валидных данных для ${symbol}`);
            return false;
        }

        // Сортируем по времени на всякий случай
        validData.sort((a, b) => a.timestamp - b.timestamp);

        const open = validData[0].lastprice;
        const close = validData[validData.length - 1].lastprice;

        // Более безопасный и быстрый расчёт high/low
        let high = -Infinity;
        let low = Infinity;

        for (const item of validData) {
            const price = item.lastprice;
            if (price > high) high = price;
            if (price < low) low = price;
        }

        const timestamp = validData[validData.length - 1].timestamp;

        const ohlcArr = [[timestamp, open, high, low, close]];

        await dbService.saveCandles(symbol, interval, ohlcArr);

        // Опционально: обновляем кэш цены
        // priceCache.update(symbol, close);

        return true;
    } catch (error) {
        console.error(
            `❌ Ошибка в updateOHLC(${symbol}, ${interval}):`,
            error.message
        );
        return false;
    }
}

module.exports = {
    updateOHLC,
};
