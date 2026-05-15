// ====================== РЕГИСТРАЦИЯ КОМАНД ======================

const {
    addContracts,
    handleAddContractsMessage,
    handleSymbolCallback,
    handleIntervalCallback,
} = require('./handlers/addContracts');

const {
    cleanTable,
    handleCleanTableMessage,
    handleSymbolDeleteCallback,
    handleIntervalDelCallback,
} = require('./handlers/cleanTable');

const { cleanTableContracts } = require('./clean_table_contracts');
const { runScript } = require('./run_script');
const add35Contracts = require('./add_35_contracts');

// const { showtracking_contracts } = require('./handlers/showtracking_contracts');

const registerCommands = (bot) => {
    // ==================== КОМАНДЫ ====================
    bot.command('add', addContracts);
    bot.command('remove_contract', cleanTable); // основной сценарий очистки
    bot.command('remove', cleanTableContracts); // альтернативный вариант очистки
    bot.command('run', runScript);
    bot.command('add_35_contracts', add35Contracts);

    // ==================== CALLBACK ЗАПРОСЫ (inline-кнопки) ====================

    // Добавление контракта
    bot.action(/^symbol_add_/, handleSymbolCallback);
    bot.action(/^interval_add_/, handleIntervalCallback);

    // Очистка контракта
    bot.action(/^symbol_delete_/, handleSymbolDeleteCallback); // рекомендуется переименовать префикс
    bot.action(/^interval_delete_/, handleIntervalDelCallback); // рекомендуется переименовать префикс

    // Если хочешь оставить старые префиксы (symbol_ и interval_), можно объединить:
    // bot.action(/^symbol_/, (ctx) => {
    //     if (ctx.callbackQuery.data.includes('delete')) {
    //         return handleSymbolDeleteCallback(ctx);
    //     }
    //     return handleSymbolCallback(ctx);
    // });

    // ==================== ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ ====================

    // Один обработчик на все текстовые сообщения (важно!)
    bot.on('text', async (ctx, next) => {
        const text = ctx.message?.text?.trim();

        // Пропускаем команды (они обрабатываются выше)
        if (!text || text.startsWith('/')) {
            return next();
        }

        // Простой способ: пробуем оба обработчика
        try {
            await handleAddContractsMessage(ctx);
            await handleCleanTableMessage(ctx);
        } catch (err) {
            console.error('Error in text handler:', err);
        }

        return next();
    });

    console.log('✅ Все команды и обработчики успешно зарегистрированы.');
};

module.exports = { registerCommands };
