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
} from "./utils";
import { AnchorProvider } from "@coral-xyz/anchor";
import { DECIMAL } from "@invariant-labs/sdk-eclipse/lib/utils";

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

  const totalIntervals: IntervalStats = JSON.parse(
    fs.readFileSync(fileName, "utf-8")
  );

  let plotTimestamp = 0;

  const tokensStats = {};

  const totalStats = {
    daily: generateEmptyTotalIntevalStats(),
    weekly: generateEmptyTotalIntevalStats(),
    monthly: generateEmptyTotalIntevalStats(),
    yearly: generateEmptyTotalIntevalStats(),
  };

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

      if (compoundEntry) {
        intervals[key].volumePlot[lastEntryIndex].value += volume;
        intervals[key].feesPlot[lastEntryIndex].value += fees;

        intervals[key].liquidityPlot[lastEntryIndex].value =
          weightedArithmeticAvg(
            {
              val: intervals[key].liquidityPlot[lastEntryIndex].value,
              weight,
            },
            { val: tvl, weight: 1 }
          );
      } else {
        intervals[key].volumePlot.push({
          timestamp: plotTimestamp,
          value: volume,
        });
        intervals[key].liquidityPlot.push({
          timestamp: plotTimestamp,
          value: tvl,
        });
        intervals[key].feesPlot.push({
          timestamp: plotTimestamp,
          value: fees,
        });
      }

      const index = compoundEntry ? lastEntryIndex : lastEntryIndex + 1;
      totalStats[key].volume.value += intervals[key].volumePlot[index].value;
      // weeklyStats.tvl.value += intervals[key].liquidityPlot[index].value;
      const weightedTVL = weightedArithmeticAvg(
        { val: intervals[key].liquidityPlot[index].value, weight },
        { val: tvl, weight: 1 }
      );
      totalStats[key].tvl.value += weightedTVL;
      totalStats[key].fees.value += intervals[key].feesPlot[index].value;

      totalStats[key].poolsData.push({
        poolAddress: address.toString(),
        tokenX: pool.tokenX.toString(),
        tokenY: pool.tokenY.toString(),
        liquidityX: latestSnap.liquidityX.usdValue24,
        liquidityY: latestSnap.liquidityY.usdValue24,
        lockedX: latestSnap.lockedX?.usdValue24 ?? 0,
        lockedY: latestSnap.lockedY?.usdValue24 ?? 0,
        volume: intervals[key].volumePlot[index].value,
        // tvl: intervals[key].liquidityPlot[index].value,
        tvl: weightedTVL,
        fee: +printBN(pool.fee, DECIMAL - 2),
        apy: APY,
      });

      if (key === Intervals.Daily) {
        const tokenX = pool.tokenX.toString();
        const tokenY = pool.tokenY.toString();
        if (tokensStats[tokenX]) {
          tokensStats[tokenX].volume += latestSnap.volumeX.usdValue24;
          tokensStats[tokenX].tvl += latestSnap.liquidityX.usdValue24;
        } else {
          tokensStats[tokenX] = {
            address: tokenX,
            volume: latestSnap.volumeX.usdValue24,
            tvl: latestSnap.liquidityX.usdValue24,
            price: 0,
          };
        }
        if (tokensStats[tokenY]) {
          tokensStats[tokenY].volume += latestSnap.volumeY.usdValue24;
          tokensStats[tokenY].tvl += latestSnap.liquidityY.usdValue24;
        } else {
          tokensStats[tokenY] = {
            address: tokenY,
            volume: latestSnap.volumeY.usdValue24,
            tvl: latestSnap.liquidityY.usdValue24,
            price: 0,
          };
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

  Object.entries(tokenPrices).forEach(([addr, { price }]) => {
    if (tokensStats[addr]) {
      tokensStats[addr].price = price;
    }
  });

  const processGlobalStats = (
    key: Intervals,
    shouldCompound: (a: number, b: number) => boolean
  ) => {
    const stats = totalStats[key];
    const compound = shouldCompound(
      totalIntervals[key].volumePlot[totalIntervals[key].volumePlot.length - 1]
        ?.timestamp,
      plotTimestamp
    );
    if (compound) {
      totalIntervals[key].volumePlot[
        totalIntervals[key].volumePlot.length - 1
      ].value = stats.volume.value;
      totalIntervals[key].liquidityPlot[
        totalIntervals[key].liquidityPlot.length - 1
      ].value = stats.tvl.value;
      totalIntervals[key].volume.change = calculateChangeFromValues(
        totalIntervals[key].volume.value,
        stats.volume.value,
        totalIntervals[key].volume.change
      );
      totalIntervals[key].tvl.change = calculateChangeFromValues(
        totalIntervals[key].tvl.value,
        stats.tvl.value,
        totalIntervals[key].tvl.change
      );
      totalIntervals[key].fees.change = calculateChangeFromValues(
        totalIntervals[key].fees.value,
        stats.fees.value,
        totalIntervals[key].fees.change
      );
      totalIntervals[key].volume.value = stats.volume.value;
      totalIntervals[key].tvl.value = stats.tvl.value;
      totalIntervals[key].fees.value = stats.fees.value;
      totalIntervals[key].poolsData = stats.poolsData;
      const weight = calculateWeightFromTimestamps(
        totalIntervals[key].volumePlot[
          totalIntervals[key].volumePlot.length - 1
        ].timestamp,
        plotTimestamp
      );
      totalIntervals[key].tokensData = Object.values(tokensStats).map(
        (tokenStats: any) => {
          const prevValue = totalIntervals[key].tokensData.find(
            (token) => token.address === tokenStats.address
          );
          if (prevValue) {
            return {
              volume: prevValue.volume + tokenStats.volume,
              tvl: weightedArithmeticAvg(
                { val: prevValue.tvl, weight },
                { val: tokenStats.tvl, weight: 1 }
              ),
              address: tokenStats.address,
              price: tokenStats.price,
            };
          } else {
            return tokenStats;
          }
        }
      );
    } else {
      const prevVolume = totalIntervals[key].volume.value;
      const prevTvl = totalIntervals[key].tvl.value;
      const prevFees = totalIntervals[key].fees.value;
      totalIntervals[key].volumePlot.push({
        timestamp: plotTimestamp,
        value: stats.volume.value,
      });
      totalIntervals[key].liquidityPlot.push({
        timestamp: plotTimestamp,
        value: stats.tvl.value,
      });
      totalIntervals[key].volume.value = stats.volume.value;
      totalIntervals[key].tvl.value = stats.tvl.value;
      totalIntervals[key].fees.value = stats.fees.value;
      totalIntervals[key].poolsData = stats.poolsData;
      totalIntervals[key].volume.change =
        ((stats.volume.value - prevVolume) / prevVolume) * 100;
      totalIntervals[key].tvl.change =
        ((stats.tvl.value - prevTvl) / prevTvl) * 100;
      totalIntervals[key].fees.change =
        ((stats.fees.value - prevFees) / prevFees) * 100;
      totalIntervals[key].tokensData = Object.values(tokensStats);
    }
  };

  processGlobalStats(Intervals.Daily, (_a: number, _b: number) => false);
  processGlobalStats(Intervals.Weekly, isSameWeek);
  processGlobalStats(Intervals.Monthly, isSameMonth);
  processGlobalStats(Intervals.Yearly, isSameYear);

  fs.writeFileSync(fileName, JSON.stringify(totalIntervals), "utf-8");
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
