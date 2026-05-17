'use strict';

const VALID_TYPES = new Set(['min_extremum', 'max_extremum']);

/**
 * ExtremumCache — in-memory кэш локальных экстремумов (минимумов/максимумов).
 *
 * Хранит массив экстремумов для каждой комбинации symbol+interval+type.
 * При обновлении — полностью заменяет старый массив новым.
 *
 * Использование:
 *   const extremumCache = require('./extremumCache');
 *
 *   extremumCache.set('BTCUSDT', '1m', extremums, 'min_extremum');
 *   const cached = extremumCache.get('BTCUSDT', '1m', 'min_extremum');
 *   extremumCache.clear('BTCUSDT', '1m', 'min_extremum');
 */
class ExtremumCache {
    constructor() {
        /**
         * Map<string, ExtremumRecord[]>
         * Ключ: `${symbol}_${interval}_${type}` → массив экстремумов
         */
        this.cache = new Map();

        /** Метаданные: когда последний раз обновлялся каждый ключ */
        this.updatedAt = new Map();
    }

    // ---------------------------------------------------------------------------
    // _key — внутренний метод формирования ключа
    // ---------------------------------------------------------------------------
    _key(symbol, interval, type) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');
        if (!interval || typeof interval !== 'string')
            throw new Error('Invalid interval');
        if (!VALID_TYPES.has(type))
            throw new Error(
                `Invalid type "${type}". Must be "min_extremum" or "max_extremum"`
            );
        return `${symbol}_${interval}_${type}`;
    }

    // ---------------------------------------------------------------------------
    // set
    // ---------------------------------------------------------------------------
    /**
     * Сохранить массив экстремумов для symbol+interval+type.
     * Полностью заменяет предыдущие данные.
     *
     * @param {string}   symbol    - Например 'BTCUSDT'
     * @param {string}   interval  - Например '1m', '15m', '1h'
     * @param {Object[]} extremums - Массив объектов экстремумов
     * @param {string}   type      - 'min_extremum' | 'max_extremum'
     *
     * @example
     * extremumCache.set('BTCUSDT', '1m', [
     *   { timestamp: 1778859900000, low: 0.11066, close: 0.11092, index: 134 },
     * ], 'min_extremum');
     */
    set(symbol, interval, extremums, type) {
        if (!Array.isArray(extremums)) {
            throw new Error(
                `extremums must be an array, got ${typeof extremums}`
            );
        }

        const key = this._key(symbol, interval, type);

        // Копируем массив чтобы не хранить ссылку на внешний объект
        this.cache.set(
            key,
            extremums.map((e) => ({ ...e }))
        );
        this.updatedAt.set(key, Date.now());

        console.log(
            `[ExtremumCache] set: ${symbol} ${interval} ${type} → ${extremums.length} экстремумов`
        );
    }

    // ---------------------------------------------------------------------------
    // get
    // ---------------------------------------------------------------------------
    /**
     * Получить массив экстремумов для symbol+interval+type.
     *
     * @param {string} symbol
     * @param {string} interval
     * @param {string} type - 'min_extremum' | 'max_extremum'
     * @returns {Object[]|null}
     */
    get(symbol, interval, type) {
        const key = this._key(symbol, interval, type);
        return this.cache.get(key) ?? null;
    }

    // ---------------------------------------------------------------------------
    // getLast
    // ---------------------------------------------------------------------------
    /**
     * Получить последний (самый свежий) экстремум для symbol+interval+type.
     *
     * @param {string} symbol
     * @param {string} interval
     * @param {string} type
     * @returns {Object|null}
     */
    getLast(symbol, interval, type) {
        return this.get(symbol, interval, type)?.at(-1) ?? null;
    }

    // ---------------------------------------------------------------------------
    // getByIndex
    // ---------------------------------------------------------------------------
    /**
     * Найти экстремум по полю index.
     *
     * @param {string} symbol
     * @param {string} interval
     * @param {string} type
     * @param {number} index
     * @returns {Object|null}
     */
    getByIndex(symbol, interval, type, index) {
        return (
            this.get(symbol, interval, type)?.find((e) => e.index === index) ??
            null
        );
    }

    // ---------------------------------------------------------------------------
    // getByTimestamp
    // ---------------------------------------------------------------------------
    /**
     * Найти экстремум по timestamp.
     *
     * @param {string} symbol
     * @param {string} interval
     * @param {string} type
     * @param {number} timestamp
     * @returns {Object|null}
     */
    getByTimestamp(symbol, interval, type, timestamp) {
        return (
            this.get(symbol, interval, type)?.find(
                (e) => e.timestamp === timestamp
            ) ?? null
        );
    }

    // ---------------------------------------------------------------------------
    // getAll
    // ---------------------------------------------------------------------------
    /**
     * Получить все экстремумы из кэша, сгруппированные по symbol, interval, type.
     *
     * @returns {Object[]} Массив объектов { symbol, interval, type, extremums }
     *
     * @example
     * extremumCache.getAll();
     * // [
     * //   { symbol: 'BTCUSDT', interval: '1m', type: 'min_extremum', extremums: [...] },
     * //   { symbol: 'BTCUSDT', interval: '1m', type: 'max_extremum', extremums: [...] },
     * //   { symbol: 'ETHUSDT', interval: '15m', type: 'min_extremum', extremums: [...] },
     * // ]
     */
    getAll() {
        const result = [];
        for (const [key, extremums] of this.cache.entries()) {
            const parts = key.split('_');
            // type содержит '_' (min_extremum / max_extremum), поэтому берём первые два как symbol и interval
            const symbol = parts[0];
            const interval = parts[1];
            const type = parts.slice(2).join('_');
            result.push({ symbol, interval, type, extremums: [...extremums] });
        }
        return result;
    }

    // ---------------------------------------------------------------------------
    // has
    // ---------------------------------------------------------------------------
    /**
     * Проверить наличие данных для symbol+interval+type.
     *
     * @param {string} symbol
     * @param {string} interval
     * @param {string} type
     * @returns {boolean}
     */
    has(symbol, interval, type) {
        const key = this._key(symbol, interval, type);
        return this.cache.has(key) && (this.cache.get(key)?.length ?? 0) > 0;
    }

    // ---------------------------------------------------------------------------
    // count
    // ---------------------------------------------------------------------------
    /**
     * Количество экстремумов для symbol+interval+type.
     *
     * @param {string} symbol
     * @param {string} interval
     * @param {string} type
     * @returns {number}
     */
    count(symbol, interval, type) {
        return this.get(symbol, interval, type)?.length ?? 0;
    }

    // ---------------------------------------------------------------------------
    // clear
    // ---------------------------------------------------------------------------
    /**
     * Очистить экстремумы для symbol+interval+type (например после сброса в БД).
     *
     * @param {string} symbol
     * @param {string} interval
     * @param {string} type
     */
    clear(symbol, interval, type) {
        const key = this._key(symbol, interval, type);
        this.cache.delete(key);
        this.updatedAt.delete(key);
        console.log(`[ExtremumCache] clear: ${symbol} ${interval} ${type}`);
    }

    // ---------------------------------------------------------------------------
    // clearAll
    // ---------------------------------------------------------------------------
    /**
     * Полностью очистить весь кэш.
     */
    // ---------------------------------------------------------------------------
    // deleteByIndex
    // ---------------------------------------------------------------------------
    /**
     * Удалить один объект из массива экстремумов по полю index.
     *
     * @param {string} symbol
     * @param {string} interval
     * @param {string} type   - 'min_extremum' | 'max_extremum'
     * @param {number} index  - Значение поля index внутри объекта экстремума
     * @returns {boolean}     - true если объект найден и удалён, false если не найден
     *
     * @example
     * extremumCache.deleteByIndex('BTCUSDT', '1m', 'min_extremum', 134);
     */
    deleteByIndex(symbol, interval, type, index) {
        const key = this._key(symbol, interval, type);
        const extremums = this.cache.get(key);

        if (!extremums) {
            console.warn(
                `[ExtremumCache] deleteByIndex: нет данных для ${symbol} ${interval} ${type}`
            );
            return false;
        }

        const before = extremums.length;
        const filtered = extremums.filter((e) => e.index !== index);

        if (filtered.length === before) {
            console.warn(
                `[ExtremumCache] deleteByIndex: index=${index} не найден в ${symbol} ${interval} ${type}`
            );
            return false;
        }

        this.cache.set(key, filtered);
        this.updatedAt.set(key, Date.now());
        console.log(
            `[ExtremumCache] deleteByIndex: удалён index=${index} из ${symbol} ${interval} ${type}, осталось ${filtered.length}`
        );
        return true;
    }

    // ---------------------------------------------------------------------------
    // deleteBySymbol
    // ---------------------------------------------------------------------------
    /**
     * Удалить все записи для symbol (все interval и type).
     * Полезно когда символ убирается из отслеживания.
     *
     * @param {string} symbol
     * @returns {number} Количество удалённых ключей
     *
     * @example
     * extremumCache.deleteBySymbol('BTCUSDT');
     * // Удалит: BTCUSDT_1m_min_extremum, BTCUSDT_1m_max_extremum, BTCUSDT_15m_min_extremum, ...
     */
    deleteBySymbol(symbol) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');

        let deleted = 0;
        for (const key of this.cache.keys()) {
            if (key.startsWith(`${symbol}_`)) {
                this.cache.delete(key);
                this.updatedAt.delete(key);
                deleted++;
            }
        }

        if (deleted > 0) {
            console.log(
                `[ExtremumCache] deleteBySymbol: удалено ${deleted} ключей для ${symbol}`
            );
        } else {
            console.warn(
                `[ExtremumCache] deleteBySymbol: нет данных для ${symbol}`
            );
        }

        return deleted;
    }

    // ---------------------------------------------------------------------------
    // deleteByInterval
    // ---------------------------------------------------------------------------
    /**
     * Удалить все записи для symbol+interval (оба типа: min и max).
     * Полезно когда интервал убирается из отслеживания для конкретного символа.
     *
     * @param {string} symbol
     * @param {string} interval
     * @returns {number} Количество удалённых ключей
     *
     * @example
     * extremumCache.deleteByInterval('BTCUSDT', '1m');
     * // Удалит: BTCUSDT_1m_min_extremum, BTCUSDT_1m_max_extremum
     */
    deleteByInterval(symbol, interval) {
        if (!symbol || typeof symbol !== 'string')
            throw new Error('Invalid symbol');
        if (!interval || typeof interval !== 'string')
            throw new Error('Invalid interval');

        const prefix = `${symbol}_${interval}_`;
        let deleted = 0;

        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
                this.updatedAt.delete(key);
                deleted++;
            }
        }

        if (deleted > 0) {
            console.log(
                `[ExtremumCache] deleteByInterval: удалено ${deleted} ключей для ${symbol} ${interval}`
            );
        } else {
            console.warn(
                `[ExtremumCache] deleteByInterval: нет данных для ${symbol} ${interval}`
            );
        }

        return deleted;
    }

    // ---------------------------------------------------------------------------
    // removeAllByInterval
    // ---------------------------------------------------------------------------
    /**
     * Удалить все экстремумы по заданному interval — для всех символов и типов.
     * Полезно при смене таймфрейма или полном сбросе данных для интервала.
     *
     * @param {string} interval - Например '1m', '15m', '1h'
     * @returns {number} Количество удалённых ключей
     *
     * @example
     * extremumCache.removeAllByInterval('1m');
     * // Удалит: BTCUSDT_1m_min_extremum, BTCUSDT_1m_max_extremum,
     * //         ETHUSDT_1m_min_extremum, ETHUSDT_1m_max_extremum, ...
     */
    removeAllByInterval(interval) {
        if (!interval || typeof interval !== 'string')
            throw new Error('Invalid interval');

        let deleted = 0;
        for (const key of this.cache.keys()) {
            const parts = key.split('_');
            // parts[0] = symbol, parts[1] = interval, parts[2+] = type
            if (parts[1] === interval) {
                this.cache.delete(key);
                this.updatedAt.delete(key);
                deleted++;
            }
        }

        if (deleted > 0) {
            console.log(
                `[ExtremumCache] removeAllByInterval: удалено ${deleted} ключей для interval="${interval}"`
            );
        } else {
            console.warn(
                `[ExtremumCache] removeAllByInterval: нет данных для interval="${interval}"`
            );
        }

        return deleted;
    }

    clearAll() {
        this.cache.clear();
        this.updatedAt.clear();
        console.log('[ExtremumCache] clearAll: кэш полностью очищен');
    }

    // ---------------------------------------------------------------------------
    // stats
    // ---------------------------------------------------------------------------
    /**
     * Статистика по всем записям в кэше.
     * @returns {Object[]}
     */
    stats() {
        const result = [];
        for (const [key, extremums] of this.cache.entries()) {
            const [symbol, interval, type] = key.split('_');
            result.push({
                symbol,
                interval,
                type,
                count: extremums.length,
                updatedAt: new Date(this.updatedAt.get(key)).toISOString(),
            });
        }
        return result;
    }
}

// Синглтон
const instance = new ExtremumCache();
module.exports = instance;

// =============================================================================
// ПРИМЕР ИСПОЛЬЗОВАНИЯ
// =============================================================================
//
// const extremumCache = require('./src/cache/extremumCache');
//
// === Сохранить минимумы и максимумы раздельно ===
//
// extremumCache.set('BTCUSDT', '1m', minExtremes, 'min_extremum');
// extremumCache.set('BTCUSDT', '1m', maxExtremes, 'max_extremum');
//
//
// === Получить по типу ===
//
// const mins = extremumCache.get('BTCUSDT', '1m', 'min_extremum');
// const maxs = extremumCache.get('BTCUSDT', '1m', 'max_extremum');
//
//
// === Получить последний минимум ===
//
// const lastMin = extremumCache.getLast('BTCUSDT', '1m', 'min_extremum');
// console.log(lastMin);
// // { timestamp: 1778867520000, low: 0.11206, close: 0.11213, index: 261, ... }
//
//
// === Проверить наличие ===
//
// if (extremumCache.has('BTCUSDT', '1m', 'min_extremum')) { ... }
//
//
// === Удалить один объект по полю index ===
//
// extremumCache.deleteByIndex('BTCUSDT', '1m', 'min_extremum', 134);
// // [ExtremumCache] deleteByIndex: удалён index=134 из BTCUSDT 1m min_extremum, осталось 1
//
// const deleted = extremumCache.deleteByIndex('BTCUSDT', '1m', 'min_extremum', 999);
// // deleted === false (не найден)
//
//
// === Удалить все данные по symbol (все interval и type) ===
//
// extremumCache.deleteBySymbol('BTCUSDT');
// // Удалит: BTCUSDT_1m_min_extremum, BTCUSDT_1m_max_extremum, BTCUSDT_15m_min_extremum, ...
// // Вернёт количество удалённых ключей
//
//
// === Очистить один тип после сброса в БД ===
//
// await db.saveFilteredMinimum('BTCUSDT', '1m', mins);
// extremumCache.clear('BTCUSDT', '1m', 'min_extremum');
//
//
// === Статистика ===
//
// console.log(extremumCache.stats());
// // [
// //   { symbol: 'BTCUSDT', interval: '1m', type: 'min_extremum', count: 3, updatedAt: '...' },
// //   { symbol: 'BTCUSDT', interval: '1m', type: 'max_extremum', count: 2, updatedAt: '...' },
// // ]
