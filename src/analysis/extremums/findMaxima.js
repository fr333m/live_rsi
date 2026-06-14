const { formatShort } = require('./transformTimestamp');
const { computeAllRsi } = require('../rsi/rsiCalc');
const priceTracker = require('../../ws/priceTracker');

const FRACTAL_BARS = {
    1: 3,
    3: 2,
    5: 2,
    15: 2,
    30: 2,
    60: 2,
    240: 2,
    D: 2,
};

function isFractalHigh(candles, i, timeframe) {
    const high = candles[i].high;
    for (let j = 1; j <= FRACTAL_BARS[timeframe]; j++) {
        if (candles[i - j].high >= high || candles[i + j].high >= high)
            return false;
    }
    return true;
}

async function findMaxima(candles, symbol, interval, atr = 0, timeframe) {
    const lastPriceData = priceTracker.getPrice(symbol);
    const lastPrice = lastPriceData?.lastPrice || 0;
    if (!candles || candles.length < FRACTAL_BARS[timeframe] * 2 + 1) return [];

    const rsiValues = computeAllRsi(candles);
    const allLocalMaxs = [];

    for (
        let i = FRACTAL_BARS[timeframe];
        i < candles.length - FRACTAL_BARS[timeframe];
        i++
    ) {
        const candle = candles[i];

        if (!isFractalHigh(candles, i, timeframe)) continue;

        allLocalMaxs.push({
            ...candle,
            highPrice: candle.high,
            closePrice: candle.close,
            dateTime: formatShort(candle.timestamp),
            timestamp: candle.timestamp,
            index: i,
            rsi: rsiValues[i],
        });
    }

    if (allLocalMaxs.length === 0) return [];

    const finalMaxima = [allLocalMaxs[allLocalMaxs.length - 1]];

    for (let i = allLocalMaxs.length - 2; i >= 0; i--) {
        const curr = allLocalMaxs[i];
        const last = finalMaxima[finalMaxima.length - 1];
        const priceDiff = curr.highPrice - last.highPrice;
        const threshold = atr > 0 ? atr * 0.5 : last.highPrice * 0.008;

        if (curr.closePrice < lastPrice) continue;

        if (
            curr.highPrice > last.highPrice &&
            priceDiff > threshold &&
            last.index - curr.index > 3
        ) {
            finalMaxima.push(curr);
        }
    }

    return finalMaxima
        .reverse()
        .filter((m) => m.index < candles.length - interval);
}

module.exports = { findMaxima };
