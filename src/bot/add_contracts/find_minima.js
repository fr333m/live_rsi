const { formatShort } = require('./transform_timestamp');
const SqliteDB = require('../../../src/db/db');
const dbService = new SqliteDB('./candles.db');

async function findMinima(candles, symbol) {
    if (!candles || candles.length < 30) {
        return [];
    }

    // Step 1: Разделяем на 7 частей
    const partSize = Math.ceil(candles.length / 7);
    const parts = [];
    
    for (let p = 0; p < 7; p++) {
        const start = p * partSize;
        const end = Math.min(start + partSize, candles.length);
        parts.push(candles.slice(start, end));
    }

    const results = [];
    const currentPriceData = await dbService.getLastMinutePrices(symbol);

    if(currentPriceData <= 0){
        return;
    };
    const currentPrice = currentPriceData[0].lastPrice;
    console.log('CURRENT PRICE FOR MINIMA', currentPrice, candles[candles.length - 1].datetime);
    
    const windowSize = 5;
    
    // Step 2: Находим лучший минимум в каждой части
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex];
        let bestCandle = null;
        let bestPrice = Infinity;

        for (let i = 0; i < part.length; i++) {
            const candle = part[i];
            const low = candle.low;                    // ← Лучше использовать low

            if (low > currentPrice) continue;

            // Проверка локального минимума
            let isLocalMin = true;
            const left = Math.max(0, i - windowSize);
            const right = Math.min(part.length - 1, i + windowSize);

            for (let j = left; j <= right; j++) {
                if (j === i) continue;
                if (part[j].low <= low) {              // ← Используем low
                    isLocalMin = false;
                    break;
                }
            }

            if (isLocalMin && low < bestPrice) {
                bestPrice = low;
                bestCandle = candle;
            }
        }

        if (bestCandle) {
            results.push({
                closePrice: bestCandle.close,
                lowPrice: bestCandle.low,              // ← Добавил для удобства
                dateTime: formatShort(bestCandle.timestamp),
                timestamp: bestCandle.timestamp
            });
        }
    }

    if (results.length === 0) return [];


    // === ПОСЛЕДОВАТЕЛЬНАЯ ФИЛЬТРАЦИЯ ПО УБЫВАНИЮ ===
    const filteredResults = [];
    
    // Первый минимум всегда оставляем
    filteredResults.push(results[results.length - 1]);

    for (let i = results.length - 2; i >= 0; i--) {
        const prevMin = filteredResults[filteredResults.length - 1].lowPrice || 
                       filteredResults[filteredResults.length - 1].closePrice;
        
        const currentMin = results[i].lowPrice || results[i].closePrice;

        if (currentMin < prevMin) {        // строго ниже предыдущего оставленного
            filteredResults.push(results[i]);
        }
        // если выше или равен — пропускаем
    }

    return filteredResults;
}

module.exports = {
    findMinima
};