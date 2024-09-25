import {
  getCoingeckoPricesData2,
  getTokensData,
  PoolData,
  PoolStatsData,
  printBigint,
  TimeData,
  TokenStatsData,
} from "./utils";
import fs from "fs";
import { Network, PoolKey } from "@invariant-labs/a0-sdk";

export const createSnapshotForNetwork = async (network: Network) => {
  let fileName: string;
  let dataFileName: string;
  // let poolsApyFileName: string;

  switch (network) {
    case Network.Mainnet:
      fileName = "../data/a0/full_mainnet.json";
      dataFileName = "../data/a0/mainnet.json";
      // poolsApyFileName = "../data/a0/pool_apy_mainnet.json";
      break;
    default:
      fileName = "../data/a0/full_testnet.json";
      dataFileName = "../data/a0/testnet.json";
      // poolsApyFileName = "../data/a0/pool_apy_testnet.json";
      break;
  }

  const data: Record<string, PoolStatsData> = JSON.parse(
    fs.readFileSync(dataFileName, "utf-8")
  );

  const volume24 = {
    value: 0,
    change: 0,
  };
  const tvl24 = {
    value: 0,
    change: 0,
  };
  const fees24 = {
    value: 0,
    change: 0,
  };

  const tokensDataObject: Record<string, TokenStatsData> = {};
  let poolsData: PoolData[] = [];

  const volumeForTimestamps: Record<string, number> = {};
  const liquidityForTimestamps: Record<string, number> = {};
  const feesForTimestamps: Record<string, number> = {};

  const lastTimestamp = Math.max(
    ...Object.values(data)
      .filter(({ snapshots }) => snapshots.length > 0)
      .map(({ snapshots }) => +snapshots[snapshots.length - 1].timestamp)
  );

  Object.entries(data).forEach(([poolKey, poolStatsData]) => {
    const snapshots = poolStatsData.snapshots;
    const parsedPoolKey: PoolKey = JSON.parse(poolKey);

    if (!tokensDataObject[parsedPoolKey.tokenX]) {
      tokensDataObject[parsedPoolKey.tokenX] = {
        address: parsedPoolKey.tokenX,
        price: 0,
        volume24: 0,
        tvl: 0,
      };
    }

    if (!tokensDataObject[parsedPoolKey.tokenY]) {
      tokensDataObject[parsedPoolKey.tokenY] = {
        address: parsedPoolKey.tokenY,
        price: 0,
        volume24: 0,
        tvl: 0,
      };
    }

    if (!snapshots.length) {
      poolsData.push({
        volume24: 0,
        tvl: 0,
        tokenX: parsedPoolKey.tokenX,
        tokenY: parsedPoolKey.tokenY,
        fee: +printBigint(parsedPoolKey.feeTier.fee, 10n),
        // apy: poolsApy[address] ?? 0,
      });
      return;
    }

    const tokenX = parsedPoolKey.tokenX;
    const tokenY = parsedPoolKey.tokenY;

    const lastSnapshot = snapshots[snapshots.length - 1];

    tokensDataObject[tokenX].volume24 +=
      lastSnapshot.timestamp === lastTimestamp
        ? lastSnapshot.volumeX.usdValue24
        : 0;
    tokensDataObject[tokenY].volume24 +=
      lastSnapshot.timestamp === lastTimestamp
        ? lastSnapshot.volumeY.usdValue24
        : 0;
    tokensDataObject[tokenX].tvl += lastSnapshot.liquidityX.usdValue24;
    tokensDataObject[tokenY].tvl += lastSnapshot.liquidityY.usdValue24;

    poolsData.push({
      volume24:
        lastSnapshot.timestamp === lastTimestamp
          ? lastSnapshot.volumeX.usdValue24 + lastSnapshot.volumeY.usdValue24
          : 0,
      tvl:
        lastSnapshot.timestamp === lastTimestamp
          ? lastSnapshot.liquidityX.usdValue24 +
            lastSnapshot.liquidityY.usdValue24
          : 0,
      tokenX: parsedPoolKey.tokenX,
      tokenY: parsedPoolKey.tokenY,
      fee: +printBigint(parsedPoolKey.feeTier.fee, 10n),
      // apy: poolsApy[address] ?? 0,
    });

    snapshots.slice(-30).forEach((snapshot) => {
      const timestamp = snapshot.timestamp.toString();

      if (!volumeForTimestamps[timestamp]) {
        volumeForTimestamps[timestamp] = 0;
      }

      if (!liquidityForTimestamps[timestamp]) {
        liquidityForTimestamps[timestamp] = 0;
      }

      if (!feesForTimestamps[timestamp]) {
        feesForTimestamps[timestamp] = 0;
      }

      volumeForTimestamps[timestamp] +=
        snapshot.volumeX.usdValue24 + snapshot.volumeY.usdValue24;
      liquidityForTimestamps[timestamp] +=
        snapshot.liquidityX.usdValue24 + snapshot.liquidityY.usdValue24;
      feesForTimestamps[timestamp] +=
        snapshot.feeX.usdValue24 + snapshot.feeY.usdValue24;
    });
  });

  const tokensPricesData = await getCoingeckoPricesData2();
  const allTokens = getTokensData(network);

  tokensPricesData.forEach((token) => {
    Object.entries(allTokens).forEach(([address, tokenData]) => {
      if (tokenData.coingeckoId === token.id && tokensDataObject[address]) {
        tokensDataObject[address].price = token.current_price;
      }
    });
  });

  const volumePlot: TimeData[] = Object.entries(volumeForTimestamps)
    .map(([timestamp, value]) => ({
      timestamp: +timestamp,
      value,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  const liquidityPlot: TimeData[] = Object.entries(liquidityForTimestamps)
    .map(([timestamp, value]) => ({
      timestamp: +timestamp,
      value,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  const feePlot: TimeData[] = Object.entries(feesForTimestamps)
    .map(([timestamp, value]) => ({
      timestamp: +timestamp,
      value,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const tiersToOmit = [0.001, 0.003];

  poolsData = poolsData.filter((pool) => !tiersToOmit.includes(pool.fee));

  volume24.value = volumePlot.length
    ? volumePlot[volumePlot.length - 1].value
    : 0;
  tvl24.value = liquidityPlot.length
    ? liquidityPlot[liquidityPlot.length - 1].value
    : 0;
  fees24.value = feePlot.length ? feePlot[feePlot.length - 1].value : 0;

  const prevVolume24 =
    volumePlot.length > 1 ? volumePlot[volumePlot.length - 2].value : 0;
  const prevTvl24 =
    liquidityPlot.length > 1
      ? liquidityPlot[liquidityPlot.length - 2].value
      : 0;
  const prevFees24 = feePlot.length > 1 ? feePlot[feePlot.length - 2].value : 0;

  volume24.change = prevVolume24
    ? ((volume24.value - prevVolume24) / prevVolume24) * 100
    : 0;
  tvl24.change = prevTvl24 ? ((tvl24.value - prevTvl24) / prevTvl24) * 100 : 0;
  fees24.change = prevFees24
    ? ((fees24.value - prevFees24) / prevFees24) * 100
    : 0;

  fs.writeFileSync(
    fileName,
    JSON.stringify({
      volume24,
      tvl24,
      fees24,
      tokensData: Object.values(tokensDataObject),
      poolsData,
      volumePlot,
      liquidityPlot,
    })
  );
};

createSnapshotForNetwork(Network.Mainnet).then(
  () => {
    console.log("Full mainnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

createSnapshotForNetwork(Network.Testnet).then(
  () => {
    console.log("Full testnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
