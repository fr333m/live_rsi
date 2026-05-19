const { priceTracker } = require('./src/ws/wsClient');
const PostgresDB = require('./src/db/db');
const dbService = new PostgresDB();
const BybitClient = require('./src/rest/bybitRest');
const bybitClient = new BybitClient();
const { createBot } = require('./src/bot/bot');
const { updateOHLC } = require('./src/signals/updateOHLC');
const {
    startAlignedScheduler,
} = require('./src/signals/startAlignedScheduler');
const {
    getMinimaPeaksPriceContracts,
} = require('./src/bot/add_contracts/get_minima_peaks_contracts');
const {
    getPeaksPriceContracts,
} = require('./src/bot/add_contracts/get_peaks_price_contract');
const { findSignal } = require('./src/signals/find_signal');
const { runSearchSignal } = require('./src/signals/run_search_signal');
const priceCache = require('./src/ws/priceCache');
const { getVolatilityLevel } = require('./src/signals/rsi/getVolatilityLevel');

async function postgresInit() {
    await dbService.init();
}
postgresInit();

async function printTable() {
    // const lastpriceData = priceCache.getLast('SOLUSDT');
    // const lastprice = lastpriceData.lastprice;
    // const candles = priceCache.getLast('SOLUSDT');
    const contracts = await dbService.uniqueSymbol('tracking_contracts');

    console.log(contracts.length);

    // await dbService.printTable('tracking_contracts', 100);
    // const ohlcData = await dbService.getCandles(
    //     'DOGEUSDT',
    //     '5',
    //     'tracking_contracts',
    //     300000
    // );
    // console.log('Последняя цена для DOGEUSDT:', lastPrice);
    // console.log(ohlcData);
    // const row = await dbService.checkRowForTypeSignal('ADAUSDT', '1', 'double_top', 'control_send_signal', 1778591460000);
    // console.log(typeof row.timestamp);

    //  const candles = await dbService.getCandles('TONUSDT', '1', 'tracking_contracts', 200)
    // //  const arrSlice = candles.slice(150, candles.length - 3);
    // const currentPrice = await dbService.getLastMinutePrices('TONUSDT');
    // const lastpriceData = await dbService.getLivePricesBySymbol('LABUSDT');
    //  console.log(lastpriceData);
}
// printTable();

// async function test() {
//     const uniqueSymbols = await dbService.uniqueSymbol('tracking_contracts');

//     for (const symbol of uniqueSymbols) {
//         const candles = await dbService.getCandles(
//             symbol,
//             '5',
//             'tracking_contracts',
//             300
//         );
//         const volatilityLevel = getVolatilityLevel(candles);
//         console.log(
//             `[${symbol}] Уровень волатильности: ${volatilityLevel.volatilityPercent}`
//         );
//     }
// }
// test();

startAlignedScheduler();

console.log('🚀 Запуск бота...');

const bot = createBot();
let isBotRunning = false;

bot.launch()
    .then(() => {
        isBotRunning = true;
        console.log('✅ Бот успешно запущен!');
        console.log('📌 Используй /start для проверки');
    })
    .catch((err) => {
        console.error('❌ Ошибка при запуске бота:', err);
        console.error('⚠️ Проверьте:');
        console.error('   1. Интернет соединение');
        console.error('   2. Токен Telegram бота (config/config.js)');
        console.error('   3. Доступность Telegram API');
        isBotRunning = false;
    });

// Graceful shutdown
process.once('SIGINT', () => {
    if (isBotRunning) {
        bot.stop('SIGINT');
    } else {
        console.log('⚠️ Бот не был запущен, завершение процесса...');
        process.exit(0);
    }
});
process.once('SIGTERM', () => {
    if (isBotRunning) {
        bot.stop('SIGTERM');
    } else {
        console.log('⚠️ Бот не был запущен, завершение процесса...');
        process.exit(0);
    }
});

// setInterval(async () => {
//     const cache = await priceCache.flush();
//     console.log('Кэш цен:', cache);
// }, 10000);

// test();

// setInterval(async () => {
//     await runSearchSignal();
// }, 1000);
