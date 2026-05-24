const { formatShort } = require('./transform_timestamp');
const priceTracker = require('../../ws/wsClient');

const FRACTAL_BARS = 2; // bars on each side (classic Bill Williams = 2)

function isFractalLow(candles, i) {
    const low = candles[i].low;
    for (let j = 1; j <= FRACTAL_BARS; j++) {
        if (candles[i - j].low <= low || candles[i + j].low <= low)
            return false;
    }
    return true;
}

async function findMinima(candles, symbol) {
    if (!candles || candles.length < FRACTAL_BARS * 2 + 1) return [];

    const currentPrice = priceTracker.getPrice(symbol)?.lastPrice;
    if (!currentPrice) return [];

    const allLocalMins = [];

    for (let i = FRACTAL_BARS; i < candles.length - FRACTAL_BARS; i++) {
        const candle = candles[i];
        const low = candle.low;

        if (low > currentPrice) continue;
        if (!isFractalLow(candles, i)) continue;

        allLocalMins.push({
            ...candle,
            lowPrice: low,
            closePrice: candle.close,
            dateTime: formatShort(candle.timestamp),
            timestamp: candle.timestamp,
            index: i,
        });
    }

    if (allLocalMins.length === 0) return [];

    // Build descending support sequence (newest → oldest, then reverse)
    const finalMinima = [allLocalMins[allLocalMins.length - 1]];

    for (let i = allLocalMins.length - 2; i >= 0; i--) {
        const curr = allLocalMins[i];
        const last = finalMinima[finalMinima.length - 1];
        const diffPercent =
            ((last.lowPrice - curr.lowPrice) / last.lowPrice) * 100;

        if (
            curr.lowPrice < last.lowPrice &&
            diffPercent > 0.08 &&
            last.index - curr.index > 4
        ) {
            finalMinima.push(curr);
        }
    }

    return finalMinima.reverse();
}

module.exports = { findMinima };
