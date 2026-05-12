const PostgresDB = require('../db/db');
const dbService = new PostgresDB()
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const Chart = require('chart.js/auto');


const width = 1980;
const height = 1080;

const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: '#0d1117'
});

function calculateEMA(data, period = 20) {

    const multiplier = 2 / (period + 1);

    let ema = [data[0]];

    for (let i = 1; i < data.length; i++) {
        ema.push(
            (data[i] - ema[i - 1]) * multiplier + ema[i - 1]
        );
    }

    return ema;
}

async function generateChart(
    symbol,
    interval,
    extraData
) {
    console.log("EXTRA DATA IN CHART", extraData);

    const ohlcData = await dbService.getCandles(
        symbol,
        interval,
        'tracking_contracts',
        300
    );

    if (!ohlcData.length) {
        throw new Error('Нет данных');
    }

    const labels = ohlcData.map(c =>
        new Date(c.timestamp).toLocaleTimeString()
    );

    const closePrices = ohlcData.map(c => c.close);

    const ema20 = calculateEMA(closePrices, 20);

    const lastPrice = closePrices[closePrices.length - 1];

    const minPrice = Math.min(
        ...ohlcData.map(c => c.low)
    );

    const maxPrice = Math.max(
        ...ohlcData.map(c => c.high)
    );

    const configuration = {

        type: 'line',

        data: {

            labels,

            datasets: [

                // EMA
                {
                    label: 'EMA 20',

                    data: ema20,

                    borderColor: '#f59e0b',

                    borderWidth: 2,

                    pointRadius: 0,

                    tension: 0.2
                }
            ]
        },

        options: {

            responsive: false,

            animation: false,

            plugins: {

                legend: {
                    labels: {
                        color: '#ffffff'
                    }
                }
            },

            layout: {
                padding: 20
            },

            scales: {

                x: {

                    ticks: {
                        color: '#9ca3af',
                        maxTicksLimit: 10
                    },

                    grid: {
                        color: '#1f2937'
                    }
                },

                y: {

                    position: 'right',

                    min: minPrice * 0.995,
                    max: maxPrice * 1.005,

                    ticks: {
                        color: '#9ca3af'
                    },

                    grid: {
                        color: '#1f2937'
                    }
                }
            }
        },

        plugins: [

            // Свечи
            {
                id: 'candles',

                beforeDatasetsDraw(chart) {

                    const {
                        ctx,
                        scales: { x, y }
                    } = chart;

                    ctx.save();

                    ohlcData.forEach((candle, index) => {

                        const xPos = x.getPixelForValue(index);

                        const openY = y.getPixelForValue(candle.open);
                        const closeY = y.getPixelForValue(candle.close);

                        const highY = y.getPixelForValue(candle.high);
                        const lowY = y.getPixelForValue(candle.low);

                        const candleWidth = 8;

                        const bullish =
                            candle.close >= candle.open;

                        const color = bullish
                            ? '#22c55e'
                            : '#ef4444';

                        ctx.strokeStyle = color;
                        ctx.fillStyle = color;

                        // фитиль
                        ctx.beginPath();
                        ctx.moveTo(xPos, highY);
                        ctx.lineTo(xPos, lowY);
                        ctx.stroke();

                        // тело свечи
                        const bodyTop = Math.min(openY, closeY);

                        const bodyHeight = Math.max(
                            Math.abs(openY - closeY),
                            2
                        );

                        ctx.fillRect(
                            xPos - candleWidth / 2,
                            bodyTop,
                            candleWidth,
                            bodyHeight
                        );
                    });

                    ctx.restore();
                }
            },

            // Header
            {
                id: 'header',

                afterDraw(chart) {

                    const { ctx } = chart;

                    ctx.save();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 28px Arial';

                    ctx.fillText(
                        `${symbol} · ${interval}`,
                        30,
                        40
                    );

                    ctx.fillStyle = '#22c55e';

                    ctx.font = '20px Arial';

                    ctx.fillText(
                        `PRICE: ${lastPrice}`,
                        30,
                        75
                    );

                    ctx.restore();
                }
            },

            // Watermark
            {
                id: 'watermark',

                afterDraw(chart) {

                    const {
                        ctx,
                        width,
                        height
                    } = chart;

                    ctx.save();

                    ctx.font = 'bold 120px Arial';

                    ctx.fillStyle =
                        'rgba(255,255,255,0.03)';

                    ctx.textAlign = 'center';

                    ctx.fillText(
                        symbol,
                        width / 2,
                        height / 2
                    );

                    ctx.restore();
                }
            },

            // Last price line
            {
                id: 'priceLine',

                afterDraw(chart) {

                    const {
                        ctx,
                        scales
                    } = chart;

                    const y =
                        scales.y.getPixelForValue(lastPrice);

                    ctx.save();

                    ctx.strokeStyle = '#f59e0b';

                    ctx.setLineDash([6, 6]);

                    ctx.lineWidth = 1;

                    // Линия НА ВЕСЬ СКРИНШОТ
                    ctx.beginPath();

                    ctx.moveTo(0, y);

                    ctx.lineTo(chart.width, y);

                    ctx.stroke();

                    ctx.restore();
                }
            },

            // EXTRA PEAK / MINIMA
        // EXTRA PEAK / MINIMA — с вертикальной и горизонтальной линией
{
    id: 'extraLevel',

    afterDraw(chart) {
        if (!extraData?.peak?.index) return;

        const { ctx, scales: { x, y }, width, height } = chart;

        const candleIndex = extraData.peak.index;
        const candle = ohlcData[candleIndex];

        if (!candle) return;

        const isPeak = extraData.extra === 'extra_peaks';
        const color = isPeak ? '#ef4444' : '#22c55e';

        // === Определяем цену для горизонтальной линии ===
        const levelPrice = isPeak 
            ? extraData.peak.highPrice 
            : extraData.peak.lowPrice;

        const xPos = x.getPixelForValue(candleIndex);
        const yPos = y.getPixelForValue(levelPrice);

        ctx.save();

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 5]);

        // === 1. Горизонтальная линия на весь график ===
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(width, yPos);
        ctx.stroke();

        // === 2. Вертикальная линия на весь график ===
        ctx.beginPath();
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, height);
        ctx.stroke();

        // === 3. Label справа ===
        const labelPrice = levelPrice.toFixed(2); // или без .toFixed, если не нужно
        const label = isPeak 
            ? `PEAK ${labelPrice}` 
            : `MINIMA ${labelPrice}`;

        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'left';

        const textWidth = ctx.measureText(label).width;
        const padding = 10;
        const boxWidth = textWidth + padding * 2;
        const boxHeight = 32;

        const boxX = width - boxWidth - 20;
        const boxY = yPos - boxHeight / 2;

        // Фон label
        ctx.fillStyle = color;
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        // Текст
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, boxX + padding, boxY + 22);

        // === 4. Усиленное выделение самой свечи ===
        ctx.strokeStyle = color;
        ctx.lineWidth = 3.5;
        ctx.setLineDash([]);

        const highY = y.getPixelForValue(candle.high);
        const lowY = y.getPixelForValue(candle.low);
        const openY = y.getPixelForValue(candle.open);
        const closeY = y.getPixelForValue(candle.close);

        // Фитиль
        ctx.beginPath();
        ctx.moveTo(xPos, highY);
        ctx.lineTo(xPos, lowY);
        ctx.stroke();

        // Тело свечи (делаем ярче и чуть шире)
        ctx.fillStyle = color;
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(Math.abs(openY - closeY), 3);

        ctx.fillRect(
            xPos - 9,           // ширина тела
            bodyTop,
            18,
            bodyHeight
        );

        ctx.restore();
        }
    }
        ]
    };

    return await chartJSNodeCanvas.renderToBuffer(
        configuration
    );
}

module.exports = {
    generateChart
};

// const width = 1980;
// const height = 1080;

// const chartJSNodeCanvas = new ChartJSNodeCanvas({
//     width,
//     height,
//     backgroundColour: '#0d1117'
// });

// async function generateChart(symbol, interval, extraData) {
//     console.log("EXTRA DATA IN CHART", extraData);

//     const ohlcData = await dbService.getCandles(
//         symbol,
//         interval,
//         'tracking_contracts',
//         400
//     );

//     if (!ohlcData || !ohlcData.length) {
//         throw new Error('Нет свечей');
//     }

//     const labels = ohlcData.map(c =>
//         new Date(c.timestamp).toLocaleTimeString()
//     );

//     const closePrices = ohlcData.map(c => c.close);

//     const configuration = {

//         type: 'line',

//         data: {
//             labels,

//             datasets: [
//                 {
//                     label: `${symbol} Price`,
//                     data: closePrices,

//                     borderColor: '#22c55e',

//                     borderWidth: 2,

//                     pointRadius: 0,

//                     tension: 0.1
//                 }
//             ]
//         },

//         options: {

//             responsive: false,

//             plugins: {
//                 legend: {
//                     labels: {
//                         color: '#ffffff'
//                     }
//                 }
//             },

//             scales: {

//                 x: {
//                     ticks: {
//                         color: '#9ca3af'
//                     },

//                     grid: {
//                         color: '#1f2937'
//                     }
//                 },

//                 y: {

//                     position: 'right',

//                     ticks: {
//                         color: '#9ca3af'
//                     },

//                     grid: {
//                         color: '#1f2937'
//                     }
//                 }
//             }
//         },

//         plugins: [
//             {
//                 id: 'candlestick',

//                 beforeDatasetsDraw(chart) {

//                     const {
//                         ctx,
//                         scales: { x, y }
//                     } = chart;

//                     ctx.save();

//                     ohlcData.forEach((candle, index) => {

//                         const xPos = x.getPixelForValue(index);

//                         const openY = y.getPixelForValue(candle.open);
//                         const closeY = y.getPixelForValue(candle.close);

//                         const highY = y.getPixelForValue(candle.high);
//                         const lowY = y.getPixelForValue(candle.low);

//                         const candleWidth = 6;

//                         const isBullish = candle.close >= candle.open;

//                         ctx.strokeStyle = isBullish
//                             ? '#22c55e'
//                             : '#ef4444';

//                         ctx.fillStyle = isBullish
//                             ? '#22c55e'
//                             : '#ef4444';

//                         // фитиль
//                         ctx.beginPath();
//                         ctx.moveTo(xPos, highY);
//                         ctx.lineTo(xPos, lowY);
//                         ctx.stroke();

//                         // тело свечи
//                         const bodyTop = Math.min(openY, closeY);
//                         const bodyHeight = Math.abs(openY - closeY);

//                         ctx.fillRect(
//                             xPos - candleWidth / 2,
//                             bodyTop,
//                             candleWidth,
//                             Math.max(bodyHeight, 1)
//                         );
//                     });

//                     ctx.restore();
//                 }
//             }
//         ]
//     };

//     return await chartJSNodeCanvas.renderToBuffer(configuration);
// }


// module.exports = {generateChart};