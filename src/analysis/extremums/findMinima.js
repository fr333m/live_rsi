const { formatShort } = require('./transformTimestamp');
const { computeAllRsi } = require('../rsi/rsiCalc');
const priceTracker = require('../../ws/priceTracker');
const { computeTroughProminence } = require('./prominace');

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

function isFractalLow(candles, i, timeframe) {
    const low = candles[i].low;
    for (let j = 1; j <= FRACTAL_BARS[timeframe]; j++) {
        if (candles[i - j].low <= low || candles[i + j].low <= low)
            return false;
    }
    return true;
}

async function findMinima(candles, symbol, trimCount, atr = 0, timeframe) {
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
    const promValues = await computeTroughProminence(candles);
    const promFloor = promLevel[timeframe];
    const allLocalMins = [];

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

        if (!isFractalLow(candles, i, timeframe)) continue;

        allLocalMins.push({
            ...candle,
            lowPrice: candle.low,
            closePrice: candle.close,
            dateTime: formatShort(candle.timestamp),
            timestamp: candle.timestamp,
            index: i,
            rsi: rsiValues[i],
            prominance: ratio,
        });
    }

    if (allLocalMins.length === 0) return [];

    // (4) Seed должен проходить тот же ценовой фильтр, что и остальные минимумы.
    // Берём самый свежий фрактал, чей close не выше текущей цены.
    let seedIndex = -1;
    for (let i = allLocalMins.length - 1; i >= 0; i--) {
        if (allLocalMins[i].closePrice <= lastPrice) {
            seedIndex = i;
            break;
        }
    }
    if (seedIndex === -1) return [];

    const finalMinima = [allLocalMins[seedIndex]];

    // Начинаем с seedIndex - 1: всё, что свежее seed, уже отсеяно ценовым фильтром.
    for (let i = seedIndex - 1; i >= 0; i--) {
        const curr = allLocalMins[i];
        const last = finalMinima[finalMinima.length - 1];
        const priceDiff = last.lowPrice - curr.lowPrice;
        const threshold = atr > 0 ? atr * 0.5 : last.lowPrice * 0.008;

        if (curr.closePrice > lastPrice) continue;

        if (curr.lowPrice < last.lowPrice) {
            if (last.index - curr.index <= 3) {
                finalMinima[finalMinima.length - 1] = curr;
            } else if (priceDiff > threshold) {
                finalMinima.push(curr);
            }
        }
    }

    return finalMinima
        .reverse()
        .filter((m) => m.index < candles.length - trimCount);
}

module.exports = { findMinima };
