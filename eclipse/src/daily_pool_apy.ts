import {
  Network,
  Market,
  getMarketAddress,
  Pair,
  sleep,
  IWallet,
} from "@invariant-labs/sdk-eclipse";
import {
  arithmeticalAvg,
  dailyFactorPool,
  PRICE_DENOMINATOR,
} from "@invariant-labs/sdk-eclipse/lib/utils";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_ARCHIVE from "../../data/eclipse/daily_pool_apy_archive_devnet.json";
import TESTNET_ARCHIVE from "../../data/eclipse/daily_pool_apy_archive_testnet.json";
import MAINNET_ARCHIVE from "../../data/eclipse/daily_pool_apy_archive_mainnet.json";
import {
  DailyApyData,
  eclipseDevnetTokensData,
  eclipseMainnetTokensData,
  eclipseTestnetTokensData,
  getParsedTokenAccountsFromAddresses,
  PoolApyArchiveSnapshot,
  readPoolsFromCache,
  readReservesFromCache,
  TokenData,
} from "./utils";
import { PoolStructure } from "@invariant-labs/sdk-eclipse/lib/market";
import { AnchorProvider } from "@coral-xyz/anchor";
import BN from "bn.js";
import { config } from "dotenv";

config();
export const createSnapshotForNetwork = async (network: Network) => {
  let provider: AnchorProvider;
  let fileName: string;
  let archiveFileName: string;
  let apyArchive: Record<string, PoolApyArchiveSnapshot[]>;
  let tokensData: Record<string, TokenData>;
  let poolsCacheFileName: string;
  let reservesCacheFileName: string;

  const args = process.argv.slice(2);
  const useCache = Boolean(args[0]);

  switch (network) {
    case Network.DEV:
      provider = AnchorProvider.local(
        "https://staging-rpc.dev2.eclipsenetwork.xyz"
      );
      fileName = "../data/eclipse/daily_pool_apy_devnet.json";
      archiveFileName = "../data/eclipse/pool_apy_archive_devnet.json";
      apyArchive = DEVNET_ARCHIVE;
      tokensData = eclipseDevnetTokensData;
      poolsCacheFileName = "../data/eclipse/cache/devnet_pools_cache.json";
      reservesCacheFileName =
        "../data/eclipse/cache/devnet_reserves_cache.json";
      break;
    case Network.TEST:
      provider = AnchorProvider.local(
        "https://testnet.dev2.eclipsenetwork.xyz"
      );
      fileName = "../data/eclipse/daily_pool_apy_testnet.json";
      archiveFileName = "../data/eclipse/pool_apy_archive_testnet.json";
      apyArchive = TESTNET_ARCHIVE;
      poolsCacheFileName = "../data/eclipse/cache/testnet_pools_cache.json";
      reservesCacheFileName =
        "../data/eclipse/cache/testnet_reserves_cache.json";
      tokensData = eclipseTestnetTokensData;
      break;
    case Network.MAIN:
      const rpcUrl = process.env.ECLIPSE_RPC_URL;
      if (!rpcUrl) {
        throw new Error("RPC is not defined");
      }
      provider = AnchorProvider.local(rpcUrl);
      fileName = "../data/eclipse/daily_pool_apy_mainnet.json";
      archiveFileName = "../data/eclipse/daily_pool_apy_archive_mainnet.json";
      poolsCacheFileName = "../data/eclipse/cache/mainnet_pools_cache.json";
      reservesCacheFileName =
        "../data/eclipse/cache/mainnet_reserves_cache.json";
      apyArchive = MAINNET_ARCHIVE;
      tokensData = eclipseMainnetTokensData;
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

  const reserveAddresses = allPools
    .map((pool) => [pool.tokenXReserve, pool.tokenYReserve])
    .flat();

  const reserves = useCache
    ? readReservesFromCache(reservesCacheFileName)
    : await getParsedTokenAccountsFromAddresses(connection, reserveAddresses);

  const dailyData: Record<string, DailyApyData> = {};
  const apy: Record<string, number> = {};
  const poolsData: Record<string, PoolStructure> = {};

  for (let pool of allPools) {
    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
    });
    const address = pair.getAddress(market.program.programId);
    poolsData[address.toString()] = pool;

    const reserveX = reserves[pool.tokenXReserve.toString()];
    const reserveY = reserves[pool.tokenYReserve.toString()];

    const { volumeX: currentVolumeX, volumeY: currentVolumeY } =
      await market.getVolume(pair, pool);

    const associatedSnaps = apyArchive[address.toString()];
    let recentSnap: DailyApyData | null = null;

    if (associatedSnaps) {
      let mostRecent = associatedSnaps[0];

      for (const snapshot of associatedSnaps) {
        if (!snapshot.timestamp) continue;

        if (snapshot.timestamp > mostRecent.timestamp) {
          mostRecent = snapshot;
        }
      }

      recentSnap = mostRecent;
    }

    const prevSnap = recentSnap ?? {
      volumeX: 0,
      volumeY: 0,
      totalXAmount: new BN(0),
      totalVolumeX: 0,
      apy: 0,
    };

    const {
      volumeX: prevVolumeX,
      volumeY: prevVolumeY,
      totalXAmount: prevTotalXAmount,
    } = prevSnap;

    try {
      const currentSqrtPrice = pool.sqrtPrice;
      const price = currentSqrtPrice
        .mul(currentSqrtPrice)
        .div(PRICE_DENOMINATOR);

      const prevVolumeYBN = new BN(prevVolumeY);
      const prevVolumeXBN = new BN(prevVolumeX);
      const currentVolumeXBN = new BN(currentVolumeX);
      const currentVolumeYBN = new BN(currentVolumeY);

      const volumeY = currentVolumeYBN.gt(prevVolumeYBN)
        ? currentVolumeYBN.sub(prevVolumeYBN)
        : currentVolumeYBN;

      const denominatedVolumeY = new BN(volumeY)
        .mul(PRICE_DENOMINATOR)
        .div(price);

      const volumeX = currentVolumeXBN.gt(prevVolumeXBN)
        ? currentVolumeXBN.sub(prevVolumeXBN)
        : currentVolumeXBN;

      const volume = Math.abs(volumeX.add(denominatedVolumeY).toNumber());

      // @ts-expect-error
      const lpX = reserveX?.data.parsed.info.tokenAmount.amount;
      // @ts-expect-error
      const lpY = reserveY?.data.parsed.info.tokenAmount.amount;

      const denominatedLpY = new BN(lpY).mul(PRICE_DENOMINATOR).div(price);

      const currentXamount = new BN(lpX).add(denominatedLpY);
      const previousXAmount = prevTotalXAmount
        ? new BN(prevTotalXAmount, 16)
        : new BN(0);
      const avgTvl = previousXAmount.eqn(0)
        ? currentXamount
        : arithmeticalAvg(currentXamount, previousXAmount);

      const feeTier = { fee: pool.fee, tickSpacing: pool.tickSpacing };
      const dailyFactor = dailyFactorPool(avgTvl, volume, feeTier);

      const APY = (Math.pow(dailyFactor + 1, 365) - 1) * 100;

      dailyData[address.toString()] = {
        apy: APY === Infinity ? 1001 : isNaN(+JSON.stringify(APY)) ? 0 : APY,
        totalXAmount: currentXamount,
        volumeX: volumeX.toNumber(),
        volumeY: volumeY.toNumber(),
        totalVolumeX: volume,
      };
    } catch (_error) {
      dailyData[address.toString()] = {
        apy: 0,
        volumeX: 0,
        volumeY: 0,
        totalVolumeX: 0,
        totalXAmount: new BN(0),
      };
    }

    await sleep(100);
  }

  const now = Date.now();
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
    1000 * 60 * 60 * 12;

  Object.entries(dailyData).forEach(([address, data]) => {
    if (!apyArchive[address]) {
      apyArchive[address] = [];
    }
    apyArchive[address].push({
      timestamp,
      ...data,
      tokenX: {
        address: poolsData[address].tokenX.toString(),
        ticker:
          tokensData?.[poolsData[address].tokenX.toString()]?.ticker ?? "",
        decimals:
          tokensData?.[poolsData[address].tokenX.toString()]?.decimals ?? 0,
      },
      tokenY: {
        address: poolsData[address].tokenY.toString(),
        ticker:
          tokensData?.[poolsData[address].tokenY.toString()]?.ticker ?? "",
        decimals:
          tokensData?.[poolsData[address].tokenY.toString()]?.decimals ?? 0,
      },
    });
    apy[address] = data.apy;
  });

  fs.writeFile(fileName, JSON.stringify(apy), (err) => {
    if (err) {
      throw err;
    }
  });

  fs.writeFile(archiveFileName, JSON.stringify(apyArchive), (err) => {
    if (err) {
      throw err;
    }
  });
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
    console.log("Eclipse: Mainnet pool apy snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
