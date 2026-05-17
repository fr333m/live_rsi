const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const priceTracker = require('../ws/wsClient');

const cleanTableContracts = async (ctx) => {
    try {
        await ctx.reply('⛔ Остановка скрипта...');

        // Динамический импорт для избежания циклической зависимости
        await dbService.removeDataTable('all_contracts_tracking');
        await dbService.removeDataTable('control_send_signal');
        await dbService.removeDataTable('tracking_contracts');
        await dbService.removeDataTable('live_prices');
        await priceTracker.refreshSubscriptions();
        await ctx.reply(`✅ Таблица all_contracts_tracking успешно очищена!`);
    } catch (error) {
        console.error('Ошибка в cleanTableContracts:', error);
        await ctx.reply('❌ Произошла ошибка при остановке скрипта.');
    }
};

module.exports = {
    cleanTableContracts,
};
