const rsiCache = require('../../cache/rsiCache');

const MIN_AGE_BARS = 10;

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
    return buildClusters(aged, 'highPrice', atr);
}

function clusterMinima(minima, symbol, interval) {
    if (!minima || minima.length === 0) return [];
    const aged = filterByAge(minima);
    if (aged.length === 0) return [];
    const atr = rsiCache.get(symbol, interval)?.atr;
    if (!atr) return aged;
    return buildClusters(aged, 'lowPrice', atr);
}

module.exports = { clusterMaxima, clusterMinima };
