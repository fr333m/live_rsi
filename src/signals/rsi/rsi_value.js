async function getRsi(candlesArr) {
    

  if (!Array.isArray(candlesArr) || candlesArr.length < 15) {
    return null;
  }

  const period = 14;
  const lastCandles = candlesArr.slice(-100);
  if (lastCandles.length < period + 1) {
    return null;
  }

  const closes = lastCandles.map(c => c.close);

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const currentGain = diff > 0 ? diff : 0;
    const currentLoss = Math.abs(diff < 0 ? diff : 0);

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
  }

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

module.exports = {
  getRsi
};