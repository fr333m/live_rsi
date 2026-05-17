const { Markup } = require('telegraf');

/**
 * Клавиатура для выбора контракта
 * @param {Array} contracts - массив контрактов
 * @param {string} mode - 'add' или 'delete' (для разных действий)
 */
const getContractsKeyboard = (contracts, mode = 'add') => {
    const prefix = mode === 'delete' ? 'symbol_delete_' : 'symbol_add_';

    const buttons = contracts.map((contract) =>
        Markup.button.callback(contract.symbol, `${prefix}${contract.symbol}`)
    );

    // Кнопки по 2 в ряд
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
        keyboard.push(buttons.slice(i, i + 2));
    }

    return Markup.inlineKeyboard(keyboard);
};

/**
 * Клавиатура для выбора таймфрейма
 * @param {string} mode - 'add' или 'delete'
 */
const getIntervalsKeyboard = (mode = 'add') => {
    const prefix = mode === 'delete' ? 'interval_delete_' : 'interval_add_';

    const intervals = ['1', '5', '15', '30', '60', '240'];

    const buttons = intervals.map((interval) =>
        Markup.button.callback(interval, `${prefix}${interval}`)
    );

    // Кнопки по 3 в ряд
    const keyboard = [];
    for (let i = 0; i < buttons.length; i += 3) {
        keyboard.push(buttons.slice(i, i + 3));
    }

    return Markup.inlineKeyboard(keyboard);
};

module.exports = {
    getContractsKeyboard,
    getIntervalsKeyboard,
};
