const { addContracts, handleAddContractsMessage, handleSymbolCallback, handleIntervalCallback } = require('./addContracts');
const {cleanTableContracts} = require('./clean_table_contracts');
const { runScript } = require('./run_script');

// const { showTrackingContracts } = require('./showTrackingContracts');

const registerCommands = (bot) => {
  bot.command('add', addContracts);
  bot.command('remove', cleanTableContracts);
  bot.command('run', runScript);
  
  // Регистрируем обработчики callback для inline кнопок
  bot.action(/^symbol_/, handleSymbolCallback);
  bot.action(/^interval_/, handleIntervalCallback);
  
  bot.on('text', handleAddContractsMessage);
  console.log('Commands registered successfully.');
};

module.exports = { registerCommands };
