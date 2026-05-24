const { formatShort } = require('./transform_timestamp');
const priceTracker = require('../../ws/wsClient');

const FRACTAL_BARS = 2; // bars on each side (classic Bill Williams = 2)

function isFractalHigh(candles, i) {
    const high = candles[i].high;
    for (let j = 1; j <= FRACTAL_BARS; j++) {
        if (candles[i - j].high >= high || candles[i + j].high >= high)
            return false;
    }
    return true;
}

async function findMaxima(candles, symbol, interval) {
    if (!candles || candles.length < FRACTAL_BARS * 2 + 1) return [];

    const currentPrice = priceTracker.getPrice(symbol)?.lastPrice;
    if (!currentPrice) return [];

    const allLocalMaxs = [];

    for (let i = FRACTAL_BARS; i < candles.length - FRACTAL_BARS; i++) {
        const candle = candles[i];
        const high = candle.high;

        if (high < currentPrice) continue;
        if (!isFractalHigh(candles, i)) continue;

        allLocalMaxs.push({
            ...candle,
            highPrice: high,
            closePrice: candle.close,
            dateTime: formatShort(candle.timestamp),
            timestamp: candle.timestamp,
            index: i,
        });
    }

    if (allLocalMaxs.length === 0) return [];

    // Build ascending resistance sequence (newest → oldest, then reverse)
    const finalMaxima = [allLocalMaxs[allLocalMaxs.length - 1]];

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
        }
    }

    return finalMaxima.reverse();
}

module.exports = { findMaxima };
