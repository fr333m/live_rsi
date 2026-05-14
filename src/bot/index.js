const {
    addContracts,
    handleAddContractsMessage,
    handleSymbolCallback,
    handleIntervalCallback,
} = require('./addContracts');
const { cleanTableContracts } = require('./clean_table_contracts');
const { runScript } = require('./run_script');
const add35Contracts = require('./add_35_contracts');

// const { showtracking_contracts } = require('./showtracking_contracts');

const registerCommands = (bot) => {
    bot.command('add', addContracts);
    bot.command('remove', cleanTableContracts);
    bot.command('run', runScript);
    bot.command('add_35_contracts', add35Contracts);

    // Регистрируем обработчики callback для inline кнопок
    bot.action(/^symbol_/, handleSymbolCallback);
    bot.action(/^interval_/, handleIntervalCallback);

    bot.on('text', handleAddContractsMessage);
    console.log('Commands registered successfully.');
};

module.exports = { registerCommands };
