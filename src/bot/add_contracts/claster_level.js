const rsiCache = require('../../ws/cacheRSI');

// Two levels belong to the same cluster if their price difference < ATR * ATR_FACTOR
const ATR_FACTOR = 0.5;

// Minimum bar distance from the most recent fractal to consider a level valid
const MIN_AGE_BARS = 15;

function filterByAge(levels) {
    if (levels.length === 0) return [];
    const maxIndex = Math.max(...levels.map((l) => l.index));
    return levels.filter((l) => maxIndex - l.index >= MIN_AGE_BARS);
}

function buildClusters(levels, priceKey, threshold) {
    const sorted = [...levels].sort((a, b) => a[priceKey] - b[priceKey]);
    const clusters = [];
    let current = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const seed = current[0][priceKey];
        if (Math.abs(sorted[i][priceKey] - seed) <= threshold) {
            current.push(sorted[i]);
        } else {
            clusters.push(current);
            current = [sorted[i]];
        }
    }
    clusters.push(current);

    return clusters.map((cluster) => {
        const avgPrice =
            cluster.reduce((s, l) => s + l[priceKey], 0) / cluster.length;
        // use most recent level as the base object, override price with cluster center
        const representative = cluster.reduce((a, b) =>
            b.timestamp > a.timestamp ? b : a
        );

        return {
            ...representative,
            [priceKey]: avgPrice,
            closePrice: avgPrice,
            strength: cluster.length,
        };
    });
}

function clusterMaxima(maxima, symbol, interval) {
    if (!maxima || maxima.length === 0) return [];
    const aged = filterByAge(maxima);
    if (aged.length === 0) return [];
    const atr = rsiCache.get(symbol, interval)?.atr;
    if (!atr) return aged;
    return buildClusters(aged, 'highPrice', atr * ATR_FACTOR);
}

function clusterMinima(minima, symbol, interval) {
    if (!minima || minima.length === 0) return [];
    const aged = filterByAge(minima);
    if (aged.length === 0) return [];
    const atr = rsiCache.get(symbol, interval)?.atr;
    if (!atr) return aged;
    return buildClusters(aged, 'lowPrice', atr * ATR_FACTOR);
}

module.exports = { clusterMaxima, clusterMinima };
