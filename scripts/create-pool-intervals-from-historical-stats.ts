import {
  Network,
  Market,
  getMarketAddress,
  Pair,
  IWallet,
} from "@invariant-labs/sdk-eclipse";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
//@ts-ignore
import DEVNET_DATA from "../data/eclipse/devnet.json";
//@ts-ignore
import TESTNET_DATA from "../data/eclipse/testnet.json";
//@ts-ignore
import MAINNET_DATA from "../data/eclipse/mainnet.json";
//@ts-ignore
import DEVNET_APY_ARCHIVE from "../data/eclipse/daily_pool_apy_devnet.json";
//@ts-ignore
import TESTNET_APY_ARCHIVE from "../data/eclipse/daily_pool_apy_testnet.json";
//@ts-ignore
import MAINNET_APY_ARCHIVE from "../data/eclipse/daily_pool_apy_mainnet.json";
import {
  calculateWeightFromTimestamps,
  isSameWeek,
  PoolStatsData,
  readPoolsFromCache,
  weightedArithmeticAvg,
  isSameMonth,
  PoolIntervalPlots,
  IntervalStats,
  generateEmptyTotalIntevalStats,
  printBN,
  TIERS_TO_OMIT,
  calculateChangeFromValues,
  isSameYear,
  Intervals,
  getTokensPrices,
} from "../eclipse/src/utils";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  dailyFactorPool,
  DECIMAL,
} from "@invariant-labs/sdk-eclipse/lib/utils";
import path from "path";
import { monitorEventLoopDelay } from "perf_hooks";

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: AnchorProvider;
  let intervalsPath: string;
  let fileName: string;
  let snaps: Record<string, PoolStatsData>;
  let apy: Record<string, number>;
  let poolsCacheFileName: string;

  const args = process.argv.slice(2);
  const useCache = Boolean(args[0]);

  switch (network) {
    case Network.DEV:
      provider = AnchorProvider.local(
        "https://staging-rpc.dev2.eclipsenetwork.xyz"
      );
      snaps = DEVNET_DATA;
      apy = DEVNET_APY_ARCHIVE;
      poolsCacheFileName = "../data/eclipse/cache/devnet_pools_cache.json";
      intervalsPath = "../data/eclipse/intervals/devnet/";
      fileName = "../data/eclipse/devnet_intervals.json";
      break;
    case Network.TEST:
      provider = AnchorProvider.local(
        "https://testnet.dev2.eclipsenetwork.xyz"
      );
      // @ts-ignore
      snaps = TESTNET_DATA;
      apy = TESTNET_APY_ARCHIVE;
      poolsCacheFileName = "../data/eclipse/cache/testnet_pools_cache.json";
      intervalsPath = "../data/eclipse/intervals/testnet/";
      fileName = "../data/eclipse/testnet_intervals.json";
      break;
    case Network.MAIN:
      provider = AnchorProvider.local("https://eclipse.helius-rpc.com");
      poolsCacheFileName = "../data/eclipse/cache/mainnet_pools_cache.json";
      // @ts-ignore
      snaps = MAINNET_DATA;
      apy = MAINNET_APY_ARCHIVE;
      intervalsPath = "../data/eclipse/intervals/mainnet/";
      fileName = path.join(__dirname, "../data/eclipse/mainnet_intervals.json");
      break;
    default:
      throw new Error("Unknown network");
  }

  const connection = provider.connection;

  const market = await Market.build(
    network,
    provider.wallet as IWallet,
    connection,
    new PublicKey(getMarketAddress(network))
  );

  let plotTimestamp = 0;

  const tokensStats = {};

  const totalStats: IntervalStats = {
    daily: generateEmptyTotalIntevalStats(),
    weekly: generateEmptyTotalIntevalStats(),
    monthly: generateEmptyTotalIntevalStats(),
    yearly: generateEmptyTotalIntevalStats(),
  };

  const poolKeys = Object.keys(snaps);
  for (let poolKey of poolKeys) {
    if (poolKey !== "HRgVv1pyBLXdsAddq4ubSqo8xdQWRrYbvmXqEDtectce") {
      continue;
    }

    const pool = await market.getPoolByAddress(new PublicKey(poolKey));

    if (TIERS_TO_OMIT.includes(+printBN(pool.fee, DECIMAL - 2))) {
      continue;
    }

    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
    });
    const address = pair.getAddress(market.program.programId);

    const intervalsFileName = path.join(
      __dirname,
      `${intervalsPath}${address.toString()}.json`
    );
    const intervals: PoolIntervalPlots = fs.existsSync(intervalsFileName)
      ? JSON.parse(fs.readFileSync(intervalsFileName, "utf-8"))
      : {
          daily: {
            volumePlot: [],
            liquidityPlot: [],
            feesPlot: [],
          },
          weekly: {
            volumePlot: [],
            liquidityPlot: [],
            feesPlot: [],
          },
          monthly: {
            volumePlot: [],
            liquidityPlot: [],
            feesPlot: [],
          },
          yearly: {
            volumePlot: [],
            liquidityPlot: [],
            feesPlot: [],
          },
        };

    const associatedSnaps = snaps[address.toString()]?.snapshots ?? [
      {
        timestamp: Date.now(),
        volumeX: { usdValue24: 0 },
        volumeY: { usdValue24: 0 },
        liquidityX: { usdValue24: 0 },
        liquidityY: { usdValue24: 0 },
        feeX: { usdValue24: 0 },
        feeY: { usdValue24: 0 },
      },
    ];

    for (const snap of associatedSnaps) {
      plotTimestamp = +snap.timestamp;

      const volume = Math.abs(
        snap.volumeX.usdValue24 + snap.volumeY.usdValue24
      );
      const tvl = Math.abs(
        snap.liquidityX.usdValue24 + snap.liquidityY.usdValue24
      );
      const fees = Math.abs(snap.feeX.usdValue24 + snap.feeY.usdValue24);
      const dailyFactor = dailyFactorPool(new BN(tvl), volume, {
        fee: pool.fee,
        tickSpacing: pool.tickSpacing,
      });
      const APY = (Math.pow(dailyFactor + 1, 365) - 1) * 100;

      const processPoolStats = (
        key: Intervals,
        shouldCompound: (a: number, b: number) => boolean
      ) => {
        const lastEntryIndex = intervals[key].volumePlot.length - 1;

        const lastWeeklyEntryTimestamp =
          intervals[key].volumePlot[lastEntryIndex]?.timestamp ?? 0;
        const weight =
          lastWeeklyEntryTimestamp === 0
            ? 1
            : calculateWeightFromTimestamps(
                lastWeeklyEntryTimestamp,
                plotTimestamp
              );

        const compoundEntry = shouldCompound(
          lastWeeklyEntryTimestamp,
          plotTimestamp
        );

        const updateTokenData = (
          address: string,
          tokenVolume: number,
          tokenTVL: number
        ) => {
          const tokenIndex = totalStats[key].tokensData.findIndex(
            (token) => token.address === address
          );
          if (!compoundEntry) {
            if (tokenIndex !== -1) {
              totalStats[key].tokensData[tokenIndex].volume = tokenVolume;
              totalStats[key].tokensData[tokenIndex].tvl = Math.abs(tokenTVL);
            } else {
              totalStats[key].tokensData.push({
                address,
                volume: tokenVolume,
                price: 0,
                tvl: Math.abs(tokenTVL),
              });
            }
          } else {
            if (tokenIndex !== -1) {
              totalStats[key].tokensData[tokenIndex].volume += tokenVolume;

              const prevTVL = totalStats[key].tokensData[tokenIndex].tvl;
              const avgTVL = weightedArithmeticAvg(
                {
                  val: totalStats[key].tokensData[tokenIndex].tvl,
                  weight,
                },
                { val: tokenTVL, weight: 1 }
              );

              const changeTVL = prevTVL - avgTVL;
              totalStats[key].tokensData[tokenIndex].tvl += changeTVL;
            } else {
              totalStats[key].tokensData.push({
                address,
                volume: tokenVolume,
                price: 0,
                tvl: Math.abs(tokenTVL),
              });
            }
          }
        };

        if (compoundEntry) {
          intervals[key].volumePlot[lastEntryIndex].value += volume;
          intervals[key].feesPlot[lastEntryIndex].value += fees;

          const previousTVL =
            intervals[key].liquidityPlot[lastEntryIndex].value;
          const avgTVL = Math.abs(
            weightedArithmeticAvg(
              {
                val: intervals[key].liquidityPlot[lastEntryIndex].value,
                weight,
              },
              { val: tvl, weight: 1 }
            )
          );
          intervals[key].liquidityPlot[lastEntryIndex].value = avgTVL;

          totalStats[key].volume.value += volume;
          totalStats[key].fees.value += fees;
          const tvlChange = previousTVL - avgTVL;
          totalStats[key].tvl.value += tvlChange;

          totalStats[key].volumePlot[lastEntryIndex].value += volume;
          totalStats[key].liquidityPlot[lastEntryIndex].value += tvlChange;
          totalStats[key].liquidityPlot[lastEntryIndex].value = Math.abs(
            totalStats[key].liquidityPlot[lastEntryIndex].value
          );

          updateTokenData(
            pool.tokenX.toString(),
            snap.volumeX.usdValue24,
            snap.liquidityX.usdValue24
          );
          updateTokenData(
            pool.tokenY.toString(),
            snap.volumeY.usdValue24,
            snap.liquidityY.usdValue24
          );
          const poolIndex = totalStats[key].poolsData.findIndex(
            (pool) => pool.poolAddress === address.toString()
          );
          if (poolIndex !== -1) {
            totalStats[key].poolsData[poolIndex].volume += volume;
            totalStats[key].poolsData[poolIndex].tvl = avgTVL;
            const avgApy = weightedArithmeticAvg(
              { val: totalStats[key].poolsData[poolIndex].apy, weight },
              { val: APY, weight: 1 }
            );
            const avgLiqX = weightedArithmeticAvg(
              { val: totalStats[key].poolsData[poolIndex].liquidityX, weight },
              { val: snap.liquidityX.usdValue24, weight: 1 }
            );
            const avgLiqY = weightedArithmeticAvg(
              { val: totalStats[key].poolsData[poolIndex].liquidityY, weight },
              { val: snap.liquidityY.usdValue24, weight: 1 }
            );
            totalStats[key].poolsData[poolIndex].apy = avgApy;
            totalStats[key].poolsData[poolIndex].liquidityX = avgLiqX;
            totalStats[key].poolsData[poolIndex].liquidityY = avgLiqY;
          } else {
            totalStats[key].poolsData.push({
              poolAddress: address.toString(),
              tokenX: pool.tokenX.toString(),
              tokenY: pool.tokenY.toString(),
              liquidityX: snap.liquidityX.usdValue24,
              liquidityY: snap.liquidityY.usdValue24,
              lockedX: snap.lockedX?.usdValue24 ?? 0,
              lockedY: snap.lockedY?.usdValue24 ?? 0,
              volume,
              tvl: avgTVL,
              fee: +printBN(pool.fee, DECIMAL - 2),
              apy: APY,
            });
          }
        } else {
          intervals[key].volumePlot.push({
            timestamp: plotTimestamp,
            value: volume,
          });
          intervals[key].liquidityPlot.push({
            timestamp: plotTimestamp,
            value: Math.abs(tvl),
          });
          intervals[key].feesPlot.push({
            timestamp: plotTimestamp,
            value: fees,
          });
          totalStats[key].volume.value = volume;
          totalStats[key].fees.value = fees;
          totalStats[key].tvl.value = Math.abs(tvl);
          totalStats[key].volumePlot.push({
            timestamp: plotTimestamp,
            value: volume,
          });
          totalStats[key].liquidityPlot.push({
            timestamp: plotTimestamp,
            value: Math.abs(tvl),
          });
          updateTokenData(
            pool.tokenX.toString(),
            snap.volumeX.usdValue24,
            snap.liquidityX.usdValue24
          );
          updateTokenData(
            pool.tokenY.toString(),
            snap.volumeY.usdValue24,
            snap.liquidityY.usdValue24
          );
          const poolIndex = totalStats[key].poolsData.findIndex(
            (pool) => pool.poolAddress === address.toString()
          );
          if (poolIndex !== -1) {
            totalStats[key].poolsData[poolIndex].volume = volume;
            totalStats[key].poolsData[poolIndex].tvl = tvl;
            totalStats[key].poolsData[poolIndex].apy = APY;
            totalStats[key].poolsData[poolIndex].liquidityX =
              snap.liquidityX.usdValue24;
            totalStats[key].poolsData[poolIndex].liquidityY =
              snap.liquidityY.usdValue24;
          } else {
            totalStats[key].poolsData.push({
              poolAddress: address.toString(),
              tokenX: pool.tokenX.toString(),
              tokenY: pool.tokenY.toString(),
              liquidityX: snap.liquidityX.usdValue24,
              liquidityY: snap.liquidityY.usdValue24,
              lockedX: snap.lockedX?.usdValue24 ?? 0,
              lockedY: snap.lockedY?.usdValue24 ?? 0,
              volume,
              tvl,
              fee: +printBN(pool.fee, DECIMAL - 2),
              apy: APY,
            });
          }
        }
      };

      processPoolStats(Intervals.Daily, (_a: number, _b: number) => false);
      processPoolStats(Intervals.Weekly, isSameWeek);
      processPoolStats(Intervals.Monthly, isSameMonth);
      processPoolStats(Intervals.Yearly, isSameYear);

      fs.writeFileSync(intervalsFileName, JSON.stringify(intervals), "utf-8");
    }
    const tokenPrices = await getTokensPrices(network);

    const assignPrice = (key: Intervals) => {
      totalStats[key].tokensData.forEach((token) => {
        const tokenPrice = tokenPrices[token.address];
        if (tokenPrice) {
          token.price = tokenPrice.price;
        }
      });
    };

    assignPrice(Intervals.Daily);
    assignPrice(Intervals.Weekly);
    assignPrice(Intervals.Monthly);
    assignPrice(Intervals.Yearly);

    fs.writeFileSync(fileName, JSON.stringify(totalStats), "utf-8");
  }
};

// createSnapshotForNetwork(Network.DEV).then(
//   () => {
//     console.log('Eclipse: Devnet pool apy snapshot done!')
//   },
//   (err) => {
//     console.log(err)
//   }
// )

// createSnapshotForNetwork(Network.TEST).then(
//   () => {
//     console.log("Eclipse: Testnet pool apy snapshot done!");
//   },
//   (err) => {
//     console.log(err);
//   }
// );

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Eclipse: Mainnet intervals aggregated!");
  },
  (err) => {
    console.log(err);
  }
);
