const dbService = require('../db/index');
const { updateOHLC } = require('../data/updateOHLC');
const { aggregateLastCandle } = require('../data/aggregateOHLC');
const { updateRSIfromCache } = require('../data/updateRSI');
const {
    runUpdateExtremum_for_1m,
    runUpdateExtremum_for_5m,
    runUpdateExtremum_for_15m,
    runUpdateExtremum_for_60m,
} = require('../data/updateExtremums');
const {
    runSearchSignal_for_1m,
    runSearchSignal_for_5m,
    runSearchSignal_for_15m,
    runSearchSignal_for_60m,
} = require('../signals/searchRunner');
const priceTracker = require('../ws/priceTracker');

let isQueueRunning = false;
const jobQueue = [];

async function processQueue() {
    if (isQueueRunning) return;
    isQueueRunning = true;

    try {
        while (jobQueue.length > 0) {
            const job = jobQueue.shift();
            try {
                await job();
            } catch (err) {
                console.error('Job error:', err);
            }
        }
    } finally {
        isQueueRunning = false;
    }
}

function startAlignedScheduler() {
    async function onTick() {
        try {
            const now = new Date();
            console.log(`⏱ Tick at ${now.toISOString()}`);

            const m = now.getUTCMinutes();

            const [sym1, sym5, sym15, sym60] = await Promise.all([
                dbService.uniqueSymbol('tracking_contracts', '1'),
                dbService.uniqueSymbol('tracking_contracts', '5'),
                dbService.uniqueSymbol('tracking_contracts', '15'),
                dbService.uniqueSymbol('tracking_contracts', '60'),
            ]);

            if (m % 1 === 0 && sym1.length) {
                jobQueue.push(async () => {
                    if (!priceTracker.ws || priceTracker.ws.readyState !== 1) {
                        await priceTracker.start();
                    } else {
                        for (const symbol of sym1) {
                            await updateOHLC(symbol, '1');
                        }
                        await runUpdateExtremum_for_1m();
                        await updateRSIfromCache('1');
                    }
                });
            }

            if (m % 5 === 0 && sym5.length) {
                jobQueue.push(async () => {
                    if (!priceTracker.ws || priceTracker.ws.readyState !== 1) {
                        await priceTracker.start();
                    } else {
                        for (const symbol of sym5) {
                            await aggregateLastCandle(symbol, '5');
                        }
                        await runUpdateExtremum_for_5m();
                        await updateRSIfromCache('5');
                    }
                });
            }

            if (m % 15 === 0 && sym15.length) {
                jobQueue.push(async () => {
                    if (!priceTracker.ws || priceTracker.ws.readyState !== 1) {
                        await priceTracker.start();
                    } else {
                        for (const symbol of sym15) {
                            await aggregateLastCandle(symbol, '15');
                        }
                        await runUpdateExtremum_for_15m();
                        await updateRSIfromCache('15');
                    }
                });
            }

            if (m % 60 === 0 && sym60.length) {
                jobQueue.push(async () => {
                    if (!priceTracker.ws || priceTracker.ws.readyState !== 1) {
                        await priceTracker.start();
                    } else {
                        for (const symbol of sym60) {
                            await aggregateLastCandle(symbol, '60');
                        }
                        await runUpdateExtremum_for_60m();
                        await updateRSIfromCache('60');
                    }
                });
            }

            await processQueue();
        } catch (err) {
            console.error('onTick error:', err);
        } finally {
            scheduleNextTick();
        }
    }

    function scheduleNextTick() {
        const now = new Date();
        const msSinceMinuteStart =
            now.getSeconds() * 1000 + now.getMilliseconds();
        const delay = 60_000 - msSinceMinuteStart;
        setTimeout(onTick, delay);
    }

    scheduleNextTick();

    setInterval(async () => {
        const now = Date.now();

        if (priceTracker.ws && priceTracker.ws.readyState === 1) {
            await Promise.all([
                runSearchSignal_for_1m(now).catch((err) =>
                    console.error('1m signal error:', err)
                ),
                runSearchSignal_for_5m(now).catch((err) =>
                    console.error('5m signal error:', err)
                ),
                runSearchSignal_for_15m(now).catch((err) =>
                    console.error('15m signal error:', err)
                ),
                runSearchSignal_for_60m(now).catch((err) =>
                    console.error('60m signal error:', err)
                ),
            ]);
        }
    }, 7000);
}

module.exports = { startAlignedScheduler };
