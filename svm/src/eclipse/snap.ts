import {
  Network,
  Market,
  Pair,
  getMarketAddress,
  DENOMINATOR,
} from "@invariant-labs/sdk-eclipse";
import { PoolStructure } from "@invariant-labs/sdk-eclipse/lib/market";
import { BN, Provider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_DATA from "../../../data/eclipse/devnet.json";
import TESTNET_DATA from "../../../data/eclipse/testnet.json";
import MAINNET_DATA from "../../../data/eclipse/mainnet.json";
import {
  eclipseDevnetTokensData,
  eclipseMainnetTokensData,
  eclipseTestnetTokensData,
  getLastSnapshot,
  getTokensPrices,
  getUsdValue24,
  PoolSnapshot,
  PoolStatsData,
  TokenData,
} from "../utils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider;
  let fileName: string;
  let snaps: Record<string, PoolStatsData>;
  let tokensData: Record<string, TokenData>;

  switch (network) {
    case Network.DEV:
      provider = Provider.local("https://staging-rpc.dev2.eclipsenetwork.xyz");
      fileName = "../data/eclipse/devnet.json";
      snaps = DEVNET_DATA;
      tokensData = eclipseDevnetTokensData;
      break;
    case Network.TEST:
      provider = Provider.local("https://testnet.dev2.eclipsenetwork.xyz");
      fileName = "../data/eclipse/testnet.json";
      snaps = TESTNET_DATA;
      tokensData = eclipseTestnetTokensData;
      break;
    case Network.MAIN:
      provider = Provider.local("https://eclipse.helius-rpc.com");
      fileName = "../data/eclipse/mainnet.json";
      snaps = MAINNET_DATA;
      tokensData = eclipseMainnetTokensData;
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

  const coingeckoPrices = await getTokensPrices(idsList);

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

  const now = Date.now();
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
    1000 * 60 * 60 * 12;

  for (let pool of allPools) {
    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee.v,
      tickSpacing: pool.tickSpacing,
    });

    const [address, /*volumes,*/ liq /*, fees*/] = await Promise.all([
      pair.getAddress(market.program.programId),
      market.getPairLiquidityValues(pair),
    ]);

    poolsDict[address.toString()] = pool;

    const tokenXData = tokensData?.[pool.tokenX.toString()] ?? {
      decimals: 0,
    };
    const tokenYData = tokensData?.[pool.tokenY.toString()] ?? {
      decimals: 0,
    };
    const tokenXPrice = tokenXData.coingeckoId
      ? coingeckoPrices[tokenXData.coingeckoId] ?? 0
      : 0;
    const tokenYPrice = tokenYData.coingeckoId
      ? coingeckoPrices[tokenYData.coingeckoId] ?? 0
      : 0;

    const lastSnapshot = getLastSnapshot(snaps, address.toString(), timestamp);

    let volumeX, volumeY, liquidityX, liquidityY, feeX, feeY;

    const lastFeeX =
      lastSnapshot !== null
        ? new BN(lastSnapshot.feeX.tokenBNFromBeginning)
        : new BN(0);
    const lastFeeY =
      lastSnapshot !== null
        ? new BN(lastSnapshot.feeY.tokenBNFromBeginning)
        : new BN(0);

    const lastVolumeX =
      lastSnapshot !== null
        ? new BN(lastSnapshot.volumeX.tokenBNFromBeginning)
        : new BN(0);
    const lastVolumeY =
      lastSnapshot !== null
        ? new BN(lastSnapshot.volumeY.tokenBNFromBeginning)
        : new BN(0);

    const { feeProtocolTokenX, feeProtocolTokenY, protocolFee } = pool;
    let feeProtocolTokenXDiff = feeProtocolTokenX.lt(lastFeeX)
      ? new BN(0)
      : feeProtocolTokenX.sub(lastFeeX);
    const feeXDiff = feeProtocolTokenXDiff.mul(DENOMINATOR).div(protocolFee.v);
    const volumeXDiff = feeProtocolTokenXDiff
      .mul(DENOMINATOR)
      .div(protocolFee.v.mul(pool.fee.v).div(DENOMINATOR));

    let feeProtocolTokenYDiff = feeProtocolTokenY.lt(lastFeeY)
      ? new BN(0)
      : feeProtocolTokenY.sub(lastFeeY);
    const feeYDiff = feeProtocolTokenYDiff.mul(DENOMINATOR).div(protocolFee.v);
    const volumeYDiff = feeProtocolTokenYDiff
      .mul(DENOMINATOR)
      .div(protocolFee.v.mul(pool.fee.v).div(DENOMINATOR));

    try {
      feeX = lastFeeX.add(feeXDiff);
      feeY = lastFeeY.add(feeYDiff);
    } catch {
      feeX = new BN(lastSnapshot?.feeX.tokenBNFromBeginning ?? "0");
      feeY = new BN(lastSnapshot?.feeY.tokenBNFromBeginning ?? "0");
    }

    try {
      volumeX = lastVolumeX.add(volumeXDiff);
      volumeY = lastVolumeY.add(volumeYDiff);
    } catch {
      volumeX = new BN(lastSnapshot?.volumeX.tokenBNFromBeginning ?? "0");
      volumeY = new BN(lastSnapshot?.volumeY.tokenBNFromBeginning ?? "0");
    }

    try {
      liquidityX = liq.liquidityX;
      liquidityY = liq.liquidityY;
    } catch {
      liquidityX = new BN("0");
      liquidityY = new BN("0");
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
        protocolFeeX: {
          tokenBNFromBeginning: feeProtocolTokenX.toString(),
          usdValue24: getUsdValue24(
            feeProtocolTokenX,
            tokenXData.decimals,
            tokenXPrice,
            new BN(0)
          ),
        },
        protocolFeeY: {
          tokenBNFromBeginning: feeProtocolTokenY.toString(),
          usdValue24: getUsdValue24(
            feeProtocolTokenY,
            tokenYData.decimals,
            tokenYPrice,
            new BN(0)
          ),
        },
      },
    });
  }

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
};

createSnapshotForNetwork(Network.DEV).then(
  () => {
    console.log("Eclipse: Devnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

createSnapshotForNetwork(Network.TEST).then(
  () => {
    console.log("Eclipse: Testnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Eclipse: Mainnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
