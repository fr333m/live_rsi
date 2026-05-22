const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const { updateOHLC } = require('./updateOHLC_for_1m');
const priceTracker = require('../ws/wsClient');
const priceCache = require('../ws/priceCache');
const { aggregateLastCandle } = require('./updateOHLC');
const { saveLivePrice } = require('./save_live_price');
const extremumCache = require('../ws/extremumCache');
const { updateRSIfromCache } = require('./updateRSIcache');
const {
    runSearchSignal_for_1m,
    runSearchSignal_for_5m,
    runSearchSignal_for_15m,
    runSearchSignal_for_60m,
} = require('./run_search_signal');

const {
    runUpdateExtremum_for_1m,
    runUpdateExtremum_for_5m,
    runUpdateExtremum_for_15m,
    runUpdateExtremum_for_60m,
} = require('./update_extremum_on_cache');

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

// ====================== SCHEDULER ======================

function startAlignedScheduler() {
    async function onTick() {
        try {
            const now = new Date();
            console.log(`⏱ Tick at ${now.toISOString()}`);

            // const m = now.getMinutes();
            const m = now.getUTCMinutes();

            // Получаем уникальные символы один раз
            const [sym1, sym5, sym15, sym60] = await Promise.all([
                dbService.uniqueSymbol('tracking_contracts', '1'),
                dbService.uniqueSymbol('tracking_contracts', '5'),
                dbService.uniqueSymbol('tracking_contracts', '15'),
                dbService.uniqueSymbol('tracking_contracts', '60'),
            ]);

            // === 1-минутные задачи ===
            if (m % 1 === 0) {
                // await saveLivePrice();

                jobQueue.push(async () => {
                    if (!priceTracker.ws || priceTracker.ws.readyState !== 1) {
                        await priceTracker.start();
                    } else {
                        for (const symbol of sym1) {
                            await updateOHLC(symbol, '1', 60000);
                        }
                    }

                    // await calculationRSI('1');
                });
            }

            // === 5-минутные ===
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

            // === 15-минутные ===
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

            // === 60-минутные ===
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

            // Запускаем очередь
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

        // Следующая целая минута
        const delay = 60_000 - msSinceMinuteStart;

        setTimeout(onTick, delay);
    }

    scheduleNextTick();
}

setInterval(async () => {
    const now = Date.now();

    if (priceTracker.ws && priceTracker.ws.readyState === 1) {
        const tasks = [
            runSearchSignal_for_5m(now).catch((err) =>
                console.error('5m error:', err)
            ),
            runSearchSignal_for_15m(now).catch((err) =>
                console.error('15m error:', err)
            ),
            runSearchSignal_for_60m(now).catch((err) =>
                console.error('60m error:', err)
            ),
        ];

        await Promise.all(tasks);
    }
}, 7000);

// setInterval(async () => {
//     if (!priceTracker?.ws?.readyState === 1) return;

//     try {
//         const now = Date.now();
//         await Promise.all([
//             runSearchSignal_for_1m(now).catch(() => {}),
//             runSearchSignal_for_5m(now).catch(() => {}),
//             runSearchSignal_for_15m(now).catch(() => {}),
//             runSearchSignal_for_60m(now).catch(() => {}),
//         ]);
//     } catch (e) {
//         console.error('Signal error:', e);
//     }
// }, 5000);

// ====================== Отдельный интервал 5 сек ======================

module.exports = {
    startAlignedScheduler,
};
