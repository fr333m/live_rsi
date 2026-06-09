const logger = require('../../../utils/logger');
const userStates = new Map();

const getUserId = (ctx) => ctx.from?.id;
const getMessageText = (ctx) => ctx.message?.text?.trim() || '';

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

const resetUserState = (userId) => {
    userStates.delete(userId);
};

class WizardHandler {
    constructor(config) {
        this.config = config;
    }

    async start(ctx) {
        const userId = getUserId(ctx);
        if (!userId) {
            await ctx.reply('Не удалось определить пользователя.');
            return;
        }

        setUserState(userId, {
            step: this.config.initialStep,
            data: {},
            configName: this.config.name,
        });

        await this.config.askFunctions[this.config.initialStep](ctx);
    }

    async handleCallback(ctx) {
        const userId = getUserId(ctx);
        const callbackData = ctx.callbackQuery?.data;

        if (!userId) return;

        let state = getUserState(userId);
        if (!state) {
            await ctx.reply('Сессия истекла. Начните заново.');
            return;
        }

        const data = callbackData;

        if (data.startsWith('symbol_add_')) {
            state.data.symbol = data.replace('symbol_add_', '').toUpperCase();
            state.step = 'interval';
        } else if (data.startsWith('symbol_delete_')) {
            state.data.symbol = data.replace('symbol_delete_', '').toUpperCase();

            if (state.configName === 'clean') {
                await this.config.finalAction(ctx, state.data);
                resetUserState(userId);
                await ctx.answerCbQuery();
                return;
            }
            state.step = 'interval';
        } else if (data.startsWith('interval_add_')) {
            state.data.interval = this.normalizeInterval(data.replace('interval_add_', ''));
            state.step = 'quantity';
        } else if (data.startsWith('interval_delete_')) {
            state.data.interval = this.normalizeInterval(data.replace('interval_delete_', ''));
            state.step = 'symbol';
        } else {
            await ctx.answerCbQuery('Неизвестное действие');
            return;
        }

        setUserState(userId, state);
        await ctx.answerCbQuery();

        const nextAskFn = this.config.askFunctions[state.step];
        if (nextAskFn) {
            const paramValue =
                state.configName === 'clean' ? state.data.interval : state.data.symbol;
            await nextAskFn(ctx, paramValue);
        }
    }

    async handleMessage(ctx) {
        const userId = getUserId(ctx);
        const text = getMessageText(ctx);

        if (!userId || !text || text.startsWith('/')) return;

        const state = getUserState(userId);
        if (!state) return;

        const currentStep = state.step;
        const validator = this.config.validators[currentStep];
        const askAgainFn = this.config.askFunctions[currentStep];

        if (!validator) return;

        const result = validator(text);

        if (!result.isValid) {
            await ctx.reply(result.error);
            if (askAgainFn) {
                const paramValue =
                    state.configName === 'clean' ? state.data.interval : state.data.symbol;
                await askAgainFn(ctx, paramValue);
            }
            return;
        }

        if (currentStep === 'symbol') {
            state.data.symbol = result.value;
        } else if (currentStep === 'interval') {
            state.data.interval = this.normalizeInterval(result.value);
        } else {
            state.data[currentStep] = result.value;
        }

        const steps = this.config.steps;
        const nextStep = steps[steps.indexOf(currentStep) + 1];

        if (nextStep) {
            state.step = nextStep;
            setUserState(userId, state);

            const nextAskFn = this.config.askFunctions[nextStep];
            if (nextAskFn) {
                const paramValue =
                    state.configName === 'clean' ? state.data.interval : state.data.symbol;
                await nextAskFn(ctx, paramValue);
            }
        } else {
            await this.config.finalAction(ctx, state.data, userId);
            resetUserState(userId);
        }
    }

    normalizeInterval(interval) {
        return interval.toLowerCase().replace(/[mhd]$/, '');
    }
}

module.exports = {
    WizardHandler,
    getUserId,
    getMessageText,
    resetUserState,
    getUserState,
    setUserState,
};
