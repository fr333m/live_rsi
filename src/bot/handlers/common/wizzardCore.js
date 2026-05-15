const logger = require('../../../utils/logger');
const userStates = new Map();

// Общие утилиты
const getUserId = (ctx) => ctx.from?.id;
const getMessageText = (ctx) => ctx.message?.text?.trim() || '';

const resetUserState = (userId) => {
    userStates.delete(userId);
};

// TTL состояния — 15 минут
const STATE_TTL = 15 * 60 * 1000;

const setUserState = (userId, state) => {
    state.expiresAt = Date.now() + STATE_TTL;
    userStates.set(userId, state);
};

const getUserState = (userId) => {
    const state = userStates.get(userId);
    if (!state) return null;

    if (Date.now() > state.expiresAt) {
        userStates.delete(userId);
        return null;
    }
    return state;
};

// ====================== ОСНОВНОЙ КЛАСС ======================

class WizardHandler {
    constructor(config) {
        this.config = config;
    }

    async start(ctx) {
        const userId = getUserId(ctx);
        logger.info(
            `[WizardHandler.start] userId=${userId}, config=${this.config.name}`
        );

        if (!userId) {
            logger.warn(
                '[WizardHandler.start] Не удалось определить пользователя'
            );
            await ctx.reply('Не удалось определить пользователя.');
            return;
        }

        setUserState(userId, {
            step: this.config.initialStep,
            data: {},
            configName: this.config.name, // 'add' или 'clean'
        });

        logger.info(
            `[WizardHandler.start] Инициализирован ${this.config.name}-сценарий для пользователя ${userId}, начальный шаг: ${this.config.initialStep}`
        );
        await this.config.askFunctions[this.config.initialStep](ctx);
    }

    async handleCallback(ctx) {
        const userId = getUserId(ctx);
        const callbackData = ctx.callbackQuery?.data;
        logger.info(
            `[WizardHandler.handleCallback] userId=${userId}, data=${callbackData}`
        );

        if (!userId) {
            logger.warn(
                '[WizardHandler.handleCallback] Не удалось определить пользователя'
            );
            return;
        }

        let state = getUserState(userId);
        if (!state) {
            logger.warn(
                `[WizardHandler.handleCallback] Сессия истекла для пользователя ${userId}`
            );
            await ctx.reply('Сессия истекла. Начните заново.');
            return;
        }

        const data = callbackData;

        // ==================== SYMBOL ====================
        if (data.startsWith('symbol_add_')) {
            const symbol = data.replace('symbol_add_', '').toUpperCase();
            logger.info(
                `[WizardHandler.handleCallback] Выбран символ для добавления: ${symbol}`
            );
            state.data.symbol = symbol;
            state.step = 'interval';
        } else if (data.startsWith('symbol_delete_')) {
            const symbol = data.replace('symbol_delete_', '').toUpperCase();
            logger.info(
                `[WizardHandler.handleCallback] Выбран символ для удаления: ${symbol}`
            );
            state.data.symbol = symbol;

            // Для clean — после выбора символа сразу выполняем очистку
            if (state.configName === 'clean') {
                logger.info(
                    `[WizardHandler.handleCallback] Clean-сценарий: выполняется финальное действие для ${symbol}`
                );
                await this.config.finalAction(ctx, state.data);
                resetUserState(userId);
                await ctx.answerCbQuery();
                return;
            }
            state.step = 'interval';
        }

        // ==================== INTERVAL ====================
        else if (data.startsWith('interval_add_')) {
            const interval = data.replace('interval_add_', '');
            const normalized = this.normalizeInterval(interval);
            logger.info(
                `[WizardHandler.handleCallback] Выбран интервал для добавления: ${interval} -> ${normalized}`
            );
            state.data.interval = normalized;
            state.step = 'quantity';
        } else if (data.startsWith('interval_delete_')) {
            const interval = data.replace('interval_delete_', '');
            const normalized = this.normalizeInterval(interval);
            logger.info(
                `[WizardHandler.handleCallback] Выбран интервал для удаления: ${interval} -> ${normalized}`
            );
            state.data.interval = normalized;
            state.step = 'symbol'; // для clean-сценария
        } else {
            logger.warn(
                `[WizardHandler.handleCallback] Неизвестное действие: ${data}`
            );
            await ctx.answerCbQuery('Неизвестное действие');
            return;
        }

        setUserState(userId, state);
        await ctx.answerCbQuery();
        logger.info(
            `[WizardHandler.handleCallback] Переход на шаг: ${state.step} для пользователя ${userId}`
        );

        // Переход к следующему шагу
        const nextAskFn = this.config.askFunctions[state.step];
        if (nextAskFn) {
            logger.debug(
                `[WizardHandler.handleCallback] Вызов askFunction для шага ${state.step}`
            );
            // Для clean-сценария передаем интервал, для add-сценария передаем символ
            const paramValue =
                state.configName === 'clean'
                    ? state.data.interval
                    : state.data.symbol;
            await nextAskFn(ctx, paramValue);
        }
    }

    async handleMessage(ctx) {
        const userId = getUserId(ctx);
        const text = getMessageText(ctx);

        logger.debug(
            `[WizardHandler.handleMessage] userId=${userId}, text="${text}"`
        );

        if (!userId || !text || text.startsWith('/')) {
            logger.debug(
                '[WizardHandler.handleMessage] Пропущено: нет userId, текста или это команда'
            );
            return;
        }

        const state = getUserState(userId);
        if (!state) {
            logger.debug(
                `[WizardHandler.handleMessage] Нет состояния для пользователя ${userId}`
            );
            return;
        }

        const currentStep = state.step;
        logger.info(
            `[WizardHandler.handleMessage] Обработка текста на шаге: ${currentStep}`
        );

        const validator = this.config.validators[currentStep];
        const askAgainFn = this.config.askFunctions[currentStep];

        if (!validator) {
            logger.warn(
                `[WizardHandler.handleMessage] Валидатор не найден для шага: ${currentStep}`
            );
            return;
        }

        const result = validator(text);
        logger.debug(
            `[WizardHandler.handleMessage] Результат валидации для шага ${currentStep}: isValid=${result.isValid}`
        );

        if (!result.isValid) {
            logger.warn(
                `[WizardHandler.handleMessage] Ошибка валидации на шаге ${currentStep}: ${result.error}`
            );
            await ctx.reply(result.error);
            if (askAgainFn) {
                logger.debug(
                    `[WizardHandler.handleMessage] Повторный запрос для шага ${currentStep}`
                );
                // Для clean-сценария передаем интервал, для add-сценария передаем символ
                const paramValue =
                    state.configName === 'clean'
                        ? state.data.interval
                        : state.data.symbol;
                await askAgainFn(ctx, paramValue);
            }
            return;
        }

        // Сохраняем значение
        if (currentStep === 'symbol') {
            state.data.symbol = result.value;
            logger.info(
                `[WizardHandler.handleMessage] Сохранен символ: ${result.value}`
            );
        } else if (currentStep === 'interval') {
            state.data.interval = this.normalizeInterval(result.value);
            logger.info(
                `[WizardHandler.handleMessage] Сохранен интервал: ${state.data.interval}`
            );
        } else {
            state.data[currentStep] = result.value;
            logger.info(
                `[WizardHandler.handleMessage] Сохранено ${currentStep}: ${result.value}`
            );
        }

        // Определяем следующий шаг
        const steps = this.config.steps;
        const currentIndex = steps.indexOf(currentStep);
        const nextStep = steps[currentIndex + 1];

        if (nextStep) {
            state.step = nextStep;
            setUserState(userId, state);
            logger.info(
                `[WizardHandler.handleMessage] Переход на следующий шаг: ${nextStep}`
            );

            const nextAskFn = this.config.askFunctions[nextStep];
            if (nextAskFn) {
                logger.debug(
                    `[WizardHandler.handleMessage] Вызов askFunction для шага ${nextStep}`
                );
                // Для clean-сценария передаем интервал, для add-сценария передаем символ
                const paramValue =
                    state.configName === 'clean'
                        ? state.data.interval
                        : state.data.symbol;
                await nextAskFn(ctx, paramValue);
            }
        } else {
            // Финальное действие
            logger.info(
                `[WizardHandler.handleMessage] Выполнение финального действия. Данные: ${JSON.stringify(state.data)}`
            );
            await this.config.finalAction(ctx, state.data, userId);
            resetUserState(userId);
            logger.info(
                `[WizardHandler.handleMessage] Состояние пользователя ${userId} очищено`
            );
        }
    }

    // Нормализация интервала
    normalizeInterval(interval) {
        interval = interval.toLowerCase();
        if (['1', '5', '15', '30'].includes(interval)) {
            return interval; // Bybit принимает без 'm'
        }
        return interval;
    }
}

module.exports = {
    WizardHandler,
    getUserId,
    getMessageText,
    resetUserState,
    getUserState, // понадобится в askFunctions.quantity
    setUserState,
};
