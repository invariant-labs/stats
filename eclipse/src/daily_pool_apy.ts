import {
  Network,
  Market,
  getMarketAddress,
  Pair,
  sleep,
  IWallet,
  calculatePriceSqrt,
} from "@invariant-labs/sdk-eclipse";
import {
  arithmeticalAvg,
  calculateTokensRange,
  dailyFactorPool,
  PRICE_DENOMINATOR,
} from "@invariant-labs/sdk-eclipse/lib/utils";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
// import DEVNET_APY from "../../data/eclipse/pool_apy_devnet.json";
// import DEVNET_ARCHIVE from "../../data/eclipse/pool_apy_archive_devnet.json";
// import TESTNET_APY from "../../data/eclipse/pool_apy_testnet.json";
// import TESTNET_ARCHIVE from "../../data/eclipse/pool_apy_archive_testnet.json";
// import MAINNET_APY from "../../data/eclipse/pool_apy_mainnet.json";
// import MAINNET_ARCHIVE from "../../data/eclipse/pool_apy_archive_mainnet.json";
import MAINNET_APY from "../../data/eclipse/daily_pool_apy_mainnet.json";
import MAINNET_ARCHIVE from "../../data/eclipse/daily_pool_apy_archive_mainnet.json";
import {
  DailyApyData,
  eclipseDevnetTokensData,
  eclipseMainnetTokensData,
  eclipseTestnetTokensData,
  jsonArrayToTicks,
  PoolApyArchiveSnapshot,
  TokenData,
} from "./utils";
import { PoolStructure } from "@invariant-labs/sdk-eclipse/lib/market";
import { AnchorProvider } from "@coral-xyz/anchor";
import BN from "bn.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: AnchorProvider;
  let fileName: string;
  let archiveFileName: string;
  let ticksFolder: string;
  // let apySnaps: Record<string, number>;
  let apyArchive: Record<string, PoolApyArchiveSnapshot[]>;
  let tokensData: Record<string, TokenData>;

  switch (network) {
    case Network.DEV:
      provider = AnchorProvider.local(
        "https://staging-rpc.dev2.eclipsenetwork.xyz"
      );
      fileName = "../data/eclipse/pool_apy_devnet.json";
      archiveFileName = "../data/eclipse/pool_apy_archive_devnet.json";
      ticksFolder = "../data/eclipse/ticks/devnet/";
      // apySnaps = DEVNET_APY;
      // apyArchive = DEVNET_ARCHIVE;
      tokensData = eclipseDevnetTokensData;
      break;
    case Network.TEST:
      provider = AnchorProvider.local(
        "https://testnet.dev2.eclipsenetwork.xyz"
      );
      fileName = "../data/eclipse/pool_apy_testnet.json";
      archiveFileName = "../data/eclipse/pool_apy_archive_testnet.json";
      ticksFolder = "../data/eclipse/ticks/testnet/";
      // apySnaps = TESTNET_APY;
      // apyArchive = TESTNET_ARCHIVE;
      tokensData = eclipseTestnetTokensData;
      break;
    case Network.MAIN:
      provider = AnchorProvider.local("https://eclipse.helius-rpc.com");
      fileName = "../data/eclipse/daily_pool_apy_mainnet.json";
      archiveFileName = "../data/eclipse/daily_pool_apy_archive_mainnet.json";
      ticksFolder = "../data/eclipse/ticks/mainnet/";
      // apySnaps = MAINNET_APY;
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

  const allPools = await market.getAllPools();

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

    const { value: accounts } = await connection.getMultipleParsedAccounts([
      pool.tokenXReserve,
      pool.tokenYReserve,
    ]);

    const [reserveX, reserveY] = accounts;

    await fs.promises
      .readFile(ticksFolder + address.toString() + ".json", "utf-8")
      .then((data) => {
        const snaps = jsonArrayToTicks(address.toString(), JSON.parse(data));

        if (
          snaps.length > 1 &&
          (snaps[snaps.length - 1].timestamp - snaps[0].timestamp) /
            (1000 * 60 * 60) <
            24
        ) {
          dailyData[address.toString()] = {
            apy: 0,
            tokenXAmount: new BN(0),
            volumeX: 0,
            range: { tickLower: null, tickUpper: null },
          };
        } else {
          const len = snaps.length;
          const currentSnap =
            len > 0
              ? snaps[len - 1]
              : {
                  volumeX: "0",
                  volumeY: "0",
                  ticks: [],
                };

          let prevSnap;

          if (len > 0) {
            let index = 0;
            for (let i = 0; i < len; i++) {
              if (
                (snaps[snaps.length - 1].timestamp - snaps[i].timestamp) /
                  (1000 * 60 * 60) >=
                24
              ) {
                index = i;
              } else {
                break;
              }
            }
            prevSnap = snaps[index];
          } else {
            prevSnap = {
              volumeX: "0",
              volumeY: "0",
              ticks: [],
            };
          }

          let prevTokenXAmount = new BN(0);
          const archiveSnaps = apyArchive[address.toString()];

          if (archiveSnaps) {
            let mostRecent = archiveSnaps[0];

            for (const snapshot of archiveSnaps) {
              if (!snapshot.timestamp) continue;

              if (snapshot.timestamp > mostRecent.timestamp) {
                mostRecent = snapshot;
              }
            }

            prevTokenXAmount = mostRecent.tokenXAmount;
          }

          try {
            const { tickLower, tickUpper } = calculateTokensRange(
              prevSnap.ticks,
              currentSnap.ticks,
              pool.currentTickIndex
            );

            const volumeY = new BN(currentSnap.volumeY).sub(
              new BN(prevSnap.volumeY)
            );
            const previousSqrtPrice = calculatePriceSqrt(tickLower);
            const currentSqrtPrice = calculatePriceSqrt(tickUpper);
            const price = previousSqrtPrice
              .mul(currentSqrtPrice)
              .div(PRICE_DENOMINATOR);

            const denominatedVolumeY = new BN(volumeY)
              .mul(PRICE_DENOMINATOR)
              .div(price);

            const volume = Math.abs(
              new BN(currentSnap.volumeX)
                .sub(new BN(prevSnap.volumeX))
                .add(denominatedVolumeY)
                .toNumber()
            );

            // @ts-expect-error
            const lpX = reserveX?.data.parsed.info.tokenAmount.amount;
            // @ts-expect-error
            const lpY = reserveY?.data.parsed.info.tokenAmount.amount;

            const denominatedLpY = new BN(lpY)
              .mul(PRICE_DENOMINATOR)
              .div(price);

            const currentXamount = new BN(lpX).add(denominatedLpY);
            const previousXAmount = prevSnap.totalXamount ?? new BN(0);
            const avgTvl = previousXAmount.eqn(0)
              ? currentXamount
              : arithmeticalAvg(currentXamount, previousXAmount);

            // -1710_68676455187
            const feeTier = { fee: pool.fee, tickSpacing: pool.tickSpacing };
            const dailyFactor = dailyFactorPool(avgTvl, volume, feeTier);

            const APY = (Math.pow(dailyFactor + 1, 365) - 1) * 100;

            dailyData[address.toString()] = {
              apy: isNaN(+JSON.stringify(APY)) ? 0 : APY,
              tokenXAmount: currentXamount,
              volumeX: volume,
              range: { tickLower, tickUpper },
            };
          } catch (_error) {
            dailyData[address.toString()] = {
              apy: 0,
              tokenXAmount: new BN(0),
              range: { tickLower: null, tickUpper: null },
              volumeX: 0,
            };
          }
        }
      })
      .catch(() => {
        dailyData[address.toString()] = {
          apy: 0,
          tokenXAmount: new BN(0),
          volumeX: 0,
          range: { tickLower: null, tickUpper: null },
        };
      });

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
