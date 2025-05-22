import {
  Network,
  Market,
  getMarketAddress,
  Pair,
  IWallet,
} from "@invariant-labs/sdk-eclipse";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_DATA from "../../data/eclipse/devnet.json";
import TESTNET_DATA from "../../data/eclipse/testnet.json";
import MAINNET_DATA from "../../data/eclipse/mainnet.json";
import DEVNET_APY_ARCHIVE from "../../data/eclipse/daily_pool_apy_devnet.json";
import TESTNET_APY_ARCHIVE from "../../data/eclipse/daily_pool_apy_testnet.json";
import MAINNET_APY_ARCHIVE from "../../data/eclipse/daily_pool_apy_mainnet.json";
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
  TimeData,
  calculateAPYForInterval,
  isSameDay,
  getWeekNumber,
  getMonthNumber,
  getYear,
} from "./utils";
import { AnchorProvider } from "@coral-xyz/anchor";
import { DECIMAL } from "@invariant-labs/sdk-eclipse/lib/utils";
import path from "path";

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
      fileName = "../data/eclipse/mainnet_intervals.json";
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

  const allPools = useCache
    ? readPoolsFromCache(poolsCacheFileName)
    : await market.getAllPools();

  const totalStats: IntervalStats = JSON.parse(
    fs.readFileSync(fileName, "utf-8")
  );

  let plotTimestamp = 0;

  for (let pool of allPools) {
    if (TIERS_TO_OMIT.includes(+printBN(pool.fee, DECIMAL - 2))) {
      continue;
    }

    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
    });
    const address = pair.getAddress(market.program.programId);

    const intervalsFileName = `${intervalsPath}${address.toString()}.json`;
    const intervals: PoolIntervalPlots = fs.existsSync(intervalsFileName)
      ? JSON.parse(fs.readFileSync(intervalsFileName, "utf-8"))
      : {
          daily: {
            volumePlot: [],
            liquidityPlot: [],
            feesPlot: [],
            apyPlot: [],
          },
          weekly: {
            volumePlot: [],
            liquidityPlot: [],
            feesPlot: [],
            apyPlot: [],
          },
          monthly: {
            volumePlot: [],
            liquidityPlot: [],
            feesPlot: [],
            apyPlot: [],
          },
          yearly: {
            volumePlot: [],
            liquidityPlot: [],
            feesPlot: [],
            apyPlot: [],
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
    const latestSnap = associatedSnaps[associatedSnaps.length - 1];

    plotTimestamp = +latestSnap.timestamp;
    const APY = apy[address.toString()] ?? 0;
    const volume =
      latestSnap.volumeX.usdValue24 + latestSnap.volumeY.usdValue24;
    const tvl =
      latestSnap.liquidityX.usdValue24 + latestSnap.liquidityY.usdValue24;
    const fees = latestSnap.feeX.usdValue24 + latestSnap.feeY.usdValue24;

    const processPoolStats = (
      key: Intervals,
      shouldCompound: (a: number, b: number) => boolean,
      getAnchorDate: (a: number) => number
    ) => {
      const anchor = getAnchorDate(plotTimestamp);

      const findIndexForEntry = (arr: TimeData[]) => {
        let index = 0;
        for (let i = 0; i < arr.length; i++) {
          if (getAnchorDate(arr[i].timestamp) === anchor) {
            index = i;
            break;
          }
        }
        return index;
      };

      const entryIndex = findIndexForEntry(intervals[key].volumePlot);

      const relatedEntryTimestamp =
        intervals[key].volumePlot[entryIndex]?.timestamp ?? 0;

      const weight =
        relatedEntryTimestamp === 0
          ? 1
          : calculateWeightFromTimestamps(relatedEntryTimestamp, plotTimestamp);

      const compoundEntry = shouldCompound(
        relatedEntryTimestamp,
        plotTimestamp
      );

      if (compoundEntry) {
        intervals[key].volumePlot[entryIndex].value += volume;
        intervals[key].feesPlot[entryIndex].value += fees;

        const avgTVL = Math.abs(
          weightedArithmeticAvg(
            {
              val: intervals[key].liquidityPlot[entryIndex].value,
              weight,
            },
            { val: tvl, weight: 1 }
          )
        );

        intervals[key].liquidityPlot[entryIndex].value = avgTVL;
      } else {
        intervals[key].volumePlot.splice(entryIndex, 0, {
          timestamp: plotTimestamp,
          value: volume,
        });
        intervals[key].liquidityPlot.splice(entryIndex, 0, {
          timestamp: plotTimestamp,
          value: Math.abs(tvl),
        });
        intervals[key].feesPlot.splice(entryIndex, 0, {
          timestamp: plotTimestamp,
          value: fees,
        });
      }

      // Add Pool to global stats
      {
        const existingAnchors = totalStats[key].volumePlot.map((entry) =>
          getAnchorDate(entry.timestamp)
        );

        const anchorExists = existingAnchors.some((entry) => entry === anchor);
        const entryIndex = findIndexForEntry(totalStats[key].volumePlot);

        if (anchorExists) {
          totalStats[key].volumePlot[entryIndex].value += volume;
        } else {
          totalStats[key].volumePlot.splice(entryIndex, 0, {
            timestamp: plotTimestamp,
            value: volume,
          });
        }

        const poolExists = totalStats[key].poolsData.some(
          (pool) => pool.poolAddress === address.toString()
        );
        if (poolExists) {
          const poolIndex = totalStats[key].poolsData.findIndex(
            (pool) => pool.poolAddress === address.toString()
          );
          totalStats[key].poolsData[poolIndex].volume += volume;
          totalStats[key].poolsData[poolIndex].tvl = Math.abs(tvl);
          totalStats[key].poolsData[poolIndex].liquidityX =
            latestSnap.liquidityX.usdValue24;
          totalStats[key].poolsData[poolIndex].liquidityY =
            latestSnap.liquidityY.usdValue24;
          totalStats[key].poolsData[poolIndex].lockedX =
            latestSnap.lockedX?.usdValue24 ?? 0;
          totalStats[key].poolsData[poolIndex].lockedY =
            latestSnap.lockedY?.usdValue24 ?? 0;
          totalStats[key].poolsData[poolIndex].apy =
            key === Intervals.Daily
              ? APY
              : calculateAPYForInterval(
                  key,
                  totalStats[key].poolsData[poolIndex].volume,
                  totalStats[key].poolsData[poolIndex].tvl,
                  totalStats[key].poolsData[poolIndex].fee
                );
        } else {
          totalStats[key].poolsData.push({
            poolAddress: address.toString(),
            volume,
            tvl: Math.abs(tvl),
            liquidityX: latestSnap.liquidityX.usdValue24,
            liquidityY: latestSnap.liquidityY.usdValue24,
            lockedX: latestSnap.lockedX?.usdValue24 ?? 0,
            lockedY: latestSnap.lockedY?.usdValue24 ?? 0,
            apy:
              key === Intervals.Daily
                ? APY
                : calculateAPYForInterval(
                    key,
                    volume,
                    tvl,
                    +printBN(pool.fee, DECIMAL - 2)
                  ),
            fee: +printBN(pool.fee, DECIMAL - 2),
            tokenX: pool.tokenX.toString(),
            tokenY: pool.tokenY.toString(),
          });
        }
        const updateTokenData = (x: boolean) => {
          const address = x ? pool.tokenX.toString() : pool.tokenY.toString();
          const volume = x
            ? latestSnap.volumeX.usdValue24
            : latestSnap.volumeY.usdValue24;
          const liquidity = x
            ? latestSnap.liquidityX.usdValue24
            : latestSnap.liquidityY.usdValue24;
          const tokenExists = totalStats[key].tokensData.some(
            (token) => token.address === address
          );
          if (tokenExists) {
            const tokenIndex = totalStats[key].tokensData.findIndex(
              (token) => token.address === address
            );
            totalStats[key].tokensData[tokenIndex].volume += volume;
            totalStats[key].tokensData[tokenIndex].tvl = Math.abs(liquidity);
          } else {
            totalStats[key].tokensData.push({
              address,
              price: 0,
              volume,
              tvl: Math.abs(liquidity),
            });
          }
          updateTokenData(true);
          updateTokenData(false);
        };
      }
    };

    processPoolStats(Intervals.Daily, isSameDay, (a) => a);
    processPoolStats(Intervals.Weekly, isSameWeek, getWeekNumber);
    processPoolStats(Intervals.Monthly, isSameMonth, getMonthNumber);
    processPoolStats(Intervals.Yearly, isSameYear, getYear);

    fs.writeFileSync(intervalsFileName, JSON.stringify(intervals), "utf-8");
  }

  const buildLiquidityPlot = (
    key: Intervals,
    getAnchorDate: (a: number) => number
  ) => {
    // TODO: Optimize this
    totalStats[key].liquidityPlot = [];
    for (const pool of allPools) {
      // if (!whitelistedPools.includes(poolKey)) {
      //   continue;
      // }
      const pair = new Pair(pool.tokenX, pool.tokenY, {
        fee: pool.fee,
        tickSpacing: pool.tickSpacing,
      });
      const address = pair.getAddress(market.program.programId);

      const intervalsFileName = `${intervalsPath}${address.toString()}.json`;
      const data = JSON.parse(fs.readFileSync(intervalsFileName, "utf-8"))[key];
      const poolLiquidityPlot = data.liquidityPlot;

      for (const plotEntry of poolLiquidityPlot) {
        const anchor = getAnchorDate(plotEntry.timestamp);
        const entryIndex = totalStats[key].liquidityPlot.findIndex(
          (entry) => getAnchorDate(entry.timestamp) === anchor
        );

        if (entryIndex !== -1) {
          totalStats[key].liquidityPlot[entryIndex].value += plotEntry.value;
        } else {
          totalStats[key].liquidityPlot.push({
            timestamp: plotEntry.timestamp,
            value: plotEntry.value,
          });
        }
      }
    }
  };

  buildLiquidityPlot(Intervals.Daily, (a) => a);
  buildLiquidityPlot(Intervals.Weekly, getWeekNumber);
  buildLiquidityPlot(Intervals.Monthly, getMonthNumber);
  buildLiquidityPlot(Intervals.Yearly, getYear);

  const feesHelper = {
    daily: { current: 0, previous: 0 },
    weekly: { current: 0, previous: 0 },
    monthly: { current: 0, previous: 0 },
    yearly: { current: 0, previous: 0 },
  };
  const buildFeesHelper = (key: Intervals) => {
    for (const pool of allPools) {
      const pair = new Pair(pool.tokenX, pool.tokenY, {
        fee: pool.fee,
        tickSpacing: pool.tickSpacing,
      });
      const address = pair.getAddress(market.program.programId);

      const intervalsFileName = `${intervalsPath}${address.toString()}.json`;

      const data = JSON.parse(fs.readFileSync(intervalsFileName, "utf-8"))[key];
      const feesPlot = data.feesPlot;

      const recentEntry = feesPlot[0];
      const previousEntry = feesPlot[1];
      const currentFees = recentEntry?.value ?? 0;
      const previousFees = previousEntry?.value ?? 0;
      feesHelper[key].current += currentFees;
      feesHelper[key].previous += previousFees;
    }
  };

  buildFeesHelper(Intervals.Daily);
  buildFeesHelper(Intervals.Weekly);
  buildFeesHelper(Intervals.Monthly);
  buildFeesHelper(Intervals.Yearly);

  const calculateTotalValues = (key: Intervals) => {
    const totalVolume = totalStats[key].volumePlot[0]?.value ?? 0;
    const totalFees = feesHelper[key].current;
    const totalLiquidity = totalStats[key].liquidityPlot[0]?.value ?? 0;

    const previousVolume = totalStats[key].volumePlot[1]?.value ?? 0;
    const previousFees = feesHelper[key].previous;
    const previousLiquidity = totalStats[key].liquidityPlot[1]?.value ?? 0;

    const volumeChange =
      ((totalVolume - previousVolume) / previousVolume) * 100;
    const feesChange = ((totalFees - previousFees) / previousFees) * 100;
    const liquidityChange =
      ((totalLiquidity - previousLiquidity) / previousLiquidity) * 100;
    totalStats[key].volume = { value: totalVolume, change: volumeChange };
    totalStats[key].fees = { value: totalFees, change: feesChange };
    totalStats[key].tvl = {
      value: totalLiquidity,
      change: liquidityChange,
    };
  };

  calculateTotalValues(Intervals.Daily);
  calculateTotalValues(Intervals.Weekly);
  calculateTotalValues(Intervals.Monthly);
  calculateTotalValues(Intervals.Yearly);

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
