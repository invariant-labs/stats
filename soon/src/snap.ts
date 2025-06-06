import {
  Network,
  Market,
  Pair,
  getMarketAddress,
  IWallet,
  DENOMINATOR,
} from "@invariant-labs/sdk-soon";
import { PoolStructure } from "@invariant-labs/sdk-soon/lib/market";
import { AnchorProvider } from "@coral-xyz/anchor";
import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import TESTNET_DATA from "../../data/soon/testnet.json";
import MAINNET_DATA from "../../data/soon/mainnet.json";
import {
  soonMainnetTokensData,
  soonTestnetTokensData,
  getTokensPrices,
  getUsdValue24,
  PoolLock,
  PoolSnapshot,
  PoolStatsData,
  supportedTokens,
  TokenData,
  getParsedTokenAccountsFromAddresses,
} from "./utils";
import { Locker } from "@invariant-labs/locker-soon-sdk";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: AnchorProvider;
  let fileName: string;
  let snaps: Record<string, PoolStatsData>;
  let tokensData: Record<string, TokenData>;
  let poolsCacheFileName: string;
  let reservesCacheFileName: string;

  const args = process.argv.slice(2);
  const useCache = Boolean(args[0]);

  switch (network) {
    case Network.TEST:
      provider = AnchorProvider.local("https://rpc.testnet.soo.network/rpc");
      fileName = "../data/soon/testnet.json";
      poolsCacheFileName = "../data/soon/cache/testnet_pools_cache.json";
      reservesCacheFileName = "../data/soon/cache/testnet_reserves_cache.json";
      snaps = TESTNET_DATA as Record<string, PoolStatsData>;
      tokensData = soonTestnetTokensData;
      break;
    case Network.MAIN:
      provider = AnchorProvider.local("https://rpc.mainnet.soo.network/rpc");
      fileName = "../data/soon/mainnet.json";
      poolsCacheFileName = "../data/soon/cache/mainnet_pools_cache.json";
      reservesCacheFileName = "../data/soon/cache/mainnet_reserves_cache.json";
      snaps = MAINNET_DATA as Record<string, PoolStatsData>;
      tokensData = soonMainnetTokensData;
      break;
    default:
      throw new Error("Unknown network");
  }

  const idsList: string[] = [];

  Object.values(tokensData).forEach((token) => {
    if (typeof token?.coingeckoId !== "undefined") {
      idsList.push(token.coingeckoId);
    }
  });

  const tokenPrices = Object.entries(await getTokensPrices(network)).reduce(
    (acc, [key, { price }]) => {
      acc[key] = price;
      return acc;
    },
    {} as Record<string, number>
  );

  const connection = provider.connection;

  const market = Market.build(
    network,
    provider.wallet as IWallet,
    connection,
    new PublicKey(getMarketAddress(network))
  );

  const allPools = await market.getAllPools();
  const poolsDict: Record<string, PoolStructure> = {};
  const poolLocks: Record<string, PoolLock> = {};

  try {
    const locker = Locker.build(
      network,
      provider.wallet as IWallet,
      connection
    );

    const allLocks = await locker.getAllLockedPositions(market);

    allLocks.forEach((lock) => {
      const pool = lock.pool.toString();
      if (!poolLocks[pool]) {
        poolLocks[pool] = {
          lockedX: lock.amountTokenX,
          lockedY: lock.amountTokenY,
        };
      } else {
        const newX = poolLocks[pool].lockedX.add(lock.amountTokenX);
        const newY = poolLocks[pool].lockedY.add(lock.amountTokenY);

        poolLocks[pool] = {
          lockedX: newX,
          lockedY: newY,
        };
      }
    });
  } catch (e) {
    console.log("Error getting locks for network", network, e);
  }

  let poolsData: any[] = [];

  const supportedTokensWithPrices = {};

  if (network === Network.MAIN) {
    for (const supportedToken of Object.keys(supportedTokens)) {
      const result = await market.getCurrentTokenStats(
        supportedToken,
        "So11111111111111111111111111111111111111112",
        tokenPrices["So11111111111111111111111111111111111111112"]
      );

      if (!("error" in result)) {
        supportedTokensWithPrices[supportedToken] = +result.priceUsd;
      }

      tokensData[supportedToken] = supportedTokens[supportedToken];
    }
  }

  const reserveAddresses = allPools
    .map((pool) => [pool.tokenXReserve, pool.tokenYReserve])
    .flat();

  const reserves = await getParsedTokenAccountsFromAddresses(
    connection,
    reserveAddresses
  );

  for (let pool of allPools) {
    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
    });

    const address = pair.getAddress(market.program.programId);
    const dataX = reserves[pool.tokenXReserve.toString()];
    const dataY = reserves[pool.tokenYReserve.toString()];

    poolsDict[address.toString()] = pool;

    let lastSnapshot: PoolSnapshot | undefined;
    let tokenXData = tokensData?.[pool.tokenX.toString()] ?? {
      decimals: 0,
    };
    let tokenYData = tokensData?.[pool.tokenY.toString()] ?? {
      decimals: 0,
    };
    let tokenXPrice = tokenPrices[pool.tokenX.toString()] ?? 0;
    let tokenYPrice = tokenPrices[pool.tokenY.toString()] ?? 0;

    if (Object.keys(supportedTokens).includes(pool.tokenX.toString())) {
      tokenXPrice = supportedTokensWithPrices[pool.tokenX.toString()];
    }

    if (Object.keys(supportedTokens).includes(pool.tokenY.toString())) {
      tokenYPrice = supportedTokensWithPrices[pool.tokenY.toString()];
    }

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
    const feeXDiff = feeProtocolTokenXDiff.mul(DENOMINATOR).div(protocolFee);
    const volumeXDiff = feeProtocolTokenXDiff
      .mul(DENOMINATOR)
      .div(protocolFee.mul(pool.fee).div(DENOMINATOR));

    let feeProtocolTokenYDiff = feeProtocolTokenY.lt(lastProtocolFeeY)
      ? feeProtocolTokenY
      : feeProtocolTokenY.sub(lastProtocolFeeY);
    const feeYDiff = feeProtocolTokenYDiff.mul(DENOMINATOR).div(protocolFee);
    const volumeYDiff = feeProtocolTokenYDiff
      .mul(DENOMINATOR)
      .div(protocolFee.mul(pool.fee).div(DENOMINATOR));

    try {
      volumeX = lastVolumeX.add(volumeXDiff);
      volumeY = lastVolumeY.add(volumeYDiff);
    } catch {
      volumeX = new BN(lastSnapshot?.volumeX.tokenBNFromBeginning ?? "0");
      volumeY = new BN(lastSnapshot?.volumeY.tokenBNFromBeginning ?? "0");
    }

    try {
      // @ts-expect-error
      liquidityX = new BN(dataX.data.parsed.info.tokenAmount.amount);
      // @ts-expect-error
      liquidityY = new BN(dataY.data.parsed.info.tokenAmount.amount);
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

    const lockedX = poolLocks[address.toString()]
      ? poolLocks[address.toString()].lockedX
      : new BN(0);

    const lockedY = poolLocks[address.toString()]
      ? poolLocks[address.toString()].lockedY
      : new BN(0);

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
        lockedX: {
          tokenBNFromBeginning: lockedX.toString(),
          usdValue24: getUsdValue24(
            lockedX,
            tokenXData.decimals,
            tokenXPrice,
            new BN(0)
          ),
        },
        lockedY: {
          tokenBNFromBeginning: lockedY.toString(),
          usdValue24: getUsdValue24(
            lockedY,
            tokenYData.decimals,
            tokenYPrice,
            new BN(0)
          ),
        },
        protocolFeeX: pool.feeProtocolTokenX.toString(),
        protocolFeeY: pool.feeProtocolTokenY.toString(),
      },
    });
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

    snaps[address].tokenX = {
      address: xAddress,
      decimals: tokensData?.[xAddress]?.decimals ?? 0,
    };
    snaps[address].tokenY = {
      address: yAddress,
      decimals: tokensData?.[yAddress]?.decimals ?? 0,
    };

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
    fs.writeFile(poolsCacheFileName, JSON.stringify(allPools), (err) => {
      if (err) {
        throw err;
      }
    });
    fs.writeFile(reservesCacheFileName, JSON.stringify(reserves), (err) => {
      if (err) {
        throw err;
      }
    });
  }
};

createSnapshotForNetwork(Network.TEST).then(
  () => {
    console.log("Soon: Testnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

// createSnapshotForNetwork(Network.MAIN).then(
//   () => {
//     console.log("Soon: Mainnet snapshot done!");
//   },
//   (err) => {
//     console.log(err);
//   }
// );
