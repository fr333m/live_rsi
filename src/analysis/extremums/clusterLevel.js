const MIN_AGE_BARS = 15;

function filterByAge(levels) {
    if (levels.length === 0) return [];
    const maxIndex = Math.max(...levels.map((l) => l.index));
    return levels.filter((l) => maxIndex - l.index >= MIN_AGE_BARS);
}

// Keeps a subsequence where, from newest to oldest, highPrice is strictly ascending
// (i.e., lower highs over time)
function filterDescendingHighs(maxima) {
    if (maxima.length === 0) return [];
    const result = [maxima[maxima.length - 1]];
    let threshold = result[0].highPrice;
    for (let i = maxima.length - 2; i >= 0; i--) {
        if (maxima[i].highPrice > threshold) {
            result.unshift(maxima[i]);
            threshold = maxima[i].highPrice;
        }
    }
    return result;
}

// Keeps a subsequence where, from newest to oldest, lowPrice is strictly descending
// (i.e., higher lows over time)
function filterAscendingLows(minima) {
    if (minima.length === 0) return [];
    const result = [minima[minima.length - 1]];
    let threshold = result[0].lowPrice;
    for (let i = minima.length - 2; i >= 0; i--) {
        if (minima[i].lowPrice < threshold) {
            result.unshift(minima[i]);
            threshold = minima[i].lowPrice;
        }
    }
    return result;
}

function clusterMaxima(maxima) {
    if (!maxima || maxima.length === 0) return [];
    return filterDescendingHighs(filterByAge(maxima));
}

function clusterMinima(minima) {
    if (!minima || minima.length === 0) return [];
    return filterAscendingLows(filterByAge(minima));
}

module.exports = { clusterMaxima, clusterMinima };
