function getRsi(candlesArr) {
    if (!Array.isArray(candlesArr) || candlesArr.length < 15) {
        return null;
    }

    const period = 14;
    const closes = candlesArr.slice(-100).map((c) => c.close);

    if (closes.length < period + 1) {
        return null;
    }

    let gains = 0;
    let losses = 0;

    // Первый RSI (простая средняя)
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Сглаживание (Wilder)
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const currentGain = Math.max(diff, 0);
        const currentLoss = Math.max(-diff, 0);

        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    }

    if (avgLoss === 0) return 100;
    if (avgGain === 0) return 0;

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

// Wilder RSI для всего массива свечей за один проход — O(n)
function computeAllRsi(candles) {
    const period = 14;
    const rsiValues = new Array(candles.length).fill(null);
    if (candles.length < period + 1) return rsiValues;

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        if (diff > 0) avgGain += diff;
        else avgLoss += Math.abs(diff);
    }
    avgGain /= period;
    avgLoss /= period;

    rsiValues[period] =
        avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < candles.length; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
        rsiValues[i] =
            avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - 100 / (1 + avgGain / avgLoss);
    }

    return rsiValues;
}

module.exports = { getRsi, computeAllRsi };
