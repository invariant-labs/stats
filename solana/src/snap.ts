import {
  Network,
  Market,
  Pair,
  getMarketAddress,
  sleep,
  DENOMINATOR,
} from "@invariant-labs/sdk";
import { PoolStructure } from "@invariant-labs/sdk/lib/market";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_DATA from "../../data/devnet.json";
import MAINNET_DATA from "../../data/mainnet.json";
import {
  devnetTokensData,
  getJupPricesData,
  getParsedTokenAccountsFromAddresses,
  getTokensData,
  getTokensPrices,
  getUsdValue24,
  PoolSnapshot,
  PoolStatsData,
  savePoolsToCache,
  TokenData,
  tokensPriceViaCoingecko,
} from "./utils";
import BN from "bn.js";
import { Provider } from "@project-serum/anchor";
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider;
  let fileName: string;
  let snaps: Record<string, PoolStatsData>;
  let tokensData: Record<string, TokenData>;
  let poolsCacheFileName: string;
  let reservesCacheFileName: string;
  const args = process.argv.slice(2);
  const useCache = Boolean(args[0]);

  switch (network) {
    case Network.MAIN:
      const rpcUrl = process.env.SOLANA_RPC_URL;
      if (!rpcUrl) {
        throw new Error("RPC is not defined");
      }
      provider = Provider.local(rpcUrl);
      fileName = "../data/mainnet.json";
      snaps = MAINNET_DATA as Record<string, PoolStatsData>;
      tokensData = await getTokensData();
      poolsCacheFileName = "../data/cache/mainnet_pools_cache.json";
      reservesCacheFileName = "../data/cache/mainnet_reserves_cache.json";
      break;
    case Network.DEV:
    default:
      provider = Provider.local("https://api.devnet.solana.com");
      fileName = "../data/devnet.json";
      snaps = DEVNET_DATA as Record<string, PoolStatsData>;
      tokensData = devnetTokensData;
      poolsCacheFileName = "../data/cache/devnet_pools_cache.json";
      reservesCacheFileName = "../data/cache/devnet_reserves_cache.json";
  }

  const jupPrices = await getJupPricesData(Object.keys(tokensData));

  const coingeckoIds = tokensPriceViaCoingecko.map(
    (token) => token.coingeckoId
  );
  const coingeckoAddresses = tokensPriceViaCoingecko.map(
    (token) => token.address
  );
  const coingeckoPrices = await getTokensPrices(
    coingeckoIds,
    coingeckoAddresses
  );

  Object.entries(coingeckoPrices).forEach(([address, price]) => {
    jupPrices[address] = price.toString();
  });

  const connection = provider.connection;

  const market = await Market.build(
    network,
    provider.wallet,
    connection,
    new PublicKey(getMarketAddress(network))
  );

  const allPools = await market.getAllPools();

  const poolsDict: Record<string, PoolStructure> = {};

  let poolsData: any[] = [];

  const reserveAddresses = allPools
    .map((pool) => [pool.tokenXReserve, pool.tokenYReserve])
    .flat();

  const reserves = await getParsedTokenAccountsFromAddresses(
    connection,
    reserveAddresses
  );

  for (let pool of allPools) {
    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee.v,
      tickSpacing: pool.tickSpacing,
    });
    const address = await pair.getAddress(market.program.programId);

    const dataX = reserves[pool.tokenXReserve.toString()];
    const dataY = reserves[pool.tokenYReserve.toString()];

    poolsDict[address.toString()] = pool;

    let lastSnapshot: PoolSnapshot | undefined;
    const tokenXData = tokensData?.[pool.tokenX.toString()] ?? {
      decimals: 0,
    };
    const tokenYData = tokensData?.[pool.tokenY.toString()] ?? {
      decimals: 0,
    };
    const tokenXPrice = jupPrices[pool.tokenX.toString()] || "0";
    const tokenYPrice = jupPrices[pool.tokenY.toString()] || "0";

    if (snaps?.[address.toString()]) {
      lastSnapshot =
        snaps[address.toString()].snapshots[
          snaps[address.toString()].snapshots.length - 1
        ];
    }

    let volumeX, volumeY, liquidityX, liquidityY, feeX, feeY;

    const { feeProtocolTokenX, feeProtocolTokenY, protocolFee } = pool;
    const lastProtocolFeeX =
      typeof lastSnapshot !== "undefined"
        ? lastSnapshot.protocolFeeX
          ? new BN(lastSnapshot.protocolFeeX)
          : feeProtocolTokenX
        : feeProtocolTokenX;
    const lastProtocolFeeY =
      typeof lastSnapshot !== "undefined"
        ? lastSnapshot.protocolFeeY
          ? new BN(lastSnapshot.protocolFeeY)
          : feeProtocolTokenY
        : feeProtocolTokenY;

    const lastFeeX =
      typeof lastSnapshot !== "undefined"
        ? new BN(lastSnapshot.feeX.tokenBNFromBeginning)
        : new BN(0);
    const lastFeeY =
      typeof lastSnapshot !== "undefined"
        ? new BN(lastSnapshot.feeY.tokenBNFromBeginning)
        : new BN(0);

    const lastVolumeX =
      typeof lastSnapshot !== "undefined"
        ? new BN(lastSnapshot.volumeX.tokenBNFromBeginning)
        : new BN(0);
    const lastVolumeY = lastSnapshot
      ? new BN(lastSnapshot.volumeY.tokenBNFromBeginning)
      : new BN(0);

    let feeProtocolTokenXDiff = feeProtocolTokenX.lt(lastProtocolFeeX)
      ? feeProtocolTokenX
      : feeProtocolTokenX.sub(lastProtocolFeeX);
    const feeXDiff = feeProtocolTokenXDiff.mul(DENOMINATOR).div(protocolFee.v);
    const volumeXDiff = feeProtocolTokenXDiff
      .mul(DENOMINATOR)
      .div(protocolFee.v.mul(pool.fee.v).div(DENOMINATOR));

    let feeProtocolTokenYDiff = feeProtocolTokenY.lt(lastProtocolFeeY)
      ? feeProtocolTokenY
      : feeProtocolTokenY.sub(lastProtocolFeeY);
    const feeYDiff = feeProtocolTokenYDiff.mul(DENOMINATOR).div(protocolFee.v);
    const volumeYDiff = feeProtocolTokenYDiff
      .mul(DENOMINATOR)
      .div(protocolFee.v.mul(pool.fee.v).div(DENOMINATOR));

    try {
      volumeX = lastVolumeX.add(volumeXDiff);
      volumeY = lastVolumeY.add(volumeYDiff);
    } catch {
      volumeX = new BN(lastSnapshot?.volumeX.tokenBNFromBeginning ?? "0");
      volumeY = new BN(lastSnapshot?.volumeY.tokenBNFromBeginning ?? "0");
    }

    try {
      liquidityX = new BN(dataX);
      liquidityY = new BN(dataY);
    } catch {
      liquidityX = new BN("0");
      liquidityY = new BN("0");
    }

    try {
      feeX = lastFeeX.add(feeXDiff);
      feeY = lastFeeY.add(feeYDiff);
    } catch {
      feeX = new BN(lastSnapshot?.feeX.tokenBNFromBeginning ?? "0");
      feeY = new BN(lastSnapshot?.feeY.tokenBNFromBeginning ?? "0");
    }

    poolsData.push({
      address: address.toString(),
      stats: {
        volumeX: {
          tokenBNFromBeginning: volumeX.toString(),
          usdValue24: getUsdValue24(
            volumeX,
            tokenXData.decimals,
            tokenXPrice,
            lastVolumeX
          ),
        },
        volumeY: {
          tokenBNFromBeginning: volumeY.toString(),
          usdValue24: getUsdValue24(
            volumeY,
            tokenYData.decimals,
            tokenYPrice,
            lastVolumeY
          ),
        },
        liquidityX: {
          tokenBNFromBeginning: liquidityX.toString(),
          usdValue24: getUsdValue24(
            liquidityX,
            tokenXData.decimals,
            tokenXPrice,
            new BN(0)
          ),
        },
        liquidityY: {
          tokenBNFromBeginning: liquidityY.toString(),
          usdValue24: getUsdValue24(
            liquidityY,
            tokenYData.decimals,
            tokenYPrice,
            new BN(0)
          ),
        },
        feeX: {
          tokenBNFromBeginning: feeX.toString(),
          usdValue24: getUsdValue24(
            feeX,
            tokenXData.decimals,
            tokenXPrice,
            lastFeeX
          ),
        },
        feeY: {
          tokenBNFromBeginning: feeY.toString(),
          usdValue24: getUsdValue24(
            feeY,
            tokenYData.decimals,
            tokenYPrice,
            lastFeeY
          ),
        },
        protocolFeeX: pool.feeProtocolTokenX.toString(),
        protocolFeeY: pool.feeProtocolTokenY.toString(),
      },
    });
    await sleep(100);
  }
  const now = Date.now();
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
    1000 * 60 * 60 * 12;

  poolsData.forEach(({ address, stats }) => {
    const xAddress = poolsDict[address].tokenX.toString();
    const yAddress = poolsDict[address].tokenY.toString();

    if (!snaps[address]) {
      snaps[address] = {
        snapshots: [],
        tokenX: {
          address: xAddress,
          decimals: tokensData?.[xAddress]?.decimals ?? 0,
        },
        tokenY: {
          address: yAddress,
          decimals: tokensData?.[yAddress]?.decimals ?? 0,
        },
      };
    }

    snaps[address].snapshots.push({
      timestamp,
      ...stats,
    });
  });

  fs.writeFile(fileName, JSON.stringify(snaps), (err) => {
    if (err) {
      throw err;
    }
  });

  if (useCache) {
    savePoolsToCache(allPools, poolsCacheFileName);
    fs.writeFile(reservesCacheFileName, JSON.stringify(reserves), (err) => {
      if (err) {
        throw err;
      }
    });
  }
  if (network === Network.MAIN) {
    fs.writeFile(
      "../data/timestamp.json",
      JSON.stringify({ v: timestamp }),
      (err) => {
        if (err) {
          throw err;
        }
      }
    );
  }
};

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Mainnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
