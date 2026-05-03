const { formatShort } = require('./transform_timestamp');

async function findMaxima(candles) {
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
    const currentPrice = candles[0][4]; // ← Рекомендую изменить на последнюю свечу
    
    const windowSize = 5;

    // Шаг 1: Собираем один лучший максимум из каждой части
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex];
        let bestCandle = null;
        let bestPrice = -Infinity;

        for (let i = 0; i < part.length; i++) {
            const candle = part[i];
            const close = candle[4];

            if (close < currentPrice) continue;

            // Проверка локального максимума (±windowSize)
            let isLocalMax = true;
            const left = Math.max(0, i - windowSize);
            const right = Math.min(part.length - 1, i + windowSize);

            for (let j = left; j <= right; j++) {
                if (j === i) continue;
                if (part[j][4] >= close) {   // можно изменить на High, если нужно
                    isLocalMax = false;
                    break;
                }
            }

            if (isLocalMax && close > bestPrice) {
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

    // Находим самый первый (самый левый) максимум
    const firstMax = results[0].closePrice;

    // Фильтруем: оставляем только те максимумы, которые >= первого
    const filteredResults = results.filter(item => item.closePrice >= firstMax);

    console.log('Все найденные максимумы:', results);
    console.log('После фильтрации (выше первого):', filteredResults);

    return filteredResults;
}

module.exports = { findMaxima };