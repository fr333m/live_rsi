const { formatShort } = require('./transform_timestamp');
const PostgresDB = require('../../../src/db/db');
const dbService = new PostgresDB();

async function findMaxima(candles, symbol, currentTime) {
    // console.log(`\n=== findMaxima START | ${symbol} | Свечей: ${candles.length} ===`);

    if (!candles || candles.length < 30) {
        // console.log("❌ Мало свечей для анализа максимумов");
        return [];
    }

    const currentPriceData = await dbService.getLastMinutePrices(
        symbol,
        currentTime
    );
    if (!currentPriceData?.length) {
        // console.log("❌ Нет данных о текущей цене");
        return [];
    }

    const currentPrice = currentPriceData[0].lastprice;
    // console.log(`Текущая цена: ${currentPrice}`);

    const windowSize = 5;
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
            diffPercent > 0.08 &&
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
