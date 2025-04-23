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
  calculatePoolLiquidityFromSnapshot,
  calculateTokensAndLiquidity,
  calculateTokensRange,
  dailyFactorPool,
  DENOMINATOR,
  getMaxTick,
  getMinTick,
  getTokensAndLiquidity,
  getTokensInRange,
  getVolume,
  ParsedTick,
  parseLiquidityOnTicks,
  poolAPY,
  PRICE_DENOMINATOR,
  WeeklyData,
} from "@invariant-labs/sdk-eclipse/lib/utils";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
// import DEVNET_APY from "../../data/eclipse/pool_apy_devnet.json";
// import DEVNET_ARCHIVE from "../../data/eclipse/pool_apy_archive_devnet.json";
// import TESTNET_APY from "../../data/eclipse/pool_apy_testnet.json";
// import TESTNET_ARCHIVE from "../../data/eclipse/pool_apy_archive_testnet.json";
// import MAINNET_APY from "../../data/eclipse/pool_apy_mainnet.json";
// import MAINNET_ARCHIVE from "../../data/eclipse/pool_apy_archive_mainnet.json";
import {
  ApySnapshot,
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
import { parseFeeGrowthAndLiquidityOnTicksArray } from "@invariant-labs/sdk-eclipse/lib/utils";
import { getXfromLiquidity } from "@invariant-labs/sdk-eclipse/lib/math";

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: AnchorProvider;
  let fileName: string;
  let archiveFileName: string;
  let ticksFolder: string;
  let apySnaps: Record<string, ApySnapshot>;
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
      fileName = "../data/eclipse/pool_apy_mainnet.json";
      archiveFileName = "../data/eclipse/pool_apy_archive_mainnet.json";
      ticksFolder = "../data/eclipse/ticks/mainnet/";
      // apySnaps = MAINNET_APY;
      // apyArchive = MAINNET_ARCHIVE;
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

  // const allPools = await market.getAllPools();
  const allPools = [
    await market.getPoolByAddress(
      new PublicKey("HRgVv1pyBLXdsAddq4ubSqo8xdQWRrYbvmXqEDtectce")
    ),
    // await market.getPoolByAddress(
    //   new PublicKey("86vPh8ctgeQnnn8qPADy5BkzrqoH5XjMCWvkd4tYhhmM")
    // ),
    // await market.getPoolByAddress(
    //   new PublicKey("E2B7KUFwjxrsy9cC17hmadPsxWHD1NufZXTyrtuz8YxC")
    // ),
    // await market.getPoolByAddress(
    //   new PublicKey("HG7iQMk29cgs74ZhSwrnye3C6SLQwKnfsbXqJVRi1x8H")
    // ),
    // await market.getPoolByAddress(
    //   new PublicKey("FvVsbwsbGVo6PVfimkkPhpcRfBrRitiV946nMNNuz7f9")
    // ),
    // await market.getPoolByAddress(
    //   new PublicKey("HHHGD7BZ7H5fPLh3DNEPFezpLoYBJ16WsmbwRJXXEFSg")
    // ),
  ];

  const dailyData: Record<string, DailyApyData> = {};
  const apy: Record<string, ApySnapshot> = {};
  const poolsData: Record<string, PoolStructure> = {};

  for (let pool of allPools) {
    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
    });
    const address = pair.getAddress(market.program.programId);
    console.log("----------------------------");
    console.log("Pool: ", address.toString());
    poolsData[address.toString()] = pool;

    const activeTokens = await market.getActiveLiquidityInTokens(
      address,
      pool.currentTickIndex
    );

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
            tokenXamount: new BN(0),
            volumeX: 0,
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

          try {
            let apy = 0;
            let tokenXAmount = new BN(0);
            let volumeX = 0;
            try {
              const {
                tickLower,
                tickUpper,
                tokens: avgTokensInRange,
              } = calculateTokensRange(
                prevSnap.ticks,
                currentSnap.ticks,
                pool.currentTickIndex
              );

              const prevTickArray = parseFeeGrowthAndLiquidityOnTicksArray(
                prevSnap.ticks
              );
              const { tokens: previousXamount } = getTokensAndLiquidity(
                prevTickArray,
                pool.currentTickIndex // redundant
              );

              const currTickArray = parseFeeGrowthAndLiquidityOnTicksArray(
                currentSnap.ticks
              );

              const { tokens: currentXamount } = getTokensAndLiquidity(
                currTickArray,
                pool.currentTickIndex // Redundant
              );

              console.log("Previous X", previousXamount.toString());
              console.log("Current X", currentXamount.toString());
              console.log("Active Tokens", activeTokens.toString());
              // 217.200.755_793551

              // const avgTokens = arithmeticalAvg(
              //   previousXamount,
              //   currentXamount
              // );
              // console.log("Global avg tokens in pool", avgTokens.toString());
              // 232.704.892_411855

              console.log("Avg Tokens X In Range", avgTokensInRange.toString());
              // 77382_249919
              // 77382_249919

              const avgTokens = avgTokensInRange;

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

              const volume = new BN(currentSnap.volumeX)
                .sub(new BN(prevSnap.volumeX))
                .add(denominatedVolumeY);

              // 699963_886641
              console.log("Volume: ", volume.toString());
              console.log("Avg Tokens: ", avgTokens.toString());
              console.log("Fee", pool.fee.toString());

              const feeTier = { fee: pool.fee, tickSpacing: pool.tickSpacing };
              const dailyFactor = dailyFactorPool(
                avgTokens,
                volume.toNumber(),
                feeTier
              );

              console.log("Daily Factor: ", dailyFactor.toString());
              const APY = (Math.pow(dailyFactor + 1, 365) - 1) * 100;

              console.log("APY: ", APY);
              tokenXAmount = avgTokens;
              volumeX = volume;
              apy = APY;
            } catch (e) {
              console.log(e);
            }

            dailyData[address.toString()] = {
              apy: isNaN(+JSON.stringify(apy)) ? 0 : apy,
              tokenXamount: tokenXAmount,
              volumeX: volumeX,
            };
          } catch (_error) {
            console.log(_error);
            dailyData[address.toString()] = {
              apy: 0,
              tokenXamount: new BN(0),
              volumeX: 0,
            };
          }
        }
      })
      .catch(() => {
        dailyData[address.toString()] = {
          apy: 0,
          tokenXamount: new BN(0),
          volumeX: 0,
        };
      });

    await sleep(100);
  }

  const now = Date.now();
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
    1000 * 60 * 60 * 12;

  // Object.entries(dailyData).forEach(([address, data]) => {
  //   if (!apyArchive[address]) {
  //     apyArchive[address] = [];
  //   }
  //   apyArchive[address].push({
  //     timestamp,
  //     apy: data.apy,
  //     // range: data.weeklyRange[data.weeklyRange.length - 1],
  //     // weeklyFactor: data.weeklyFactor,
  //     tokenXAmount: data.tokenXamount.toString(),
  //     volumeX: data.volumeX,
  //     tokenX: {
  //       address: poolsData[address].tokenX.toString(),
  //       ticker:
  //         tokensData?.[poolsData[address].tokenX.toString()]?.ticker ?? "",
  //       decimals:
  //         tokensData?.[poolsData[address].tokenX.toString()]?.decimals ?? 0,
  //     },
  //     tokenY: {
  //       address: poolsData[address].tokenY.toString(),
  //       ticker:
  //         tokensData?.[poolsData[address].tokenY.toString()]?.ticker ?? "",
  //       decimals:
  //         tokensData?.[poolsData[address].tokenY.toString()]?.decimals ?? 0,
  //     },
  //   });
  //   apy[address] = {
  //     apy: data.apy,
  //     // weeklyFactor: data.weeklyFactor,
  //     // weeklyRange: data.weeklyRange,
  //   };
  // });

  //   fs.writeFile(fileName, JSON.stringify(apy), (err) => {
  //     if (err) {
  //       throw err;
  //     }
  //   });

  //   fs.writeFile(archiveFileName, JSON.stringify(apyArchive), (err) => {
  //     if (err) {
  //       throw err;
  //     }
  //   });
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
