const { formatShort } = require('./transform_timestamp');
const SqliteDB = require('../../../src/db/db');
const dbService = new SqliteDB('./candles.db');

async function findMaxima(candles, symbol) {
    if (!candles || candles.length < 30) {
        return [];
    }

    const partSize = Math.ceil(candles.length / 7);
    const parts = [];
    
    for (let p = 0; p < 7; p++) {
        const start = p * partSize;
        const end = Math.min(start + partSize, candles.length);
        parts.push(candles.slice(start, end));
    }

    const results = [];
    const currentPriceData = await dbService.getLastMinutePrices(symbol);

    if(currentPriceData.length <= 0){
        return;
    }
    const currentPrice = currentPriceData[0].lastPrice;

    const windowSize = 5;

    // Шаг 1: Один лучший максимум из каждой части
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex];
        let bestCandle = null;
        let bestPrice = -Infinity;

        for (let i = 0; i < part.length; i++) {
            const candle = part[i];
            const high = candle.high;                    // ← Лучше использовать high

            if (high < currentPrice) continue;

            // Проверка локального максимума
            let isLocalMax = true;
            const left = Math.max(0, i - windowSize);
            const right = Math.min(part.length - 1, i + windowSize);

            for (let j = left; j <= right; j++) {
                if (j === i) continue;
                if (part[j].high >= high) {              // Сравниваем high с high
                    isLocalMax = false;
                    break;
                }
            }

            if (isLocalMax && high > bestPrice) {
                bestPrice = high;
                bestCandle = candle;
            }
        }

        if (bestCandle) {
            results.push({
                closePrice: bestCandle.close,
                highPrice: bestCandle.high,
                dateTime: formatShort(bestCandle.timestamp),
                timestamp: bestCandle.timestamp
            });
        }
    }

    if (results.length === 0) return [];
    

    // === ПРАВИЛЬНАЯ ФИЛЬТРАЦИЯ ДЛЯ МАКСИМУМОВ (возрастающая последовательность) ===
    const filteredResults = [];
    
    // Начинаем с самого первого (левого) максимума
    filteredResults.push(results[results.length - 1]);

    for (let i = results.length - 2; i >= 0; i--) {
        const prevMax = filteredResults[filteredResults.length - 1].highPrice || 
                       filteredResults[filteredResults.length - 1].closePrice;
        
        const currentMax = results[i].highPrice || results[i].closePrice;

        if (currentMax > prevMax) {        // строго выше предыдущего
            filteredResults.push(results[i]);
        }
    }

    return filteredResults;
}


module.exports = { findMaxima };