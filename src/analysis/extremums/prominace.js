// prominence.js
// Для впадин: барьер — самый высокий high до более глубокого low с каждой стороны.
async function computeTroughProminence(candles) {
    const n = candles.length;
    const prom = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        const L = candles[i].low;
        let leftPeak = L;
        for (let j = i - 1; j >= 0; j--) {
            if (candles[j].low < L) break; // дошли до более глубокого low
            if (candles[j].high > leftPeak) leftPeak = candles[j].high;
        }
        let rightPeak = L;
        for (let j = i + 1; j < n; j++) {
            if (candles[j].low < L) break;
            if (candles[j].high > rightPeak) rightPeak = candles[j].high;
        }
        prom[i] = Math.min(leftPeak, rightPeak) - L; // 0 для не-впадин
    }
    return prom;
}

// Для пиков: зеркало — барьер это самый низкий low до более высокого high.
async function computePeakProminence(candles) {
    const n = candles.length;
    const prom = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        const H = candles[i].high;
        let leftValley = H;
        for (let j = i - 1; j >= 0; j--) {
            if (candles[j].high > H) break;
            if (candles[j].low < leftValley) leftValley = candles[j].low;
        }
        let rightValley = H;
        for (let j = i + 1; j < n; j++) {
            if (candles[j].high > H) break;
            if (candles[j].low < rightValley) rightValley = candles[j].low;
        }
        prom[i] = H - Math.max(leftValley, rightValley);
    }
    return prom;
}

module.exports = { computeTroughProminence, computePeakProminence };
