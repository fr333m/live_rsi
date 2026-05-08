const  {priceTracker} = require('./src/ws/wsClient');
const PostgresDB = require('./src/db/db');
const dbService = new PostgresDB();
const BybitClient = require('./src/rest/bybitRest');
const bybitClient = new BybitClient();
const { createBot } = require('./src/bot/bot');
const {updateOHLC} = require('./src/signals/updateOHLC');
const { startAlignedScheduler } = require('./src/signals/startAlignedScheduler');
const { getMinimaPeaksPriceContracts } = require('./src/bot/add_contracts/get_minima_peaks_contracts');
const { getPeaksPriceContracts } = require('./src/bot/add_contracts/get_peaks_price_contract');
const { findSignal } = require('./src/signals/find_signal');
const {runSearchSignal} = require('./src/signals/run_search_signal');

async function postgresInit(){
    await dbService.init();
}
postgresInit();




async function printTable(){
     await dbService.printTable('control_send_signal');
     const ohlcData = await dbService.getCandles('LABUSDT', '1', 'tracking_contracts', 400);
     console.log(ohlcData);
    //  const candles = await dbService.getCandles('TONUSDT', '1', 'tracking_contracts', 200)
    // //  const arrSlice = candles.slice(150, candles.length - 3);
    // const currentPrice = await dbService.getLastMinutePrices('TONUSDT');
    // const lastpriceData = await dbService.getLivePricesBySymbol('LABUSDT');
    //  console.log(lastpriceData);
}
// printTable();


setInterval(async () => {
    await runSearchSignal();
}, 1000);

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