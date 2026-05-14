const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const { updateOHLC } = require('./updateOHLC');
const { priceTracker } = require('../ws/wsClient');
const { calculationRSI } = require('./rsi/rsi');
const { saveLivePrice } = require('./save_live_price');
const {
    runSearchSignal_for_1m,
    runSearchSignal_for_5m,
    runSearchSignal_for_15m,
} = require('./run_search_signal');

let isQueueRunning = false;
const jobQueue = [];

async function processQueue() {
    if (isQueueRunning) return;
    isQueueRunning = true;

    while (jobQueue.length > 0) {
        const job = jobQueue.shift();
        try {
            await job();
        } catch (err) {
            console.error('Job error:', err);
        }
    }

    isQueueRunning = false;
}

function startAlignedScheduler() {
    const step = 1;

    function scheduleNextTick() {
        const now = new Date();

        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const ms = now.getMilliseconds();

        const nextMinutes = step - (minutes % step);
        let delay = nextMinutes * 60 * 1000 - seconds * 1000 - ms;

        if (delay <= 0) {
            delay += step * 60 * 1000;
        }

        setTimeout(onTick, delay);
    }

    async function onTick() {
        let type = '';
        const [symbolUnique_1m, symbolUnique_5m, symbolUnique_15m] =
            await Promise.all([
                dbService.uniqueSymbol('tracking_contracts', '1'),
                dbService.uniqueSymbol('tracking_contracts', '5'),
                dbService.uniqueSymbol('tracking_contracts', '15'),
            ]);
        const now = new Date();
        const m = now.getMinutes();

        console.log(`вЏ± Tick at ${now.toISOString()}`);

        if (m % 1 === 0) {
            await saveLivePrice();
        }

        if (m % 1 === 0 && symbolUnique_1m.length > 0) {
            jobQueue.push(async () => {
                if (priceTracker.ws && priceTracker.ws.readyState === 1) {
                    await Promise.all(
                        symbolUnique_1m.map((symbol) =>
                            updateOHLC(symbol, '1', 60000)
                        )
                    );
                    await runSearchSignal_for_1m(60000);
                } else {
                    await priceTracker.start();
                }
                // await calculationRSI('1');
            });
        }

        if (m % 5 === 0 && symbolUnique_5m.length > 0) {
            jobQueue.push(async () => {
                if (priceTracker.ws && priceTracker.ws.readyState === 1) {
                    await Promise.all(
                        symbolUnique_5m.map((symbol) =>
                            updateOHLC(symbol, '5', 300000)
                        )
                    );
                    await runSearchSignal_for_5m(300000);
                } else {
                    await priceTracker.start();
                }
            });
        }

        if (m % 15 === 0 && symbolUnique_15m.length > 0) {
            jobQueue.push(async () => {
                if (priceTracker.ws && priceTracker.ws.readyState === 1) {
                    await Promise.all(
                        symbolUnique_15m.map((symbol) =>
                            updateOHLC(symbol, '15', 900000)
                        )
                    );
                    await runSearchSignal_for_15m(900000);
                } else {
                    await priceTracker.start();
                }
            });
        }

        await processQueue();

        scheduleNextTick();
    }

    async function processQueue() {
        const promises = jobQueue.map((job) =>
            job().catch((err) => console.error('Job error:', err))
        );
        jobQueue.length = 0;
        await Promise.all(promises);
    }

    scheduleNextTick();
}

module.exports = {
    startAlignedScheduler,
};
