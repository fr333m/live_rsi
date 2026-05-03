const { Markup } = require('telegraf');

// Создание клавиатуры с кнопками для выбора контракта
const getContractsKeyboard = (contracts) => {
  const buttons = contracts.map((contract) =>
    Markup.button.callback(
      contract.symbol,
      `symbol_${contract.symbol}`
    )
  );

  // Разделяем кнопки по 2 в ряду
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }

  return Markup.inlineKeyboard(keyboard);
};

// Создание клавиатуры с интервалами
const getIntervalsKeyboard = () => {
  const intervals = ['1', '5', '15', '30', '1h', '4h'];
  
  const buttons = intervals.map((interval) =>
    Markup.button.callback(
      interval,
      `interval_${interval}`
    )
  );

  // Разделяем кнопки по 3 в ряду
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 3) {
    keyboard.push(buttons.slice(i, i + 3));
  }

  return Markup.inlineKeyboard(keyboard);
};

module.exports = {
  getContractsKeyboard,
  getIntervalsKeyboard
};
