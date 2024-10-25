import { getMarketAddress, Market, Network } from "@invariant-labs/sdk-eclipse";
import { Provider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getCoingeckoPricesData2,
  getEclipseTokensData,
  getJupPricesData2,
  getPoolsFromAdresses,
  PoolsApyStatsData,
  PoolStatsData,
  PoolStatsDataWithString,
  PoolWithAddress,
  printBN,
  TimeData,
  TokenStatsDataWithString,
} from "../utils";
import fs from "fs";
import { DECIMAL } from "@invariant-labs/sdk-eclipse/lib/utils";

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider;
  let fileName: string;
  let dataFileName: string;
  let poolsApyFileName: string;

  switch (network) {
    case Network.DEV:
      provider = Provider.local("https://staging-rpc.dev2.eclipsenetwork.xyz");
      fileName = "../data/eclipse/full_devnet.json";
      dataFileName = "../data/eclipse/devnet.json";
      poolsApyFileName = "../data/eclipse/pool_apy_devnet.json";
      break;
    case Network.TEST:
      provider = Provider.local("https://testnet.dev2.eclipsenetwork.xyz");
      fileName = "../data/eclipse/full_testnet.json";
      dataFileName = "../data/eclipse/testnet.json";
      poolsApyFileName = "../data/eclipse/pool_apy_testnet.json";
      break;
    case Network.MAIN:
      provider = Provider.local("https://eclipse.helius-rpc.com");
      fileName = "../data/eclipse/full_mainnet.json";
      dataFileName = "../data/eclipse/mainnet.json";
      poolsApyFileName = "../data/eclipse/pool_apy_mainnet.json";
      break;
    default:
      throw new Error("Unknown network");
  }

  const data: Record<string, PoolStatsData> = JSON.parse(
    fs.readFileSync(dataFileName, "utf-8")
  );
  const poolsApy: Record<string, PoolsApyStatsData> = JSON.parse(
    fs.readFileSync(poolsApyFileName, "utf-8")
  );

  const connection = provider.connection;

  const market = await Market.build(
    network,
    provider.wallet,
    connection,
    new PublicKey(getMarketAddress(network))
  );

  const allPoolsData = await getPoolsFromAdresses(
    Object.keys(data).map((addr) => new PublicKey(addr)),
    market
  );
  const poolsDataObject: Record<string, PoolWithAddress> = {};
  allPoolsData.forEach((pool) => {
    poolsDataObject[pool.address.toString()] = pool;
  });

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

  const tokensDataObject: Record<string, TokenStatsDataWithString> = {};
  let poolsData: PoolStatsDataWithString[] = [];

  const volumeForTimestamps: Record<string, number> = {};
  const liquidityForTimestamps: Record<string, number> = {};
  const feesForTimestamps: Record<string, number> = {};

  const lastTimestamp = Math.max(
    ...Object.values(data)
      .filter(({ snapshots }) => snapshots.length > 0)
      .map(({ snapshots }) => +snapshots[snapshots.length - 1].timestamp)
  );

  Object.entries(data).forEach(([address, poolStatsData]) => {
    const snapshots = poolStatsData.snapshots;

    if (!poolsDataObject[address]) {
      return;
    }

    if (!tokensDataObject[poolsDataObject[address].tokenX.toString()]) {
      tokensDataObject[poolsDataObject[address].tokenX.toString()] = {
        address: poolsDataObject[address].tokenX.toString(),
        price: 0,
        volume24: 0,
        tvl: 0,
      };
    }

    if (!tokensDataObject[poolsDataObject[address].tokenY.toString()]) {
      tokensDataObject[poolsDataObject[address].tokenY.toString()] = {
        address: poolsDataObject[address].tokenY.toString(),
        price: 0,
        volume24: 0,
        tvl: 0,
      };
    }

    if (!snapshots.length) {
      poolsData.push({
        volume24: 0,
        tvl: 0,
        tokenX: poolsDataObject[address].tokenX.toString(),
        tokenY: poolsDataObject[address].tokenY.toString(),
        fee: +printBN(poolsDataObject[address].fee.v, DECIMAL - 2),
        apy: poolsApy[address].apy ?? 0,
        poolAddress: new PublicKey(address).toString(),
      });
      return;
    }

    const tokenX = poolsDataObject[address].tokenX.toString();
    const tokenY = poolsDataObject[address].tokenY.toString();

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
      tokenX: poolsDataObject[address].tokenX.toString(),
      tokenY: poolsDataObject[address].tokenY.toString(),
      fee: +printBN(poolsDataObject[address].fee.v, DECIMAL - 2),
      apy: poolsApy[address]?.apy ?? 0,
      poolAddress: new PublicKey(address).toString(),
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

  const allTokens = getEclipseTokensData(network);
  const tokensPricesData = await getJupPricesData2(
    Object.values(allTokens).map((tokenData) => tokenData.solAddress ?? "")
  );

  Object.entries(tokensPricesData).forEach(([solAddress, priceData]) => {
    Object.entries(allTokens).forEach(([address, tokenData]) => {
      if (solAddress === tokenData.solAddress && tokensDataObject[address]) {
        tokensDataObject[address].price = priceData.price;
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

  volume24.change = ((volume24.value - prevVolume24) / prevVolume24) * 100;
  tvl24.change = ((tvl24.value - prevTvl24) / prevTvl24) * 100;
  fees24.change = ((fees24.value - prevFees24) / prevFees24) * 100;

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

createSnapshotForNetwork(Network.DEV).then(
  () => {
    console.log("Eclipse: Full devnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

createSnapshotForNetwork(Network.TEST).then(
  () => {
    console.log("Eclipse: Full testnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Eclipse: Full mainnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
