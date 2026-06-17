const RELATIVE_THRESHOLDS = {
    veryLow: 0.1, // ratio < 0.1   -> veryLow
    low: 0.3, // ratio < 0.3   -> low
    mid: 0.5, // ratio < 0.5   -> mid
    high: 0.8, // ratio < 0.8   -> high
    midHigh: 1.2, // ratio < 1.2   -> midHigh
    upMidleHigh: 1.6, // ratio < 1.6   -> upMidleHigh
    veryHigh: 2, // ratio < 2.0   -> veryHigh

    // ratio >= 2.0 -> extreme
};

const SIGNAL_MULTIPLIERS = {
    1: {
        veryLow: 0.15,
        low: 0.2,
        mid: 0.3,
        high: 0.5,
        midHigh: 0.8,
        upMidleHigh: 1.2,
        veryHigh: 1.8,
        extreme: 2.5,
    },
    3: {
        veryLow: 0.15,
        low: 0.25,
        mid: 0.4,
        high: 0.5,
        midHigh: 0.8,
        upMidleHigh: 1.2,
        veryHigh: 1.8,
        extreme: 2.0,
    },
    5: {
        veryLow: 0.15,
        low: 0.3,
        mid: 0.5,
        high: 0.8,
        midHigh: 1.2,
        upMidleHigh: 1.6,
        veryHigh: 2.2,
        extreme: 3.0,
    },
    15: {
        veryLow: 0.2,
        low: 0.35,
        mid: 0.6,
        high: 1.0,
        midHigh: 1.4,
        upMidleHigh: 1.6,
        veryHigh: 1.8,
        extreme: 2.0,
    },
    30: {
        veryLow: 0.35,
        low: 0.7,
        mid: 1.3,
        high: 2.4,
        midHigh: 2.87,
        upMidleHigh: 3.33,
        veryHigh: 3.8,
        extreme: 4.27,
    },
    60: {
        veryLow: 0.4,
        low: 0.5,
        mid: 0.8,
        high: 1.2,
        midHigh: 1.4,
        upMidleHigh: 1.8,
        veryHigh: 2.2,
        extreme: 3.0,
    },
    240: {
        veryLow: 0.4,
        low: 0.85,
        mid: 1.6,
        high: 2.8,
        midHigh: 3.37,
        upMidleHigh: 3.93,
        veryHigh: 4.5,
        extreme: 5.07,
    },
    D: {
        veryLow: 0.5,
        low: 1.1,
        mid: 2.0,
        high: 3.5,
        midHigh: 4.33,
        upMidleHigh: 5.17,
        veryHigh: 6.0,
        extreme: 6.83,
    },
};

function levelPriceDiff(volPrecent, interval) {
    if (volPrecent < RELATIVE_THRESHOLDS.veryLow)
        return SIGNAL_MULTIPLIERS[interval].veryLow;
    if (volPrecent < RELATIVE_THRESHOLDS.low)
        return SIGNAL_MULTIPLIERS[interval].low;
    if (volPrecent < RELATIVE_THRESHOLDS.mid)
        return SIGNAL_MULTIPLIERS[interval].mid;
    if (volPrecent < RELATIVE_THRESHOLDS.high)
        return SIGNAL_MULTIPLIERS[interval].high;
    if (volPrecent < RELATIVE_THRESHOLDS.midHigh)
        return SIGNAL_MULTIPLIERS[interval].midHigh;
    if (volPrecent < RELATIVE_THRESHOLDS.upMidleHigh)
        return SIGNAL_MULTIPLIERS[interval].upMidleHigh;
    if (volPrecent < RELATIVE_THRESHOLDS.veryHigh)
        return SIGNAL_MULTIPLIERS[interval].veryHigh;

    if (volPrecent >= 2) return SIGNAL_MULTIPLIERS[interval].extreme;
}

module.exports = {
    levelPriceDiff,
};
