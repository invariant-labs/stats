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
  isSameWeek,
  PoolStatsData,
  readPoolsFromCache,
  isSameMonth,
  PoolIntervalPlots,
  IntervalStats,
  generateEmptyTotalIntevalStats,
  printBN,
  TIERS_TO_OMIT,
  isSameYear,
  Intervals,
  getTokensPrices,
  TimeData,
  calculateAPYForInterval,
  isSameDay,
  getWeekNumber,
  getMonthNumber,
  getYear,
  arithmeticAvg,
  getIntervalRange,
  getEmptyIntervalsData,
} from "./utils";
import { AnchorProvider } from "@coral-xyz/anchor";
import { DECIMAL } from "@invariant-labs/sdk-eclipse/lib/utils";
import { BN } from "bn.js";

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

  const totalStats: IntervalStats = {
    daily: generateEmptyTotalIntevalStats(),
    weekly: generateEmptyTotalIntevalStats(),
    monthly: generateEmptyTotalIntevalStats(),
    yearly: generateEmptyTotalIntevalStats(),
    all: generateEmptyTotalIntevalStats(),
  };
  const poolKeys = Object.keys(snaps);

  const poolStatsHelper = {
    daily: {},
    weekly: {},
    monthly: {},
    yearly: {},
    all: {},
  };

  const tokenStatsHelper = {
    daily: {},
    weekly: {},
    monthly: {},
    yearly: {},
    all: {},
  };

  const tokenTVLHelper = {
    daily: {},
    weekly: {},
    monthly: {},
    yearly: {},
    all: {},
  };

  const poolTvlHelper = {
    daily: {},
    weekly: {},
    monthly: {},
    yearly: {},
    all: {},
  };

  for (let poolKey of poolKeys) {
    let pool = allPools.find(
      (pool) =>
        new Pair(pool.tokenX, pool.tokenY, {
          fee: new BN(pool.fee, "hex"),
          tickSpacing: pool.tickSpacing,
        })
          .getAddress(market.program.programId)
          .toString() === poolKey
    );

    if (!pool) {
      pool = await market.getPoolByAddress(new PublicKey(poolKey));
    }

    if (TIERS_TO_OMIT.includes(+printBN(pool.fee, DECIMAL - 2))) {
      continue;
    }

    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
    });
    const address = pair.getAddress(market.program.programId);

    const intervalsFileName = `${intervalsPath}${address.toString()}.json`;

    const intervals: PoolIntervalPlots = getEmptyIntervalsData();

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

    const totalSnaps = associatedSnaps.length;

    for (const [index, snap] of associatedSnaps.entries()) {
      const plotTimestamp = +snap.timestamp;

      const volume = Math.abs(
        snap.volumeX.usdValue24 + snap.volumeY.usdValue24
      );
      const tvl = Math.abs(
        snap.liquidityX.usdValue24 + snap.liquidityY.usdValue24
      );
      const fees = Math.abs(snap.feeX.usdValue24 + snap.feeY.usdValue24);

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

        const compoundEntry = shouldCompound(
          relatedEntryTimestamp,
          plotTimestamp
        );

        if (compoundEntry && intervals[key].volumePlot[entryIndex]) {
          intervals[key].volumePlot[entryIndex].value += volume;
          intervals[key].feesPlot[entryIndex].value += fees;
          poolTvlHelper[key][address.toString()].push(Math.abs(tvl));

          const avgTVL = Math.abs(
            arithmeticAvg(...poolTvlHelper[key][address.toString()])
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
          poolTvlHelper[key][address.toString()] = [Math.abs(tvl)];
        }

        // Add Pool to global stats
        {
          const existingAnchors = totalStats[key].volumePlot.map((entry) =>
            getAnchorDate(entry.timestamp)
          );

          const anchorExists = existingAnchors.some(
            (entry) => entry === anchor
          );
          const entryIndex = findIndexForEntry(totalStats[key].volumePlot);

          if (anchorExists) {
            totalStats[key].volumePlot[entryIndex].value += volume;
          } else {
            totalStats[key].volumePlot.splice(entryIndex, 0, {
              timestamp: plotTimestamp,
              value: volume,
            });
          }

          const snapsToInclude = getIntervalRange(key);

          if (index >= totalSnaps - snapsToInclude) {
            const poolExists = totalStats[key].poolsData.some(
              (pool) => pool.poolAddress === address.toString()
            );

            if (poolExists) {
              const poolIndex = totalStats[key].poolsData.findIndex(
                (pool) => pool.poolAddress === address.toString()
              );
              poolStatsHelper[key][address.toString()].push(Math.abs(tvl));

              totalStats[key].poolsData[poolIndex].volume += volume;
              totalStats[key].poolsData[poolIndex].tvl = Math.abs(tvl);
              totalStats[key].poolsData[poolIndex].liquidityX =
                snap.liquidityX.usdValue24;
              totalStats[key].poolsData[poolIndex].liquidityY =
                snap.liquidityY.usdValue24;
              totalStats[key].poolsData[poolIndex].lockedX =
                snap.lockedX?.usdValue24 ?? 0;
              totalStats[key].poolsData[poolIndex].lockedY =
                snap.lockedY?.usdValue24 ?? 0;
              totalStats[key].poolsData[poolIndex].apy =
                calculateAPYForInterval(
                  totalStats[key].poolsData[poolIndex].volume,
                  poolStatsHelper[key][address.toString()].reduce(
                    (a, b) => a + b,
                    0
                  ),
                  totalStats[key].poolsData[poolIndex].fee
                );

              totalStats[key].poolsData[poolIndex].tvl = arithmeticAvg(
                ...poolStatsHelper[key][address.toString()]
              );
              intervals[key].apy = totalStats[key].poolsData[poolIndex].apy;
              intervals[key].volume =
                totalStats[key].poolsData[poolIndex].volume;
              intervals[key].tvl = totalStats[key].poolsData[poolIndex].tvl;
              intervals[key].fees =
                intervals[key].volume * +printBN(pool.fee, DECIMAL - 2);
            } else {
              const apy = calculateAPYForInterval(
                volume,
                tvl,
                +printBN(pool.fee, DECIMAL - 2)
              );
              totalStats[key].poolsData.push({
                poolAddress: address.toString(),
                volume,
                tvl: Math.abs(tvl),
                liquidityX: snap.liquidityX.usdValue24,
                liquidityY: snap.liquidityY.usdValue24,
                lockedX: snap.lockedX?.usdValue24 ?? 0,
                lockedY: snap.lockedY?.usdValue24 ?? 0,
                apy,
                fee: +printBN(pool.fee, DECIMAL - 2),
                tokenX: pool.tokenX.toString(),
                tokenY: pool.tokenY.toString(),
              });
              poolStatsHelper[key][address.toString()] = [Math.abs(tvl)];
              intervals[key].apy = apy;
              intervals[key].volume = volume;
              intervals[key].tvl = tvl;
              intervals[key].fees = fees;
            }

            const updateTokenData = (x: boolean) => {
              const tokenAddress = x
                ? pool.tokenX.toString()
                : pool.tokenY.toString();
              const volume = x
                ? snap.volumeX.usdValue24
                : snap.volumeY.usdValue24;
              const liquidity = x
                ? snap.liquidityX.usdValue24
                : snap.liquidityY.usdValue24;
              const tokenExists = totalStats[key].tokensData.some(
                (token) => token.address === tokenAddress
              );
              if (tokenExists) {
                const tokenIndex = totalStats[key].tokensData.findIndex(
                  (token) => token.address === tokenAddress
                );
                totalStats[key].tokensData[tokenIndex].volume += volume;
                tokenStatsHelper[key][tokenAddress].push(Math.abs(liquidity));
                if (tokenTVLHelper[key][tokenAddress]) {
                  if (!tokenTVLHelper[key][tokenAddress].has(plotTimestamp)) {
                    tokenTVLHelper[key][tokenAddress].add(plotTimestamp);
                  }
                } else {
                  tokenTVLHelper[key][tokenAddress] = new Set();
                  tokenTVLHelper[key][tokenAddress].add(plotTimestamp);
                }

                totalStats[key].tokensData[tokenIndex].tvl =
                  tokenStatsHelper[key][tokenAddress].reduce(
                    (sum, val) => sum + val,
                    0
                  ) / tokenTVLHelper[key][tokenAddress].size;
              } else {
                totalStats[key].tokensData.push({
                  address: tokenAddress,
                  price: 0,
                  volume,
                  tvl: Math.abs(liquidity),
                });
                tokenStatsHelper[key][tokenAddress] = [Math.abs(liquidity)];
                tokenTVLHelper[key][tokenAddress] = new Set();
                tokenTVLHelper[key][tokenAddress].add(plotTimestamp);
              }
            };
            updateTokenData(true);
            updateTokenData(false);
          }
        }
      };

      processPoolStats(Intervals.Daily, isSameDay, (a) => a);
      processPoolStats(Intervals.Weekly, isSameWeek, getWeekNumber);
      processPoolStats(Intervals.Monthly, isSameMonth, getMonthNumber);
      processPoolStats(Intervals.Yearly, isSameYear, getYear);
      processPoolStats(
        Intervals.All,
        () => true,
        (a) => 1
      );

      fs.writeFileSync(intervalsFileName, JSON.stringify(intervals), "utf-8");
    }
  }

  const buildPlots = (key: Intervals, getAnchorDate: (a: number) => number) => {
    for (const poolKey of poolKeys) {
      const intervalsFileName = `${intervalsPath}${poolKey.toString()}.json`;

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

      const poolFeesPlot = data.feesPlot;

      for (const plotEntry of poolFeesPlot) {
        const anchor = getAnchorDate(plotEntry.timestamp);
        const entryIndex = totalStats[key].feesPlot.findIndex(
          (entry) => getAnchorDate(entry.timestamp) === anchor
        );

        if (entryIndex !== -1) {
          totalStats[key].feesPlot[entryIndex].value += plotEntry.value;
        } else {
          totalStats[key].feesPlot.push({
            timestamp: plotEntry.timestamp,
            value: plotEntry.value,
          });
        }
      }
    }
  };

  buildPlots(Intervals.Daily, (a) => a);
  buildPlots(Intervals.Weekly, getWeekNumber);
  buildPlots(Intervals.Monthly, getMonthNumber);
  buildPlots(Intervals.Yearly, getYear);

  const calculateTotalValues = (key: Intervals) => {
    const range = getIntervalRange(key);

    const totalFees = totalStats.daily.feesPlot
      .slice(0, range)
      .reduce((acc: number, cur: TimeData) => acc + cur.value, 0);
    const totalVolume = totalStats.daily.volumePlot
      .slice(0, range)
      .reduce((acc: number, cur: TimeData) => acc + cur.value, 0);

    const totalLiquidity =
      totalStats.daily.liquidityPlot
        .slice(0, range)
        .reduce((acc: number, cur: TimeData) => acc + cur.value, 0) / range;

    const previousFees = totalStats.daily.feesPlot
      .slice(range, range * 2)
      .reduce((acc: number, cur: TimeData) => acc + cur.value, 0);
    const previousVolume = totalStats.daily.volumePlot
      .slice(range, range * 2)
      .reduce((acc: number, cur: TimeData) => acc + cur.value, 0);

    const previousLiquidity =
      totalStats.daily.liquidityPlot
        .slice(range, range * 2)
        .reduce((acc: number, cur: TimeData) => acc + cur.value, 0) / range;

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
  calculateTotalValues(Intervals.All);

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
  assignPrice(Intervals.All);

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

createSnapshotForNetwork(Network.TEST).then(
  () => {
    console.log("Eclipse: Testnet intervals aggregated!");
  },
  (err) => {
    console.log(err);
  }
);

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Eclipse: Mainnet intervals aggregated!");
  },
  (err) => {
    console.log(err);
  }
);
