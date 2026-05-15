const PostgresDB = require('../db/db');
const dbService = new PostgresDB();
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

// ==================== КОНСТАНТЫ ====================
const WIDTH = 1980;
const HEIGHT = 1080;
const BACKGROUND_COLOR = '#0d1117';

const CANDLE_WIDTH = 8;
const MAX_CANDLES = 400;

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function calculateEMA(prices, period = 20) {
    if (prices.length === 0) return [];

    const multiplier = 2 / (period + 1);
    const result = [];

    // Начальное значение — SMA
    let ema =
        prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
    result.push(...Array(period).fill(ema));

    for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
        result.push(ema);
    }

    return result;
}

function formatTimeLabel(timestamp) {
    return new Date(timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        // second: '2-digit' // можно включить при необходимости
    });
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ====================

async function generateChart(symbol, interval, extraData = {}) {
    const chartJSNodeCanvas = new ChartJSNodeCanvas({
        width: WIDTH,
        height: HEIGHT,
        backgroundColour: BACKGROUND_COLOR,
    });

    const ohlcData = await dbService.getCandles(
        symbol,
        interval,
        'tracking_contracts',
        MAX_CANDLES
    );

    if (!ohlcData?.length) {
        throw new Error('Нет данных по свечам');
    }

    const closePrices = ohlcData.map((c) => c.close);
    const ema20 = calculateEMA(closePrices, 20);

    const lastPrice = closePrices[closePrices.length - 1];
    const minPrice = Math.min(...ohlcData.map((c) => c.low));
    const maxPrice = Math.max(...ohlcData.map((c) => c.high));

    const labels = ohlcData.map((c) => formatTimeLabel(c.timestamp));

    const configuration = {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'EMA 20',
                    data: ema20,
                    borderColor: '#f59e0b',
                    borderWidth: 2.5,
                    pointRadius: 0,
                    tension: 0.2,
                },
            ],
        },

        options: {
            responsive: false,
            animation: false,

            layout: { padding: 20 },

            plugins: {
                legend: {
                    labels: { color: '#ffffff', font: { size: 14 } },
                },
            },

            scales: {
                x: {
                    ticks: {
                        color: '#9ca3af',
                        maxTicksLimit: 12,
                        maxRotation: 0,
                    },
                    grid: { color: '#1f2937' },
                },
                y: {
                    position: 'right',
                    min: minPrice * 0.992,
                    max: maxPrice * 1.008,
                    ticks: { color: '#9ca3af' },
                    grid: { color: '#1f2937' },
                },
            },
        },

        plugins: [
            createCandlesPlugin(ohlcData),
            createHeaderPlugin(symbol, interval, lastPrice),
            createWatermarkPlugin(symbol),
            createPriceLinePlugin(lastPrice),
            createExtraLevelPlugin(ohlcData, extraData),
        ],
    };

    return await chartJSNodeCanvas.renderToBuffer(configuration);
}

// ==================== ПЛАГИНЫ ====================

function createCandlesPlugin(ohlcData) {
    return {
        id: 'candles',
        beforeDatasetsDraw(chart) {
            const {
                ctx,
                scales: { x, y },
            } = chart;
            ctx.save();

            ohlcData.forEach((candle, i) => {
                const xPos = x.getPixelForValue(i);
                const openY = y.getPixelForValue(candle.open);
                const closeY = y.getPixelForValue(candle.close);
                const highY = y.getPixelForValue(candle.high);
                const lowY = y.getPixelForValue(candle.low);

                const isBullish = candle.close >= candle.open;
                const color = isBullish ? '#22c55e' : '#ef4444';

                ctx.strokeStyle = color;
                ctx.fillStyle = color;

                // Фитиль
                ctx.beginPath();
                ctx.moveTo(xPos, highY);
                ctx.lineTo(xPos, lowY);
                ctx.stroke();

                // Тело
                const bodyTop = Math.min(openY, closeY);
                const bodyHeight = Math.max(Math.abs(openY - closeY), 2);

                ctx.fillRect(
                    xPos - CANDLE_WIDTH / 2,
                    bodyTop,
                    CANDLE_WIDTH,
                    bodyHeight
                );
            });

            ctx.restore();
        },
    };
}

function createHeaderPlugin(symbol, interval, lastPrice) {
    return {
        id: 'header',
        afterDraw(chart) {
            const { ctx } = chart;
            ctx.save();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(`${symbol} · ${interval}`, 30, 40);

            ctx.fillStyle = '#22c55e';
            ctx.font = 'bold 22px Arial';
            ctx.fillText(`PRICE: ${lastPrice.toFixed(6)}`, 30, 75);

            ctx.restore();
        },
    };
}

function createWatermarkPlugin(symbol) {
    return {
        id: 'watermark',
        afterDraw(chart) {
            const { ctx, width, height } = chart;
            ctx.save();
            ctx.font = 'bold 120px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.textAlign = 'center';
            ctx.fillText(symbol, width / 2, height / 2 + 20);
            ctx.restore();
        },
    };
}

function createPriceLinePlugin(lastPrice) {
    return {
        id: 'priceLine',
        afterDraw(chart) {
            const { ctx, scales } = chart;
            const y = scales.y.getPixelForValue(lastPrice);

            ctx.save();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);

            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(chart.width, y);
            ctx.stroke();

            ctx.restore();
        },
    };
}

function createExtraLevelPlugin(ohlcData, extraData) {
    console.log('Генерация графика с extraData:', extraData);
    return {
        id: 'extraLevel',
        afterDraw(chart) {
            const peak = extraData?.peak;

            // Исправленная проверка — не падает на index === 0
            if (!peak || peak.index == null) return;

            const index = peak.index;
            if (index < 0 || index >= ohlcData.length) return;

            // Определяем тип уровня из extraData.extra
            const isPeak = extraData.extra === 'peak';
            const isMin = extraData.extra === 'minimum';

            let levelPrice;
            let color;

            if (isPeak && peak.highPrice) {
                levelPrice = peak.highPrice;
                color = '#ef4444'; // красный для максимумов
            } else if (isMin && peak.lowPrice) {
                levelPrice = peak.lowPrice;
                color = '#22c55e'; // зелёный для минимумов
            } else {
                return;
            }

            const {
                ctx,
                scales: { y },
                width,
            } = chart;
            const yPos = y.getPixelForValue(levelPrice);

            if (!Number.isFinite(yPos) || yPos < 0 || yPos > chart.height)
                return;

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.8;
            ctx.setLineDash([6, 4]);

            ctx.beginPath();
            ctx.moveTo(0, yPos);
            ctx.lineTo(width, yPos);
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.fillRect(8, yPos - 4, 6, 8);

            ctx.restore();
        },
    };
}

// ==================== ЭКСПОРТ ====================
module.exports = { generateChart };
