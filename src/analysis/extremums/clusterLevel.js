const MIN_AGE_BARS = 10;

function filterByAge(levels) {
    if (levels.length === 0) return [];
    const maxIndex = Math.max(...levels.map((l) => l.index));
    return levels.filter((l) => maxIndex - l.index >= MIN_AGE_BARS);
}

function clusterMaxima(maxima) {
    if (!maxima || maxima.length === 0) return [];
    return filterByAge(maxima);
}

function clusterMinima(minima) {
    if (!minima || minima.length === 0) return [];
    return filterByAge(minima);
}

module.exports = { clusterMaxima, clusterMinima };
