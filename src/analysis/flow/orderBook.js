// ============================================================
// bybitOrderBook.js
// Поддержание локального стакана Bybit V5 + детектор персистентных стен.
//
// Назначение: дать живую оценку уровня (стена / дисбаланс) в момент,
// когда цена подходит к историческому фрактал-уровню. Стыкуется с
// checkSignal из модуля кластеризации уровней.
//
// Протокол Bybit V5 (public WS, topic "orderbook.{depth}.{symbol}"):
//   - первое сообщение  type: "snapshot"  -> полностью пересоздаём книгу
//   - далее             type: "delta"     -> применяем изменения
//   - в delta: [price, "0"] = уровень удалён, иначе update/insert
//   - новый snapshot в любой момент => СБРОС локальной книги (Bybit
//     пере-шлёт snapshot при своих проблемах, он гарантированно свежий)
//   - на одном соединении порядок доставки гарантирован, поэтому жёсткой
//     сверки разрывов (как у Binance U/u) не требуется; достаточно
//     отслеживать "u" для диагностики и сбрасываться на снапшоте.
//   - depth: для linear/inverse использовать 50 или 200 (500 отключён
//     с 11.09.2025); для spot — 50 или 200.
// ============================================================

class BybitOrderBook {
    constructor(symbol) {
        this.symbol = symbol;
        this.bids = new Map(); // price(number) -> size(number)
        this.asks = new Map();
        this.lastU = null;
        this.ready = false; // получили ли первый snapshot

        // история наблюдений стен для антиспуфинга:
        // ключ — округлённая цена корзины, значение — { side, size, streak, lastSeen }
        this._wallHistory = new Map();
    }

    reset() {
        this.bids.clear();
        this.asks.clear();
        this.lastU = null;
        this.ready = false;
        this._wallHistory.clear();
    }

    /**
     * Точка входа. Передавай сюда распарсенный JSON каждого WS-сообщения
     * из topic orderbook.* . Возвращает true, если книга обновилась.
     */
    handleMessage(msg) {
        if (!msg || !msg.topic || !msg.topic.startsWith('orderbook'))
            return false;
        const { type, data } = msg;
        if (!data) return false;

        if (type === 'snapshot') {
            this._applySnapshot(data);
            return true;
        }
        if (type === 'delta') {
            if (!this.ready) return false; // дельта без снапшота — игнор, ждём snapshot
            this._applyDelta(data);
            return true;
        }
        return false;
    }

    _applySnapshot(data) {
        this.bids.clear();
        this.asks.clear();
        for (const [p, s] of data.b || []) this._set(this.bids, p, s);
        for (const [p, s] of data.a || []) this._set(this.asks, p, s);
        this.lastU = data.u;
        this.ready = true;
    }

    _applyDelta(data) {
        // лёгкая диагностика разрывов: u должен расти. Если упал/прыгнул —
        // это обычно предвестник нового snapshot; просто логируем.
        if (this.lastU != null && data.u != null && data.u < this.lastU) {
            // последовательность пошла назад — ждём снапшота, книгу не трогаем
            return;
        }
        for (const [p, s] of data.b || []) this._set(this.bids, p, s);
        for (const [p, s] of data.a || []) this._set(this.asks, p, s);
        this.lastU = data.u;
    }

    _set(book, priceStr, sizeStr) {
        const price = parseFloat(priceStr);
        const size = parseFloat(sizeStr);
        if (!Number.isFinite(price)) return;
        if (!Number.isFinite(size) || size === 0) {
            book.delete(price); // size "0" => уровень снят
        } else {
            book.set(price, size);
        }
    }

    bestBid() {
        let best = -Infinity;
        for (const p of this.bids.keys()) if (p > best) best = p;
        return best === -Infinity ? null : best;
    }

    bestAsk() {
        let best = Infinity;
        for (const p of this.asks.keys()) if (p < best) best = p;
        return best === Infinity ? null : best;
    }

    midPrice() {
        const b = this.bestBid(),
            a = this.bestAsk();
        return b != null && a != null ? (b + a) / 2 : null;
    }

    // ----------------------------------------------------------------
    // Биннинг: агрегируем заявки в ценовые корзины шириной bucketWidth.
    // Возвращает [{ price, bidVol, askVol }] по возрастанию цены.
    // ----------------------------------------------------------------
    _bin(bucketWidth) {
        if (!(bucketWidth > 0)) return [];
        const buckets = new Map(); // bucketKey -> { bidVol, askVol }
        const add = (price, vol, side) => {
            const key = Math.round(price / bucketWidth) * bucketWidth;
            let b = buckets.get(key);
            if (!b) {
                b = { price: key, bidVol: 0, askVol: 0 };
                buckets.set(key, b);
            }
            b[side] += vol;
        };
        for (const [p, v] of this.bids) add(p, v, 'bidVol');
        for (const [p, v] of this.asks) add(p, v, 'askVol');
        return [...buckets.values()].sort((x, y) => x.price - y.price);
    }

    // ----------------------------------------------------------------
    // Анализ окрестности уровня. Вызывать на каждом тике/раз в N мс.
    //
    //   levelPrice — центр зоны (centroid кластера фракталов)
    //   tol        — допуск зоны (тот же ATR-tolerance, что в кластерах)
    //   opts.wallMult     — во сколько раз объём корзины должен превышать
    //                       медианный, чтобы считаться стеной (рел. порог)
    //   opts.zoneMult     — насколько шире tol смотреть вокруг уровня
    //   opts.minPersist   — сколько подряд вызовов стена должна прожить,
    //                       чтобы считаться подтверждённой (антиспуфинг)
    //
    // Возвращает {
    //   bidVol, askVol, imbalance,         // суммарно в зоне
    //   wall: { side, price, size, persistStreak, confirmed } | null
    // }
    // ----------------------------------------------------------------
    analyzeLevel(levelPrice, tol, opts = {}) {
        const { wallMult = 4, zoneMult = 1.5, minPersist = 3 } = opts;
        if (!this.ready || !(tol > 0)) return null;

        const bucketWidth = tol; // ширина корзины = допуск зоны
        const all = this._bin(bucketWidth);
        if (all.length === 0) return null;

        // медианный объём корзины по ВСЕЙ видимой глубине — база для
        // относительного порога (не абсолютные числа: работает на любой монете)
        const vols = all
            .map((b) => Math.max(b.bidVol, b.askVol))
            .filter((v) => v > 0)
            .sort((a, b) => a - b);
        const medVol = vols.length ? vols[Math.floor(vols.length / 2)] : 0;

        // корзины в зоне уровня
        const half = tol * zoneMult;
        const inZone = all.filter(
            (b) => Math.abs(b.price - levelPrice) <= half
        );

        let bidVol = 0,
            askVol = 0;
        for (const b of inZone) {
            bidVol += b.bidVol;
            askVol += b.askVol;
        }
        const total = bidVol + askVol;
        const imbalance = total > 0 ? (bidVol - askVol) / total : 0; // [-1..1]

        // кандидат в стену: самая крупная односторонняя корзина в зоне
        let cand = null;
        for (const b of inZone) {
            const side = b.bidVol >= b.askVol ? 'bid' : 'ask';
            const size = Math.max(b.bidVol, b.askVol);
            if (medVol > 0 && size >= medVol * wallMult) {
                if (!cand || size > cand.size)
                    cand = { side, price: b.price, size };
            }
        }

        // персистентность: засчитываем стену, только если держится minPersist раз
        const wall = this._trackPersistence(cand, levelPrice, tol, minPersist);

        return { bidVol, askVol, imbalance, wall };
    }

    _trackPersistence(cand, levelPrice, tol, minPersist) {
        // увеличиваем streak для текущего кандидата, гасим устаревшие
        const now = Date.now();
        const keyOf = (price) => Math.round(price / tol) * tol;

        if (cand) {
            const key = `${cand.side}:${keyOf(cand.price)}`;
            const prev = this._wallHistory.get(key);
            const streak = prev ? prev.streak + 1 : 1;
            this._wallHistory.set(key, {
                side: cand.side,
                price: cand.price,
                size: cand.size,
                streak,
                lastSeen: now,
            });
        }

        // чистим записи, которых не было в этом вызове (стена снята/сдвинута)
        for (const [key, rec] of this._wallHistory) {
            if (rec.lastSeen !== now) this._wallHistory.delete(key);
        }

        if (!cand) return null;
        const key = `${cand.side}:${keyOf(cand.price)}`;
        const rec = this._wallHistory.get(key);
        return {
            side: rec.side,
            price: rec.price,
            size: rec.size,
            persistStreak: rec.streak,
            confirmed: rec.streak >= minPersist, // <- спуфинг сюда не пройдёт
        };
    }
}

// ============================================================
// Интеграция со скорингом уровней (checkSignal из модуля кластеров).
// Стакан НЕ участвует в историческом score — он применяется как живой
// множитель в момент касания. Для стратегии отскока релевантна стена на
// ПРОТИВОПОЛОЖНОЙ стороне движения:
//   - подход к сопротивлению снизу -> ждём стену в ASK (продавцы держат)
//   - подход к поддержке сверху    -> ждём стену в BID (покупатели держат)
// ============================================================
function orderBookConfirms(level, obMetrics) {
    if (!obMetrics || !obMetrics.wall || !obMetrics.wall.confirmed)
        return false;
    const wantSide = level.dominantType === 'resistance' ? 'ask' : 'bid';
    return obMetrics.wall.side === wantSide;
}

/**
 * Расширенная проверка сигнала: касание уровня + (опционально) подтверждение
 * персистентной стеной. obMetrics получаешь из book.analyzeLevel(...).
 */
function checkSignalWithBook(price, level, tol, obMetrics) {
    if (Math.abs(price - level.centroid) > tol) return null;
    const confirmed = orderBookConfirms(level, obMetrics);
    return {
        level,
        obConfirmed: confirmed,
        wall: obMetrics?.wall || null,
        imbalance: obMetrics?.imbalance ?? null,
        // живой множитель: подтверждённая стена усиливает, её отсутствие — нет
        strength: level.score * (confirmed ? 1.5 : 1),
    };
}

module.exports = { BybitOrderBook, orderBookConfirms, checkSignalWithBook };
