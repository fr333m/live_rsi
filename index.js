const dbService = require('./src/db/index');
const { createBot } = require('./src/telegram/bot');
const { startAlignedScheduler } = require('./src/scheduler/index');

async function init() {
    await dbService.init();
}
init();

startAlignedScheduler();

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
        isBotRunning = false;
    });

process.once('SIGINT', () => {
    if (isBotRunning) bot.stop('SIGINT');
    else process.exit(0);
});

process.once('SIGTERM', () => {
    if (isBotRunning) bot.stop('SIGTERM');
    else process.exit(0);
});
