const priceTracker = require('../ws/wsClient');

const runScript = async (ctx) => {
    try {
        await ctx.reply('⛔ Запуск скрипта...');

        // Динамический импорт для избежания циклической зависимости
        await priceTracker.start();
        await ctx.reply(`✅ Скрипт успешно запущен!`);
    } catch (error) {
        console.error('Ошибка в runScript:', error);
        await ctx.reply('❌ Произошла ошибка при запуске скрипта.');
    }
};

module.exports = {
    runScript,
};
