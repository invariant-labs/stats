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
import {
  isSameWeek,
  PoolStatsData,
  isSameMonth,
  PoolIntervalPlots,
  IntervalStats,
  generateEmptyTotalIntevalStats,
  printBN,
  TIERS_TO_OMIT,
  isSameYear,
  Intervals,
  getTokensPrices,
  isSameDay,
  TimeData,
  getWeekNumber,
  getMonthNumber,
  getYear,
  calculateAPYForInterval,
  arithmeticAvg,
} from "../eclipse/src/utils";
import { AnchorProvider } from "@coral-xyz/anchor";
import { DECIMAL } from "@invariant-labs/sdk-eclipse/lib/utils";
import path from "path";

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: AnchorProvider;
  let intervalsPath: string;
  let fileName: string;
  let snaps: Record<string, PoolStatsData>;

  switch (network) {
    case Network.DEV:
      provider = AnchorProvider.local(
        "https://staging-rpc.dev2.eclipsenetwork.xyz"
      );
      snaps = DEVNET_DATA;
      intervalsPath = "../data/eclipse/intervals/devnet/";
      fileName = "../data/eclipse/devnet_intervals.json";
      break;
    case Network.TEST:
      provider = AnchorProvider.local(
        "https://testnet.dev2.eclipsenetwork.xyz"
      );
      // @ts-ignore
      snaps = TESTNET_DATA;
      intervalsPath = "../data/eclipse/intervals/testnet/";
      fileName = "../data/eclipse/testnet_intervals.json";
      break;
    case Network.MAIN:
      provider = AnchorProvider.local("https://eclipse.helius-rpc.com");
      // @ts-ignore
      snaps = MAINNET_DATA;
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

  const totalStats: IntervalStats = {
    daily: generateEmptyTotalIntevalStats(),
    weekly: generateEmptyTotalIntevalStats(),
    monthly: generateEmptyTotalIntevalStats(),
    yearly: generateEmptyTotalIntevalStats(),
  };

  // const whitelistedPools = [
  //   "HRgVv1pyBLXdsAddq4ubSqo8xdQWRrYbvmXqEDtectce",
  //   "E2B7KUFwjxrsy9cC17hmadPsxWHD1NufZXTyrtuz8YxC",
  // ];

  const poolKeys = Object.keys(snaps);

  const poolStatsHelper = {
    daily: {},
    weekly: {},
    monthly: {},
    yearly: {},
  };

  const tokenStatsHelper = {
    daily: {},
    weekly: {},
    monthly: {},
    yearly: {},
  };

  const poolTvlHelper = {
    daily: {},
    weekly: {},
    monthly: {},
    yearly: {},
  };

  for (let poolKey of poolKeys) {
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

    const dailyAnchors: number[] = [];
    const weeklyAnchors: number[] = [];
    const monthlyAnchors: number[] = [];
    const yearlyAnchors: number[] = [];

    associatedSnaps.map((snap) => {
      dailyAnchors.push(snap.timestamp);
      weeklyAnchors.push(getWeekNumber(snap.timestamp));
      monthlyAnchors.push(getMonthNumber(snap.timestamp));
      yearlyAnchors.push(getYear(snap.timestamp));
    });

    const dailyLatestAnchor = Math.max(...dailyAnchors);
    const weeklyLatestAnchor = Math.max(...weeklyAnchors);
    const monthlyLatestAnchor = Math.max(...monthlyAnchors);
    const yearlyLatestAnchor = Math.max(...yearlyAnchors);

    for (const snap of associatedSnaps) {
      plotTimestamp = +snap.timestamp;

      const volume = Math.abs(
        snap.volumeX.usdValue24 + snap.volumeY.usdValue24
      );
      const tvl = Math.abs(
        snap.liquidityX.usdValue24 + snap.liquidityY.usdValue24
      );
      const fees = Math.abs(snap.feeX.usdValue24 + snap.feeY.usdValue24);

      const processPoolStats = (
        key: Intervals,
        latestAnchor: number,
        shouldCompound: (a: number, b: number) => boolean,
        getAnchorDate: (a: number) => number
      ) => {
        const anchor = getAnchorDate(plotTimestamp);

        const isLatest = latestAnchor === anchor;

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

        if (compoundEntry) {
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

          if (isLatest) {
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
            } else {
              totalStats[key].poolsData.push({
                poolAddress: address.toString(),
                volume,
                tvl: Math.abs(tvl),
                liquidityX: snap.liquidityX.usdValue24,
                liquidityY: snap.liquidityY.usdValue24,
                lockedX: snap.lockedX?.usdValue24 ?? 0,
                lockedY: snap.lockedY?.usdValue24 ?? 0,
                apy: calculateAPYForInterval(
                  volume,
                  tvl,
                  +printBN(pool.fee, DECIMAL - 2)
                ),
                fee: +printBN(pool.fee, DECIMAL - 2),
                tokenX: pool.tokenX.toString(),
                tokenY: pool.tokenY.toString(),
              });
              poolStatsHelper[key][address.toString()] = [Math.abs(tvl)];
            }

            const updateTokenData = (x: boolean) => {
              const address = x
                ? pool.tokenX.toString()
                : pool.tokenY.toString();
              const volume = x
                ? snap.volumeX.usdValue24
                : snap.volumeY.usdValue24;
              const liquidity = x
                ? snap.liquidityX.usdValue24
                : snap.liquidityY.usdValue24;
              const tokenExists = totalStats[key].tokensData.some(
                (token) => token.address === address
              );
              if (tokenExists) {
                const tokenIndex = totalStats[key].tokensData.findIndex(
                  (token) => token.address === address
                );
                totalStats[key].tokensData[tokenIndex].volume += volume;
                tokenStatsHelper[key][address].push(Math.abs(liquidity));
                totalStats[key].tokensData[tokenIndex].tvl = arithmeticAvg(
                  ...tokenStatsHelper[key][address]
                );
              } else {
                totalStats[key].tokensData.push({
                  address,
                  price: 0,
                  volume,
                  tvl: Math.abs(liquidity),
                });
                tokenStatsHelper[key][address] = [Math.abs(liquidity)];
              }
            };
            updateTokenData(true);
            updateTokenData(false);
          }
        }
      };

      processPoolStats(Intervals.Daily, dailyLatestAnchor, isSameDay, (a) => a);
      processPoolStats(
        Intervals.Weekly,
        weeklyLatestAnchor,
        isSameWeek,
        getWeekNumber
      );
      processPoolStats(
        Intervals.Monthly,
        monthlyLatestAnchor,
        isSameMonth,
        getMonthNumber
      );
      processPoolStats(
        Intervals.Yearly,
        yearlyLatestAnchor,
        isSameYear,
        getYear
      );

      fs.writeFileSync(intervalsFileName, JSON.stringify(intervals), "utf-8");
    }
  }

  const buildLiquidityPlot = (
    key: Intervals,
    getAnchorDate: (a: number) => number
  ) => {
    for (const poolKey of poolKeys) {
      // if (!whitelistedPools.includes(poolKey)) {
      //   continue;
      // }

      const intervalsFileName = path.join(
        __dirname,
        `${intervalsPath}${poolKey.toString()}.json`
      );
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
    for (const poolKey of poolKeys) {
      // if (!whitelistedPools.includes(poolKey)) {
      //   continue;
      // }

      const intervalsFileName = path.join(
        __dirname,
        `${intervalsPath}${poolKey.toString()}.json`
      );
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
