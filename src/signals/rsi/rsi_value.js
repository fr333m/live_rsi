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

module.exports = { getRsi };
