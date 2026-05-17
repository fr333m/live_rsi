const { formatShort } = require('./transform_timestamp');
const priceTracker = require('../../ws/wsClient');

async function findMaxima(candles, symbol, interval) {
    // console.log(`\n=== findMaxima START | ${symbol} | Свечей: ${candles.length} ===`);

    if (!candles || candles.length < 30) {
        // console.log("❌ Мало свечей для анализа максимумов");
        return [];
    }

    const lastRecord = priceTracker.getPrice(symbol)?.lastPrice;
    if (!lastRecord) {
        // console.log("❌ Нет данных цены в кэше для символа");
        return [];
    }

    const currentPrice = lastRecord?.lastPrice;

    // console.log(`Текущая цена: ${currentPrice}`);

    const windowSize = 10; // Больше свечей для 60м, меньше для 15м
    const allLocalMaxs = [];

    // // console.log(`\n=== Поиск локальных максимумов (window = ${windowSize}) ===`);

    for (let i = windowSize; i < candles.length - windowSize; i++) {
        const candle = candles[i];
        const high = candle.high;

        if (high < currentPrice) continue;

        // Проверка локального максимума
        let isLocalMax = true;
        for (let j = i - windowSize; j <= i + windowSize; j++) {
            if (j === i) continue;
            if (candles[j].high >= high) {
                isLocalMax = false;
                break;
            }
        }

        if (!isLocalMax) continue;

        allLocalMaxs.push({
            ...candle,
            highPrice: high,
            closePrice: candle.close,
            dateTime: formatShort(candle.timestamp),
            timestamp: candle.timestamp,
            index: i,
        });
    }

    //console.log(`\nНайдено локальных максимумов: ${allLocalMaxs.length}`);

    if (allLocalMaxs.length === 0) {
        // console.log("❌ Не найдено ни одного локального максимума");
        return [];
    }

    // === Финальная фильтрация: возрастающая последовательность ===
    const finalMaxima = [allLocalMaxs[allLocalMaxs.length - 1]]; // самый новый максимум

    // console.log(`\nФинальная возрастающая фильтрация...`);

    for (let i = allLocalMaxs.length - 2; i >= 0; i--) {
        const curr = allLocalMaxs[i];
        const last = finalMaxima[finalMaxima.length - 1];
        const diffPercent =
            ((curr.highPrice - last.highPrice) / last.highPrice) * 100;

        if (
            curr.highPrice > last.highPrice &&
            diffPercent > 0.8 &&
            last.index - curr.index > 4
        ) {
            finalMaxima.push(curr);
            // console.log(`   ✅ Добавлен: ${curr.dateTime} (+${diffPercent.toFixed(2)}%)`);
        } else {
            // console.log(`   ❌ Пропущен: ${curr.dateTime} (разница ${diffPercent.toFixed(2)}%)`);
        }
    }

    const result = finalMaxima.reverse();
    // console.log(`\n=== findMaxima FINISH | Возвращаем ${result.length} максимумов ===\n`);

    return result;
}

module.exports = { findMaxima };
