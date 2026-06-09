const logger = require('../../utils/logger');
const { WizardHandler } = require('./common/wizardCore');
const cleanConfig = require('./common/cleanTableConfig');

const handler = new WizardHandler(cleanConfig);

const cleanTable = async (ctx) => {
    logger.info(`[cleanTable] Команда /remove_contract от пользователя ${ctx.from?.id}`);
    try {
        await handler.start(ctx);
    } catch (error) {
        logger.error('[cleanTable] Ошибка:', error);
    }
};

const handleCleanTableMessage = async (ctx) => {
    try {
        await handler.handleMessage(ctx);
    } catch (error) {
        logger.error('[handleCleanTableMessage] Ошибка:', error);
    }
};

const handleIntervalDelCallback = async (ctx) => {
    try {
        await handler.handleCallback(ctx);
    } catch (error) {
        logger.error('[handleIntervalDelCallback] Ошибка:', error);
    }
};

const handleSymbolDeleteCallback = async (ctx) => {
    try {
        await handler.handleCallback(ctx);
    } catch (error) {
        logger.error('[handleSymbolDeleteCallback] Ошибка:', error);
    }
};

module.exports = {
    cleanTable,
    handleCleanTableMessage,
    handleSymbolDeleteCallback,
    handleIntervalDelCallback,
};
