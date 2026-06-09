const dbService = require('../db/index');
const { findSignal } = require('./findSignal');
const { INTERVALS } = require('../config/constants');

async function runSearchSignalForInterval(interval, currentTime) {
    const symbols = await dbService.uniqueSymbol('tracking_contracts', interval);
    for (const symbol of symbols) {
        await findSignal(symbol, interval, currentTime);
    }
}

async function runSearchSignal_for_1m(currentTime) {
    return runSearchSignalForInterval('1', currentTime);
}

async function runSearchSignal_for_5m(currentTime) {
    return runSearchSignalForInterval('5', currentTime);
}

async function runSearchSignal_for_15m(currentTime) {
    return runSearchSignalForInterval('15', currentTime);
}

async function runSearchSignal_for_60m(currentTime) {
    return runSearchSignalForInterval('60', currentTime);
}

module.exports = {
    runSearchSignalForInterval,
    runSearchSignal_for_1m,
    runSearchSignal_for_5m,
    runSearchSignal_for_15m,
    runSearchSignal_for_60m,
};
