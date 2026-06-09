const dbService = require('../../db/index');
const priceTracker = require('../../ws/priceTracker');

const cleanTableContracts = async (ctx) => {
    try {
        await ctx.reply('⛔ Очистка таблиц...');

        await dbService.removeDataTable('all_contracts_tracking');
        await dbService.removeDataTable('control_send_signal');
        await dbService.removeDataTable('tracking_contracts');
        await dbService.removeDataTable('live_prices');
        await priceTracker.reload();

        await ctx.reply('✅ Все таблицы успешно очищены!');
    } catch (error) {
        console.error('Ошибка в cleanTableContracts:', error);
        await ctx.reply('❌ Произошла ошибка при очистке.');
    }
};

module.exports = { cleanTableContracts };
