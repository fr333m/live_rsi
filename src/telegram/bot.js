const { Telegraf } = require('telegraf');
const config = require('../config/config');
const { registerCommands } = require('./commands/index');

const createBot = () => {
    if (!config.TELEGRAM_BOT_TOKEN) {
        throw new Error('BOT_TOKEN не найден в .env файле!');
    }

    const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

    registerCommands(bot);

    bot.start(async (ctx) => {
        await ctx.reply('Бот запущен. Используй /help для справки.');
    });

    bot.help(async (ctx) => {
        await ctx.reply('Используй команды из списка выше.');
    });

    bot.catch((err, ctx) => {
        console.error('❌ Ошибка бота:', err);
        ctx.reply('Произошла ошибка. Попробуйте позже.').catch(console.error);
    });

    return bot;
};

module.exports = { createBot };
