const { formatShort } = require('./transform_timestamp');

async function findMinima(candles) {
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
    const currentPrice = candles[0][4]; // Последняя свеча (рекомендуется)
    
    const windowSize = 10;
    
    // Step 2: Находим лучший минимум в каждой части
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex];
        let bestCandle = null;
        let bestPrice = Infinity; // Для минимумов начинаем с Infinity

        for (let i = 0; i < part.length; i++) {
            const candle = part[i];
            const close = candle[4];

            if (close > currentPrice) continue;

            // Проверка локального минимума
            let isLocalMin = true;
            const left = Math.max(0, i - windowSize);
            const right = Math.min(part.length - 1, i + windowSize);

            for (let j = left; j <= right; j++) {
                if (j === i) continue;
                if (part[j][4] <= close) {        // ≤ — важный момент для минимумов
                    isLocalMin = false;
                    break;
                }
            }

            if (isLocalMin && close < bestPrice) {
                bestPrice = close;
                bestCandle = candle;
            }
        }

        if (bestCandle) {
            results.push({
                closePrice: bestCandle[4],
                dateTime: formatShort(bestCandle[0]),
                timestamp: bestCandle[0]
            });
        }
    }

    // === НОВЫЙ ЭТАП: Фильтрация ===
    if (results.length === 0) return [];

    // Находим самый первый (самый левый) минимум
    const firstMin = results[0].closePrice;

    // Оставляем только те минимумы, которые <= первого минимума
    const filteredResults = results.filter(item => item.closePrice <= firstMin);

    console.log('Все найденные минимумы:', results);
    console.log('После фильтрации (ниже первого):', filteredResults);

    return filteredResults;
}

module.exports = {
    findMinima
};