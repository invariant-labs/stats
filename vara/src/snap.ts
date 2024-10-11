import {
  Network,
  Invariant,
  Pool,
  calculateSqrtPrice,
  TESTNET_INVARIANT_ADDRESS,
  LiquidityTick,
  PoolKey,
  initGearApi,
  HexString,
  LIQUIDITY_DENOMINATOR,
  PERCENTAGE_DENOMINATOR,
  PRICE_DENOMINATOR,
} from "@invariant-labs/vara-sdk";

import { PoolSnapshot, PoolStatsData, sleep } from "./utils";
import TESTNET_DATA from "../../data/vara/testnet.json";
import * as fs from "fs";
import { getCoingeckoPricesData, getTokensData, getUsdValue24 } from "./utils";

const getPairLiquidityValues = async (
  pool: Pool,
  liquidityTicks: LiquidityTick[]
) => {
  let liquidityX = 0n;
  let liquidityY = 0n;
  const visitedTicks: LiquidityTick[] = [];
  for (let i = 0; i < liquidityTicks.length; i++) {
    let curr = liquidityTicks[i];

    if (visitedTicks.length === 0 || curr.sign) {
      visitedTicks.push(curr);
      continue;
    }

    for (let j = visitedTicks.length - 1; j >= 0; j--) {
      let prev = visitedTicks[j];

      if (!prev.sign) {
        throw new Error("Prev tick must have positive liquidity");
      }

      let liquidityLower = prev.liquidityChange;
      let liquidityUpper = curr.liquidityChange;

      let xVal, yVal;
      let liquidityDelta;
      let lowerTickIndex = prev.index;
      let upperTickIndex = curr.index;

      if (liquidityUpper >= liquidityLower) {
        liquidityDelta = liquidityLower;

        curr.liquidityChange = liquidityUpper - liquidityLower;
        visitedTicks.pop();
      } else {
        liquidityDelta = liquidityUpper;
        prev.liquidityChange = liquidityLower - liquidityUpper;
        break;
      }

      const lowerSqrtPrice = calculateSqrtPrice(lowerTickIndex);
      const upperSqrtPrice = calculateSqrtPrice(upperTickIndex);

      try {
        xVal = getX(
          liquidityDelta,
          upperSqrtPrice,
          pool.sqrtPrice,
          lowerSqrtPrice
        );
      } catch (error) {
        xVal = 0n;
      }

      try {
        yVal = getY(
          liquidityDelta,
          upperSqrtPrice,
          pool.sqrtPrice,
          lowerSqrtPrice
        );
      } catch (error) {
        yVal = 0n;
      }
      liquidityX = liquidityX + xVal;
      liquidityY = liquidityY + yVal;
    }
  }

  if (visitedTicks.length !== 0) {
    return new Error("Ticks were not emptied");
  }

  return { liquidityX, liquidityY };
};

const getX = (
  liquidity: bigint,
  upperSqrtPrice: bigint,
  currentSqrtPrice: bigint,
  lowerSqrtPrice: bigint
): bigint => {
  if (upperSqrtPrice <= 0n || currentSqrtPrice <= 0n || lowerSqrtPrice <= 0n) {
    throw new Error("Price cannot be lower or equal 0");
  }

  let denominator: bigint;
  let nominator: bigint;

  if (currentSqrtPrice >= upperSqrtPrice) {
    return 0n;
  } else if (currentSqrtPrice < lowerSqrtPrice) {
    denominator = (lowerSqrtPrice * upperSqrtPrice) / PRICE_DENOMINATOR;
    nominator = upperSqrtPrice - lowerSqrtPrice;
  } else {
    denominator = (upperSqrtPrice * currentSqrtPrice) / PRICE_DENOMINATOR;
    nominator = upperSqrtPrice - currentSqrtPrice;
  }

  return (liquidity * nominator) / denominator / LIQUIDITY_DENOMINATOR;
};

export const getY = (
  liquidity: bigint,
  upperSqrtPrice: bigint,
  currentSqrtPrice: bigint,
  lowerSqrtPrice: bigint
): bigint => {
  if (lowerSqrtPrice <= 0n || currentSqrtPrice <= 0n || upperSqrtPrice <= 0n) {
    throw new Error("Price cannot be 0");
  }

  let difference: bigint;
  if (currentSqrtPrice <= lowerSqrtPrice) {
    return 0n;
  } else if (currentSqrtPrice >= upperSqrtPrice) {
    difference = upperSqrtPrice - lowerSqrtPrice;
  } else {
    difference = currentSqrtPrice - lowerSqrtPrice;
  }

  return (liquidity * difference) / PRICE_DENOMINATOR / LIQUIDITY_DENOMINATOR;
};

const stringifyPoolKey = (poolKey: any) => {
  poolKey.feeTier.fee = String(poolKey.feeTier.fee);
  poolKey.feeTier.tickSpacing = String(poolKey.feeTier.tickSpacing);
  return JSON.stringify(poolKey);
};

const getGlobalFee = (
  feeProtocolTokenX: bigint,
  feeProtocolTokenY: bigint,
  protocolFee: bigint
) => {
  const feeX = (feeProtocolTokenX * PERCENTAGE_DENOMINATOR) / protocolFee;
  const feeY = (feeProtocolTokenY * PERCENTAGE_DENOMINATOR) / protocolFee;
  return {
    feeX,
    feeY,
  };
};

const getVolume = (
  feeProtocolTokenX: bigint,
  feeProtocolTokenY: bigint,
  protocolFee: bigint,
  poolKey: PoolKey
) => {
  const feeDenominator =
    (protocolFee * BigInt(poolKey.feeTier.fee)) / PERCENTAGE_DENOMINATOR;

  return {
    volumeX: (feeProtocolTokenX * PERCENTAGE_DENOMINATOR) / feeDenominator,
    volumeY: (feeProtocolTokenY * PERCENTAGE_DENOMINATOR) / feeDenominator,
  };
};

export const createSnapshotForNetwork = async (network: Network) => {
  let fileName: string;
  let snaps: Record<string, PoolStatsData>;
  let invariantAddress: HexString;
  let tokensData = getTokensData(network);
  switch (network) {
    default:
      throw new Error("Network not specified");
    case Network.Testnet:
      fileName = "../data/vara/testnet.json";
      snaps = TESTNET_DATA;
      invariantAddress = TESTNET_INVARIANT_ADDRESS;
      break;
  }

  const api = await initGearApi(network);
  const coingeckoPrices: Record<string, number> = {};
  (
    await getCoingeckoPricesData(
      Object.values(tokensData).map((v) => v.coingeckoId)
    )
  ).map((val) => {
    val.current_price = val.current_price * Number(PRICE_DENOMINATOR);
    return (coingeckoPrices[val.id] = val.current_price);
  });

  const invariant = await Invariant.load(api, invariantAddress);

  const allPoolKeys = await invariant.getAllPoolKeys();

  let poolsData: any[] = [];
  const poolPromises = allPoolKeys.map((poolKey) => {
    return invariant.getPool(poolKey.tokenX, poolKey.tokenY, poolKey.feeTier);
  });
  const poolsBatchSize = 8;
  let pools: Pool[] = [];
  while (poolPromises.length != 0) {
    const poolsBatch = await Promise.all(
      poolPromises.splice(0, poolsBatchSize)
    );
    pools = pools.concat(poolsBatch);
  }

  const poolsWithKeys: [PoolKey, Pool][] = allPoolKeys.map((poolKey, i) => {
    return [poolKey, pools[i]];
  });

  const protocolFee = await invariant.getProtocolFee();

  const now = Date.now();
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
    1000 * 60 * 60 * 12;

  for (let [poolKey, pool] of poolsWithKeys) {
    let lastSnapshot: PoolSnapshot | undefined;

    const tokenXData = tokensData?.[poolKey.tokenX] ?? {
      decimals: 0,
    };
    const tokenYData = tokensData?.[poolKey.tokenY] ?? {
      decimals: 0,
    };
    const tokenXPrice = BigInt(
      tokenXData.coingeckoId ? coingeckoPrices[tokenXData.coingeckoId] ?? 0 : 0
    );
    const tokenYPrice = BigInt(
      tokenYData.coingeckoId ? coingeckoPrices[tokenYData.coingeckoId] ?? 0 : 0
    );

    const { feeProtocolTokenX, feeProtocolTokenY } = pool;

    const tickmap = await invariant.getTickmap(poolKey);
    const liquidityTicks = await invariant.getAllLiquidityTicks(
      poolKey,
      tickmap
    );

    const stringifiedPoolKey = stringifyPoolKey(poolKey);

    if (snaps?.[stringifiedPoolKey]) {
      if (
        snaps[stringifiedPoolKey].snapshots[
          snaps[stringifiedPoolKey].snapshots.length - 1
        ].timestamp === timestamp
      ) {
        if (snaps?.[stringifiedPoolKey].snapshots.length >= 2) {
          lastSnapshot =
            snaps[stringifiedPoolKey].snapshots[
              snaps[stringifiedPoolKey].snapshots.length - 2
            ];
        }
      } else {
        lastSnapshot =
          snaps[stringifiedPoolKey].snapshots[
            snaps[stringifiedPoolKey].snapshots.length - 1
          ];
      }
    }
    let volumeX, volumeY, liquidityX, liquidityY, feeX, feeY;

    try {
      const volumes = getVolume(
        feeProtocolTokenX,
        feeProtocolTokenY,
        protocolFee,
        poolKey
      );
      volumeX = volumes.volumeX;
      volumeY = volumes.volumeY;
    } catch {
      volumeX = BigInt(lastSnapshot?.volumeX.tokenBNFromBeginning ?? 0n);
      volumeY = BigInt(lastSnapshot?.volumeY.tokenBNFromBeginning ?? 0n);
    }
    try {
      const liq: any = await getPairLiquidityValues(pool, liquidityTicks);
      liquidityX = liq.liquidityX;
      liquidityY = liq.liquidityY;
    } catch (e) {
      liquidityX = BigInt(lastSnapshot?.liquidityX.tokenBNFromBeginning ?? 0n);
      liquidityY = BigInt(lastSnapshot?.liquidityY.tokenBNFromBeginning ?? 0n);
    }

    try {
      const fees = getGlobalFee(
        feeProtocolTokenX,
        feeProtocolTokenY,
        protocolFee
      );
      feeX = fees.feeX;
      feeY = fees.feeY;
    } catch {
      feeX = BigInt(lastSnapshot?.feeX.tokenBNFromBeginning ?? 0n);
      feeY = BigInt(lastSnapshot?.feeY.tokenBNFromBeginning ?? 0n);
    }

    poolsData.push({
      poolKey: stringifiedPoolKey,
      stats: {
        volumeX: {
          tokenBNFromBeginning: volumeX.toString(),
          usdValue24: getUsdValue24(
            volumeX,
            tokenXData.decimals,
            tokenXPrice,
            typeof lastSnapshot !== "undefined"
              ? BigInt(lastSnapshot.volumeX.tokenBNFromBeginning)
              : 0n
          ),
        },
        volumeY: {
          tokenBNFromBeginning: volumeY.toString(),
          usdValue24: getUsdValue24(
            volumeY,
            tokenYData.decimals,
            tokenYPrice,
            typeof lastSnapshot !== "undefined"
              ? BigInt(lastSnapshot.volumeY.tokenBNFromBeginning)
              : 0n
          ),
        },
        liquidityX: {
          tokenBNFromBeginning: liquidityX.toString(),
          usdValue24: getUsdValue24(
            liquidityX,
            tokenXData.decimals,
            tokenXPrice,
            0n
          ),
        },
        liquidityY: {
          tokenBNFromBeginning: liquidityY.toString(),
          usdValue24: getUsdValue24(
            liquidityY,
            tokenYData.decimals,
            tokenYPrice,
            0n
          ),
        },
        feeX: {
          tokenBNFromBeginning: feeX.toString(),
          usdValue24: getUsdValue24(
            feeX,
            tokenXData.decimals,
            tokenXPrice,
            typeof lastSnapshot !== "undefined"
              ? BigInt(lastSnapshot.feeX.tokenBNFromBeginning)
              : 0n
          ),
        },
        feeY: {
          tokenBNFromBeginning: feeY.toString(),
          usdValue24: getUsdValue24(
            feeY,
            tokenYData.decimals,
            tokenYPrice,
            typeof lastSnapshot !== "undefined"
              ? BigInt(lastSnapshot.feeY.tokenBNFromBeginning)
              : 0n
          ),
        },
      },
    });
    await sleep(500);
  }

  poolsData.forEach(({ poolKey, stats }) => {
    const parsedPoolKey = JSON.parse(poolKey);
    if (!snaps[poolKey]) {
      snaps[poolKey] = {
        snapshots: [],
        tokenX: {
          address: parsedPoolKey.tokenX,
          decimals: tokensData?.[parsedPoolKey.tokenX]?.decimals ?? 0,
        },
        tokenY: {
          address: parsedPoolKey.tokenY,
          decimals: tokensData?.[parsedPoolKey.tokenY]?.decimals ?? 0,
        },
      };
    }

    const snapIndex = snaps[poolKey].snapshots.findIndex(
      (snap) => snap.timestamp === timestamp
    );
    if (snapIndex === -1) {
      snaps[poolKey].snapshots.push({
        timestamp,
        ...stats,
      });
    } else {
      snaps[poolKey].snapshots[snapIndex] = {
        timestamp,
        ...stats,
      };
    }
  });

  fs.writeFileSync(fileName, JSON.stringify(snaps));
};
const main = async () => {
  // const mainnet = createSnapshotForNetwork(Network.Mainnet).then(
  //   () => {
  //     console.log("Mainnet snapshot done!");
  //   },
  //   (err) => {
  //     console.log(err);
  //   }
  // );

  const testnet = createSnapshotForNetwork(Network.Testnet).then(
    () => {
      console.log("Testnet snapshot done!");
    },
    (err) => {
      console.log(err);
    }
  );
  await Promise.allSettled([testnet /*, mainnet*/]);
  process.exit(0);
};

main();
