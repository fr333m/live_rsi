// prominence.js
// Для впадин: барьер — самый высокий close до более глубокого close с каждой стороны.
async function computeTroughProminence(candles) {
    const n = candles.length;
    const prom = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        const C = candles[i].close;
        let leftPeak = C;
        for (let j = i - 1; j >= 0; j--) {
            if (candles[j].close < C) break;
            if (candles[j].close > leftPeak) leftPeak = candles[j].close;
        }
        let rightPeak = C;
        for (let j = i + 1; j < n; j++) {
            if (candles[j].close < C) break;
            if (candles[j].close > rightPeak) rightPeak = candles[j].close;
        }
        prom[i] = Math.min(leftPeak, rightPeak) - C;
    }
    return prom;
}

// Для пиков: барьер — самый низкий close до более высокого close с каждой стороны.
async function computePeakProminence(candles) {
    const n = candles.length;
    const prom = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        const C = candles[i].close;
        let leftValley = C;
        for (let j = i - 1; j >= 0; j--) {
            if (candles[j].close > C) break;
            if (candles[j].close < leftValley) leftValley = candles[j].close;
        }
        let rightValley = C;
        for (let j = i + 1; j < n; j++) {
            if (candles[j].close > C) break;
            if (candles[j].close < rightValley) rightValley = candles[j].close;
        }
        prom[i] = C - Math.max(leftValley, rightValley);
    }
    return prom;
}

module.exports = { computeTroughProminence, computePeakProminence };
