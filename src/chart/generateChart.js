const PostgresDB = require('../db/db');
const dbService = new PostgresDB()
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const Chart = require('chart.js/auto');

const width = 1280;
const height = 720;

const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour: '#0d1117'
});

async function generateChart(symbol, interval) {

    const ohlcData = await dbService.getCandles(
        symbol,
        interval,
        'tracking_contracts',
        400
    );

    if (!ohlcData || !ohlcData.length) {
        throw new Error('Нет свечей');
    }

    const labels = ohlcData.map(c =>
        new Date(c.timestamp).toLocaleTimeString()
    );

    const closePrices = ohlcData.map(c => c.close);

    const configuration = {

        type: 'line',

        data: {
            labels,

            datasets: [
                {
                    label: `${symbol} Price`,
                    data: closePrices,

                    borderColor: '#22c55e',

                    borderWidth: 2,

                    pointRadius: 0,

                    tension: 0.1
                }
            ]
        },

        options: {

            responsive: false,

            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff'
                    }
                }
            },

            scales: {

                x: {
                    ticks: {
                        color: '#9ca3af'
                    },

                    grid: {
                        color: '#1f2937'
                    }
                },

                y: {

                    position: 'right',

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
            {
                id: 'candlestick',

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

                        const candleWidth = 6;

                        const isBullish = candle.close >= candle.open;

                        ctx.strokeStyle = isBullish
                            ? '#22c55e'
                            : '#ef4444';

                        ctx.fillStyle = isBullish
                            ? '#22c55e'
                            : '#ef4444';

                        // фитиль
                        ctx.beginPath();
                        ctx.moveTo(xPos, highY);
                        ctx.lineTo(xPos, lowY);
                        ctx.stroke();

                        // тело свечи
                        const bodyTop = Math.min(openY, closeY);
                        const bodyHeight = Math.abs(openY - closeY);

                        ctx.fillRect(
                            xPos - candleWidth / 2,
                            bodyTop,
                            candleWidth,
                            Math.max(bodyHeight, 1)
                        );
                    });

                    ctx.restore();
                }
            }
        ]
    };

    return await chartJSNodeCanvas.renderToBuffer(configuration);
}


module.exports = {generateChart};