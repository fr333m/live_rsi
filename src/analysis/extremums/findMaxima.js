const { formatShort } = require('./transformTimestamp');
const { computeAllRsi } = require('../rsi/rsiCalc');
const priceTracker = require('../../ws/priceTracker');
const { computePeakProminence } = require('./prominace');
const FRACTAL_BARS = {
    1: 2,
    3: 2,
    5: 2,
    15: 2,
    30: 2,
    60: 2,
    240: 2,
    D: 2,
};

const promLevel = {
    1: 5,
    5: 2,
    15: 2,
    60: 2,
};

function isFractalHigh(candles, i, timeframe) {
    const high = candles[i].high;
    for (let j = 1; j <= FRACTAL_BARS[timeframe]; j++) {
        if (candles[i - j].high >= high || candles[i + j].high >= high)
            return false;
    }
    return true;
}

async function findMaxima(candles, symbol, trimCount, atr = 0, timeframe) {
    const lastPriceData = priceTracker.getPrice(symbol);
    const lastPrice = lastPriceData?.lastPrice || 0;

    if (timeframe === '1') {
        trimCount = 15;
    }

    // (5) Без актуальной цены ценовой фильтр и выбор seed не имеют смысла.
    // Не возвращаем уровни на отсутствующих/устаревших данных.
    if (!lastPrice) return [];

    if (!candles || candles.length < FRACTAL_BARS[timeframe] * 2 + 1) return [];

    const rsiValues = computeAllRsi(candles);
    const promValues = await computePeakProminence(candles);
    const promFloor = promLevel[timeframe];
    const allLocalMaxs = [];

    for (
        let i = FRACTAL_BARS[timeframe];
        i < candles.length - FRACTAL_BARS[timeframe];
        i++
    ) {
        const candle = candles[i];
        const ratio = promValues[i] / atr;

        if (atr > 0 && ratio < promFloor) {
            continue;
        }

        if (!isFractalHigh(candles, i, timeframe)) continue;

        allLocalMaxs.push({
            ...candle,
            highPrice: candle.high,
            closePrice: candle.close,
            dateTime: formatShort(candle.timestamp),
            timestamp: candle.timestamp,
            index: i,
            rsi: rsiValues[i],
            prominance: ratio,
        });
    }

    if (allLocalMaxs.length === 0) return [];

    // (4) Seed должен проходить тот же ценовой фильтр, что и остальные максимумы.
    // Берём самый свежий фрактал, чей close НЕ НИЖЕ текущей цены.
    let seedIndex = -1;
    for (let i = allLocalMaxs.length - 1; i >= 0; i--) {
        if (allLocalMaxs[i].closePrice >= lastPrice) {
            seedIndex = i;
            break;
        }
    }
    if (seedIndex === -1) return [];

    const finalMaxima = [allLocalMaxs[seedIndex]];

    // Начинаем с seedIndex - 1: всё, что свежее seed, уже отсеяно ценовым фильтром.
    for (let i = seedIndex - 1; i >= 0; i--) {
        const curr = allLocalMaxs[i];
        const last = finalMaxima[finalMaxima.length - 1];
        const priceDiff = curr.highPrice - last.highPrice;
        const threshold = atr > 0 ? atr * 0.5 : last.highPrice * 0.008;

        if (curr.closePrice < lastPrice) continue;

        if (curr.highPrice > last.highPrice) {
            if (last.index - curr.index <= 3) {
                finalMaxima[finalMaxima.length - 1] = curr;
            } else if (priceDiff > threshold) {
                finalMaxima.push(curr);
            }
        }
    }

    return finalMaxima
        .reverse()
        .filter((m) => m.index < candles.length - trimCount);
}

module.exports = { findMaxima };
