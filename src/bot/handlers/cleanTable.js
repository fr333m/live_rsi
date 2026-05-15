const logger = require('../../utils/logger');
const { WizardHandler } = require('./common/wizzardCore');
const cleanConfig = require('./common/cleanTableConfig');

const handler = new WizardHandler(cleanConfig);

const cleanTable = async (ctx) => {
    logger.info(
        `[cleanTable] Команда /remove_contract получена от пользователя ${ctx.from?.id}`
    );
    try {
        await handler.start(ctx);
    } catch (error) {
        logger.error('[cleanTable] Ошибка при запуске handler:', error);
    }
};

const handleCleanTableMessage = async (ctx) => {
    logger.debug(
        `[handleCleanTableMessage] Обработка текстового сообщения от пользователя ${ctx.from?.id}`
    );
    try {
        await handler.handleMessage(ctx);
    } catch (error) {
        logger.error(
            '[handleCleanTableMessage] Ошибка при обработке сообщения:',
            error
        );
    }
};

const handleIntervalDelCallback = async (ctx) => {
    logger.debug(
        `[handleIntervalDelCallback] Callback по интервалу удаления: ${ctx.callbackQuery?.data}`
    );
    try {
        await handler.handleCallback(ctx);
    } catch (error) {
        logger.error(
            '[handleIntervalDelCallback] Ошибка при обработке callback:',
            error
        );
    }
};

const handleSymbolDeleteCallback = async (ctx) => {
    logger.debug(
        `[handleSymbolDeleteCallback] Callback по удалению символа: ${ctx.callbackQuery?.data}`
    );
    try {
        await handler.handleCallback(ctx);
    } catch (error) {
        logger.error(
            '[handleSymbolDeleteCallback] Ошибка при обработке callback:',
            error
        );
    }
};

module.exports = {
    cleanTable,
    handleCleanTableMessage,
    handleSymbolDeleteCallback,
    handleIntervalDelCallback,
};
