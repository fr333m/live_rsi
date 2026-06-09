const {
    addContracts,
    handleAddContractsMessage,
    handleSymbolCallback,
    handleIntervalCallback,
} = require('./addContracts');

const {
    cleanTable,
    handleCleanTableMessage,
    handleSymbolDeleteCallback,
    handleIntervalDelCallback,
} = require('./cleanTable');

const { cleanTableContracts } = require('./cleanAllContracts');
const { runScript } = require('./runScript');
const add35Contracts = require('./addBulkContracts');

const registerCommands = (bot) => {
    bot.command('add', addContracts);
    bot.command('remove_contract', cleanTable);
    bot.command('remove', cleanTableContracts);
    bot.command('run', runScript);
    bot.command('add_35_contracts', add35Contracts);

    bot.action(/^symbol_add_/, handleSymbolCallback);
    bot.action(/^interval_add_/, handleIntervalCallback);
    bot.action(/^symbol_delete_/, handleSymbolDeleteCallback);
    bot.action(/^interval_delete_/, handleIntervalDelCallback);

    bot.on('text', async (ctx, next) => {
        const text = ctx.message?.text?.trim();
        if (!text || text.startsWith('/')) return next();

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
