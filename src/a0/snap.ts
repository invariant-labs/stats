import {
  LIQUIDITY_DENOMINATOR,
  PERCENTAGE_DENOMINATOR,
  PERCENTAGE_SCALE,
  PRICE_DENOMINATOR,
} from "@invariant-labs/a0-sdk/target/consts";
import {
  Network,
  Invariant,
  Pool,
  initPolkadotApi,
  calculateSqrtPrice,
  INVARIANT_ADDRESS,
  LiquidityTick,
} from "@invariant-labs/a0-sdk";

import { PoolSnapshot, PoolStatsData } from "../utils";
import TESTNET_DATA from "../../data/a0/testnet.json";
import MAINNET_DATA from "../../data/a0/mainnet.json";
import * as fs from "fs";
import { assert, delay } from "@invariant-labs/a0-sdk/target/utils";
import { getCoingeckoPricesData, getTokensData, getUsdValue24 } from "./utils";

const getPairLiquidityValues = async (
  pool: Pool,
  liquidityTicks: LiquidityTick[]
) => {
  let liquidityX = BigInt(0);
  let liquidityY = BigInt(0);
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
        xVal = BigInt(0);
      }

      try {
        yVal = getY(
          liquidityDelta,
          upperSqrtPrice,
          pool.sqrtPrice,
          lowerSqrtPrice
        );
      } catch (error) {
        yVal = BigInt(0);
      }
      liquidityX = liquidityX + xVal;
      liquidityY = liquidityY + yVal;
    }
  }

  assert(visitedTicks.length === 0, "Ticks were not emptied");

  return { liquidityX, liquidityY };
};

const getX = (
  liquidity: bigint,
  upperSqrtPrice: bigint,
  currentSqrtPrice: bigint,
  lowerSqrtPrice: bigint
): bigint => {
  if (
    upperSqrtPrice <= BigInt(0) ||
    currentSqrtPrice <= BigInt(0) ||
    lowerSqrtPrice <= BigInt(0)
  ) {
    throw new Error("Price cannot be lower or equal 0");
  }

  let denominator: bigint;
  let nominator: bigint;

  if (currentSqrtPrice >= upperSqrtPrice) {
    return BigInt(0);
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
  if (
    lowerSqrtPrice <= BigInt(0) ||
    currentSqrtPrice <= BigInt(0) ||
    upperSqrtPrice <= BigInt(0)
  ) {
    throw new Error("Price cannot be 0");
  }

  let difference: bigint;
  if (currentSqrtPrice <= lowerSqrtPrice) {
    return BigInt(0);
  } else if (currentSqrtPrice >= upperSqrtPrice) {
    difference = upperSqrtPrice - lowerSqrtPrice;
  } else {
    difference = currentSqrtPrice - lowerSqrtPrice;
  }

  return (liquidity * difference) / PRICE_DENOMINATOR / LIQUIDITY_DENOMINATOR;
};

export const createSnapshotForNetwork = async (network: Network) => {
  let fileName: string;
  let snaps: Record<string, PoolStatsData>;
  let invariantAddress: string;
  let tokensData = getTokensData(network);
  switch (network) {
    default:
      throw new Error("Network not specified");

    case Network.Testnet:
      fileName = "./data/a0/testnet.json";
      snaps = TESTNET_DATA;
      invariantAddress = INVARIANT_ADDRESS.Testnet;
      break;

    case Network.Mainnet:
      fileName = "./data/a0/mainnet.json";
      snaps = MAINNET_DATA;
      invariantAddress = INVARIANT_ADDRESS.Mainnet;
  }

  const api = await initPolkadotApi(network);
  const coingeckoPrices = {};
  (
    await getCoingeckoPricesData(
      Object.values(tokensData).map((v) => v.coingeckoId)
    )
  ).map((val) => {
    val.current_price = val.current_price * Number(PRICE_DENOMINATOR);
    return (coingeckoPrices[val.id] = val.current_price);
  });

  console.log(coingeckoPrices);
  const invariant = await Invariant.load(api, network, invariantAddress);

  const allPoolKeys = await invariant.getAllPoolKeys();

  let poolsData: any[] = [];

  for (let poolKey of allPoolKeys) {
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

    console.log(
      tokenXData,
      tokenXPrice,
      coingeckoPrices[tokenXData.coingeckoId]
    );
    const pool = await invariant.getPool(
      poolKey.tokenX,
      poolKey.tokenY,
      poolKey.feeTier
    );
    const { feeProtocolTokenX, feeProtocolTokenY } = pool;

    const getVolume = async () => {
      const feeDenominator =
        (protocolFee * poolKey.feeTier.fee) / PERCENTAGE_SCALE;

      return {
        volumeX: (feeProtocolTokenX * PERCENTAGE_SCALE) / feeDenominator,
        volumeY: (feeProtocolTokenY * PERCENTAGE_SCALE) / feeDenominator,
      };
    };

    const getGlobalFee = () => {
      const feeX = (feeProtocolTokenX * PERCENTAGE_DENOMINATOR) / protocolFee;
      const feeY = (feeProtocolTokenY * PERCENTAGE_DENOMINATOR) / protocolFee;
      return {
        feeX,
        feeY,
      };
    };

    const tickmap = await invariant.getFullTickmap(poolKey);
    const liquidityTicks = await invariant.getAllLiquidityTicks(
      poolKey,
      tickmap
    );
    const stringifyPoolKey = (poolKey) => {
      poolKey.feeTier.fee = String(poolKey.feeTier.fee);
      poolKey.feeTier.tickSpacing = String(poolKey.feeTier.tickSpacing);
      return JSON.stringify(poolKey);
    };
    const stringifiedPoolKey = stringifyPoolKey(poolKey);

    if (snaps?.[stringifiedPoolKey]) {
      lastSnapshot =
        snaps[stringifiedPoolKey].snapshots[
          snaps[stringifiedPoolKey].snapshots.length - 1
        ];
    }
    let volumeX, volumeY, liquidityX, liquidityY, feeX, feeY;

    const protocolFee = await invariant.getProtocolFee();

    try {
      const volumes = await getVolume();
      volumeX = volumes.volumeX;
      volumeY = volumes.volumeY;
    } catch {
      volumeX = BigInt(lastSnapshot?.volumeX.tokenBNFromBeginning ?? "0");
      volumeY = BigInt(lastSnapshot?.volumeY.tokenBNFromBeginning ?? "0");
    }
    try {
      const liq: any = await getPairLiquidityValues(pool, liquidityTicks);
      liquidityX = liq.liquidityX;
      liquidityY = liq.liquidityY;
    } catch (e) {
      liquidityY = BigInt(lastSnapshot?.liquidityX.tokenBNFromBeginning ?? "0");
      liquidityX = BigInt(lastSnapshot?.liquidityY.tokenBNFromBeginning ?? "0");
    }

    try {
      const fees = await getGlobalFee();
      feeX = fees.feeX;
      feeY = fees.feeY;
    } catch {
      feeX = BigInt(lastSnapshot?.feeX.tokenBNFromBeginning ?? "0");
      feeY = BigInt(lastSnapshot?.feeY.tokenBNFromBeginning ?? "0");
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
              : BigInt(0)
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
              : BigInt(0)
          ),
        },
        liquidityX: {
          tokenBNFromBeginning: liquidityX.toString(),
          usdValue24: getUsdValue24(
            liquidityX,
            tokenXData.decimals,
            tokenXPrice,
            BigInt(0)
          ),
        },
        liquidityY: {
          tokenBNFromBeginning: liquidityY.toString(),
          usdValue24: getUsdValue24(
            liquidityY,
            tokenYData.decimals,
            tokenYPrice,
            BigInt(0)
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
              : BigInt(0)
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
              : BigInt(0)
          ),
        },
      },
    });
    await delay(500);
  }
  const now = Date.now();
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
    1000 * 60 * 60 * 12;

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

    snaps[poolKey].snapshots.push({
      timestamp,
      ...stats,
    });
  });

  fs.writeFileSync(fileName, JSON.stringify(snaps));
};

createSnapshotForNetwork(Network.Mainnet).then(
  () => {
    console.log("Mainnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

createSnapshotForNetwork(Network.Testnet).then(
  () => {
    console.log("Testnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
