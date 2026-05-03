const { Telegraf } = require('telegraf');
const config = require('../config/config');
const { registerCommands } = require('./index');
const TELEGRAM_BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = config.TELEGRAM_CHAT_ID;


const createBot = () => {
    if (!TELEGRAM_BOT_TOKEN) {
        throw new Error('BOT_TOKEN не найден в .env файле!');
    }

    const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

    // Регистрируем все команды
    registerCommands(bot);

    // Команда /start
    bot.start(async (ctx) => {
        await ctx.reply();
    });

    // Команда /help
    bot.help(async (ctx) => {
        await ctx.reply('Используй команды из списка выше.');
    });

    // Глобальная обработка ошибок
    bot.catch((err, ctx) => {
        console.error('❌ Ошибка бота:', err);
        ctx.reply('Произошла ошибка. Попробуйте позже.').catch(console.error);
    });

    // bot.on('callback_query', handleCallbackQuery);

    return bot;
};

module.exports = { createBot };