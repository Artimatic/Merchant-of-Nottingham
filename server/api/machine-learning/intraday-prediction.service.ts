import * as moment from 'moment';
import * as _ from 'lodash';

import DecisionService from '../mean-reversion/reversion-decision.service';
import QuoteService from '../quote/quote.service';
import BacktestService from '../backtest/backtest.service';
import { BacktestResults, Indicators } from '../backtest/backtest.service';
import TrainingService from './training.service';
import PortfolioService from '../portfolio/portfolio.service';

class IntradayPredicationService {
  train(symbol, startDate, endDate) {
    return PortfolioService.getIntradayV3(symbol, startDate, endDate)
      .then((data) => {
        console.log('Got quotes ', data[0].date, data[data.length - 1].date);
        return QuoteService.postIntradayData(data);
      })
      .catch((error) => {
        console.error('Error posting intraday data: ', error.message);
      })
      .then(() => {
        console.log('Get backtest ', symbol, startDate, endDate);

        return BacktestService.runDaytradeBacktest(symbol, endDate, startDate,
          {
            lossThreshold: 0.003,
            profitThreshold: 0.02,
            minQuotes: 81
          });
      })
      .then((results: BacktestResults) => {
        const signals = results.signals;
        console.log('Got backtest: ', signals[0].date, signals[signals.length - 1].date);

        const finalDataSet = [];
        signals.forEach((signal, idx) => {
          if (this.withinBounds(idx, signals.length)) {
            finalDataSet.push(this.buildFeatureSet(signals, signal, idx));
          }
        });
        console.log('Data set size: ', finalDataSet.length);
        BacktestService.trainCustomModel(symbol, 'New Model' + moment().valueOf(), finalDataSet);

        return finalDataSet;
      });
  }

  withinBounds(index, totalLength) {
    return index > 0 && (index + 30 < totalLength);
  }

  comparePrices(price, close) {
    if (close < price) {
      return -1;
    } else if (close > price) {
      return 1;
    }

    return 0;
  }

  convertBBand(currentSignal) {
    if (currentSignal.bband80 && currentSignal.bband80.length === 3 &&
      currentSignal.bband80[0].length > 0 &&
      currentSignal.bband80[2].length > 0) {
      const lower = currentSignal.bband80[0][0];
      const upper = currentSignal.bband80[2][0];
      const currentClose = currentSignal.close;
      if (currentClose > upper) {
        return 1;
      } if (currentClose < lower) {
        return -1;
      }
      return 0;
    } else {
      throw new Error('BBand Missing');
    }
  }

  getOutput(currentClose, futureClose) {
    if (currentClose > futureClose) {
      return 1;
    }

    return 0;
  }

  convertRecommendations(signal: Indicators) {
    const input = [];
    if (signal && signal.recommendation) {
      if (signal.recommendation.recommendation && signal.recommendation.recommendation.toLowerCase() === 'buy') {
        input.push(1);
      } else if (signal.recommendation.recommendation && signal.recommendation.recommendation.toLowerCase() === 'sell') {
        input.push(-1);
      } else {
        input.push(0);
      }

      if (signal.recommendation.mfi && signal.recommendation.mfi.toLowerCase() === 'bullish') {
        input.push(1);
      } else if (signal.recommendation.mfi && signal.recommendation.mfi.toLowerCase() === 'bearish') {
        input.push(-1);
      } else {
        input.push(0);
      }

      if (signal.recommendation.roc && signal.recommendation.roc.toLowerCase() === 'bullish') {
        input.push(1);
      } else if (signal.recommendation.roc && signal.recommendation.roc.toLowerCase() === 'bearish') {
        input.push(-1);
      } else {
        input.push(0);
      }

      if (signal.recommendation.bband && signal.recommendation.bband.toLowerCase() === 'bullish') {
        input.push(1);
      } else if (signal.recommendation.bband && signal.recommendation.bband.toLowerCase() === 'bearish') {
        input.push(-1);
      } else {
        input.push(0);
      }

      if (signal.recommendation.vwma && signal.recommendation.vwma.toLowerCase() === 'bullish') {
        input.push(1);
      } else if (signal.recommendation.vwma && signal.recommendation.vwma.toLowerCase() === 'bearish') {
        input.push(-1);
      } else {
        input.push(0);
      }
    } else {
      console.log('Missing recommendation: ', signal);
    }

    return input;
  }

  buildFeatureSet(signals, currentSignal, currentIndex) {
    const dataSetObj = {
      date: null,
      input: null,
      output: null
    };
    const day = new Date(currentSignal.date).getUTCDay();
    const hour = Number(moment(currentSignal.date).format('HH'));
    const close = currentSignal.close;
    const futureClose = signals[currentIndex + 15].close;
    const openPrice = signals[0].close;

    dataSetObj.date = currentSignal.date;
    dataSetObj.input = [day, hour, _.round(DecisionService.getPercentChange(close, openPrice), 3) * 100]
      .concat(TrainingService.compareQuotes(signals[currentIndex - 1], currentSignal))
      .concat(this.convertBBand(currentSignal))
      .concat(this.comparePrices(currentSignal.vwma, close))
      .concat(this.comparePrices(currentSignal.high, close))
      .concat(this.comparePrices(currentSignal.low, close))
      .concat(this.convertRecommendations(currentSignal))
      .concat([_.round(DecisionService.getPercentChange(close, currentSignal.vwma), 3) * 100])
      .concat([_.round(DecisionService.getPercentChange(close, currentSignal.high), 3) * 100])
      .concat([_.round(DecisionService.getPercentChange(close, currentSignal.low), 3) * 100])
      .concat([_.round(currentSignal.mfiLeft, 2)]);

    dataSetObj.output = [this.getOutput(close, futureClose)];
    return dataSetObj;
  }
}

export default new IntradayPredicationService();