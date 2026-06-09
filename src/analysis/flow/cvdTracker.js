// ============================================================
// cvdTracker.js
// CVD (Cumulative Volume Delta) из потока сделок Bybit + детектор absorption.
//
// Идея:
//   - CVD = бегущая сумма объёма по стороне АГРЕССОРА:
//       агрессивная покупка (taker Buy)  -> +объём
//       агрессивная продажа (taker Sell) -> -объём
//   - Absorption = расхождение давления и результата НА УРОВНЕ:
//       сильные агрессивные ПРОДАЖИ, но цена НЕ падает  -> кто-то выкупает
//         => бычий absorption у поддержки (кандидат на отскок вверх)
//       сильные агрессивные ПОКУПКИ, но цена НЕ растёт   -> кто-то продаёт
//         => медвежий absorption у сопротивления (кандидат на отскок вниз)
//
// В отличие от стены в стакане (пассивное НАМЕРЕНИЕ, можно снять = спуфинг),
// absorption — это уже СОСТОЯВШИЕСЯ сделки: подделать нельзя. Поэтому он
// надёжнее стены. Но на 1m шумит -> использовать как подтверждение касания,
// а не как самостоятельный триггер.
//
// Протокол Bybit V5 (public WS, topic "publicTrade.{symbol}"):
//   data — массив сделок, у каждой:
//     T: time(ms), S: "Buy"|"Sell" (сторона агрессора/тейкера),
//     v: размер(string), p: цена(string)
//   (type обычно "snapshot"; для трейдов это просто пачка новых сделок)
// ============================================================

class CvdTracker {
    constructor(symbol, opts = {}) {
        this.symbol = symbol;
        this.cvd = 0; // глобальный накопленный CVD (для динамики/дивергенций)
        this.windowMs = opts.windowMs ?? 30000; // окно для absorption (30с по умолч.)

        this.trades = []; // скользящее окно: { t, side, vol, price, signed }
        this._lastTs = 0; // время последней сделки — служит "часами" окна
        this._volBaseline = []; // история объёмов окна -> относительный порог "есть ли поток"
        this._baselineCap = opts.baselineCap ?? 200;
    }

    /**
     * Точка входа. Передавай распарсенный JSON сообщения из topic publicTrade.*
     */
    handleMessage(msg) {
        if (!msg || !msg.topic || !msg.topic.startsWith('publicTrade'))
            return false;
        const arr = msg.data;
        if (!Array.isArray(arr) || arr.length === 0) return false;

        for (const tr of arr) {
            const vol = parseFloat(tr.v);
            const price = parseFloat(tr.p);
            const t = Number(tr.T) || this._lastTs || Date.now();
            const side = tr.S; // "Buy" | "Sell" — сторона агрессора
            if (!Number.isFinite(vol) || vol <= 0 || !Number.isFinite(price))
                continue;
            if (side !== 'Buy' && side !== 'Sell') continue;

            const signed = side === 'Buy' ? vol : -vol;
            this.cvd += signed;
            this.trades.push({ t, side, vol, price, signed });
            if (t > this._lastTs) this._lastTs = t;
        }
        this._prune();
        return true;
    }

    // Прунинг относительно времени ПОСЛЕДНЕЙ сделки, а не Date.now():
    // это корректно и в реалтайме, и при реплее/бэктесте исторических данных,
    // и устойчиво к рассинхрону часов.
    _prune() {
        const ref = this._lastTs || 0;
        const cutoff = ref - this.windowMs;
        let i = 0;
        while (i < this.trades.length && this.trades[i].t < cutoff) i++;
        if (i > 0) this.trades.splice(0, i);
    }

    /**
     * Статистика по текущему окну.
     */
    windowStats() {
        const w = this.trades;
        if (w.length === 0) {
            return {
                totalVol: 0,
                deltaCvd: 0,
                firstPrice: null,
                lastPrice: null,
                count: 0,
            };
        }
        let totalVol = 0,
            deltaCvd = 0;
        for (const t of w) {
            totalVol += t.vol;
            deltaCvd += t.signed;
        }
        return {
            totalVol,
            deltaCvd, // знаковая дельта в окне: <0 продавцы агрессивнее, >0 покупатели
            firstPrice: w[0].price,
            lastPrice: w[w.length - 1].price,
            count: w.length,
        };
    }

    /**
     * Детектор absorption у конкретного уровня.
     *
     *   levelPrice — центр зоны (centroid кластера)
     *   tol        — допуск (тот же ATR-tolerance)
     *   opts:
     *     minAggression — насколько односторонним должно быть давление,
     *                     |deltaCvd|/totalVol >= minAggression  (0..1, по умолч. 0.4)
     *     maxDriftTol   — насколько мало цена сдвинулась, в долях tol
     *                     (по умолч. 0.4 = меньше 40% допуска)
     *     zoneMult      — ширина зоны вокруг уровня в tol (по умолч. 1.5)
     *     volMult       — поток в окне должен быть >= volMult * медианы окон
     *                     (относительный фильтр "мёртвой ленты", по умолч. 1.0)
     *
     * Возвращает {
     *   type: 'bullish' | 'bearish' | null,  // bullish=отскок вверх (поддержка)
     *   aggressionRatio, driftTol, totalVol, near, enoughFlow
     * }
     */
    detectAbsorption(levelPrice, tol, opts = {}) {
        const {
            minAggression = 0.4,
            maxDriftTol = 0.4,
            zoneMult = 1.5,
            volMult = 1.0,
        } = opts;

        const s = this.windowStats();

        // обновляем относительную базу объёма
        this._volBaseline.push(s.totalVol);
        if (this._volBaseline.length > this._baselineCap)
            this._volBaseline.shift();
        const medVol = this._median(this._volBaseline);
        const enoughFlow =
            medVol > 0 ? s.totalVol >= medVol * volMult : s.totalVol > 0;

        const empty = {
            type: null,
            aggressionRatio: 0,
            driftTol: 0,
            totalVol: s.totalVol,
            near: false,
            enoughFlow,
        };
        if (!(tol > 0) || s.count === 0 || s.lastPrice == null) return empty;

        const near = Math.abs(s.lastPrice - levelPrice) <= tol * zoneMult;
        const aggressionRatio = s.totalVol > 0 ? s.deltaCvd / s.totalVol : 0; // [-1..1]
        const driftTol = (s.lastPrice - s.firstPrice) / tol; // знаковый сдвиг цены в tol

        if (!near || !enoughFlow)
            return { ...empty, aggressionRatio, driftTol, near };

        // Бычий: сильные ПРОДАЖИ (aggressionRatio <= -minAggression),
        //        но цена НЕ упала заметно (driftTol >= -maxDriftTol).
        const bullish =
            aggressionRatio <= -minAggression && driftTol >= -maxDriftTol;

        // Медвежий: сильные ПОКУПКИ, но цена НЕ выросла заметно.
        const bearish =
            aggressionRatio >= minAggression && driftTol <= maxDriftTol;

        return {
            type: bullish ? 'bullish' : bearish ? 'bearish' : null,
            aggressionRatio,
            driftTol,
            totalVol: s.totalVol,
            near,
            enoughFlow,
        };
    }

    _median(arr) {
        if (!arr || arr.length === 0) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
}

// ============================================================
// Соответствие absorption и типа уровня (для стратегии отскока):
//   поддержка    ждёт bullish absorption (продажи поглощены)
//   сопротивление ждёт bearish absorption (покупки поглощены)
// ============================================================
function absorptionConfirms(level, absorption) {
    if (!absorption || !absorption.type) return false;
    const want = level.dominantType === 'resistance' ? 'bearish' : 'bullish';
    return absorption.type === want;
}

// ============================================================
// Итоговый сигнал: касание уровня + два независимых подтверждения.
//   obMetrics   — из BybitOrderBook.analyzeLevel(...)   (стена/намерение)
//   absorption  — из CvdTracker.detectAbsorption(...)   (поток/факт)
//
// Множители независимы и перемножаются: каждое подтверждение усиливает.
// Лучший сигнал = фрактал-уровень + персистентная стена + absorption.
// ============================================================
function combineSignal(price, level, tol, obMetrics, absorption) {
    if (Math.abs(price - level.centroid) > tol) return null;

    const wallOk =
        obMetrics &&
        obMetrics.wall &&
        obMetrics.wall.confirmed &&
        obMetrics.wall.side ===
            (level.dominantType === 'resistance' ? 'ask' : 'bid');
    const absOk = absorptionConfirms(level, absorption);

    let mult = 1;
    if (wallOk) mult *= 1.3; // намерение защищать (стакан)
    if (absOk) mult *= 1.6; // защита подтверждена сделками (надёжнее)

    return {
        level,
        wallConfirmed: !!wallOk,
        absorptionConfirmed: absOk,
        absorptionType: absorption?.type ?? null,
        confirmations: (wallOk ? 1 : 0) + (absOk ? 1 : 0),
        strength: level.score * mult,
    };
}

module.exports = { CvdTracker, absorptionConfirms, combineSignal };

/* ── Пример проводки ───────────────────────────────────────────────────
const { BybitOrderBook } = require('./bybitOrderBook');
const { CvdTracker, combineSignal } = require('./cvdTracker');

const book = new BybitOrderBook('BTCUSDT');
const cvd  = new CvdTracker('BTCUSDT', { windowMs: 30000 });

// один WS, подписка: orderbook.50.BTCUSDT + publicTrade.BTCUSDT
ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  book.handleMessage(msg);   // игнорит чужие топики сам
  cvd.handleMessage(msg);
});

// в момент, когда цена подошла к уровню (level из buildLevels):
const ob  = book.analyzeLevel(level.centroid, tol, { minPersist: 3 });
const abs = cvd.detectAbsorption(level.centroid, tol, { minAggression: 0.4 });
const sig = combineSignal(currentPrice, level, tol, ob, abs);
// если sig.confirmations >= 1 -> шлём в Telegram, сила = sig.strength
if (sig && sig.confirmations >= 1) { sendAlert(sig); }
──────────────────────────────────────────────────────────────────────── */
