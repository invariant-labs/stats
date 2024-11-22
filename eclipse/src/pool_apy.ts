import {
  Network,
  Market,
  getMarketAddress,
  Pair,
  sleep,
  IWallet,
} from "@invariant-labs/sdk-eclipse";
import { poolAPY, WeeklyData } from "@invariant-labs/sdk-eclipse/lib/utils";
import { BN, Provider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_APY from "../../data/eclipse/pool_apy_devnet.json";
import DEVNET_ARCHIVE from "../../data/eclipse/pool_apy_archive_devnet.json";
import {
  ApySnapshot,
  eclipseDevnetTokensData,
  jsonArrayToTicks,
  PoolApyArchiveSnapshot,
  TokenData,
} from "./utils";
import { PoolStructure } from "@invariant-labs/sdk-eclipse/lib/market";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider;
  let fileName: string;
  let archiveFileName: string;
  let ticksFolder: string;
  let apySnaps: Record<string, ApySnapshot>;
  let apyArchive: Record<string, PoolApyArchiveSnapshot[]>;
  let tokensData: Record<string, TokenData>;

  switch (network) {
    case Network.DEV:
    default:
      provider = Provider.local("https://staging-rpc.dev2.eclipsenetwork.xyz");
      fileName = "../data/eclipse/pool_apy_devnet.json";
      archiveFileName = "../data/eclipse/pool_apy_archive_devnet.json";
      ticksFolder = "../data/eclipse/ticks/devnet/";
      apySnaps = DEVNET_APY;
      apyArchive = DEVNET_ARCHIVE;
      tokensData = eclipseDevnetTokensData;
  }

  const connection = provider.connection;

  const market = await Market.build(
    network,
    provider.wallet as IWallet,
    connection,
    new PublicKey(getMarketAddress(network))
  );

  const allPools = await market.getAllPools();

  const weeklyData: Record<string, WeeklyData> = {};
  const apy: Record<string, ApySnapshot> = {};
  const poolsData: Record<string, PoolStructure> = {};
  const input: Record<string, any> = {};

  for (let pool of allPools) {
    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee.v,
      tickSpacing: pool.tickSpacing,
    });
    const address = await pair.getAddress(market.program.programId);
    let activeTokens;
    try {
      activeTokens = await market.getActiveLiquidityInTokens(
        address,
        pool.currentTickIndex
      );
    } catch {
      activeTokens = new BN("0");
    }
    poolsData[address.toString()] = pool;

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
          weeklyData[address.toString()] = {
            apy: 0,
            weeklyFactor: [0, 0, 0, 0, 0, 0, 0],
            weeklyRange: [
              { tickLower: null, tickUpper: null },
              { tickLower: null, tickUpper: null },
              { tickLower: null, tickUpper: null },
              { tickLower: null, tickUpper: null },
              { tickLower: null, tickUpper: null },
              { tickLower: null, tickUpper: null },
              { tickLower: null, tickUpper: null },
            ],
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
            const lastWeeklyData =
              typeof apySnaps?.[address.toString()] !== "undefined"
                ? {
                    ...apySnaps?.[address.toString()],
                    tokenXamount: new BN(0),
                    volumeX: 0,
                  }
                : undefined;

            const poolApy = poolAPY({
              feeTier: { fee: pool.fee.v, tickSpacing: pool.tickSpacing },
              volumeX: +new BN(currentSnap.volumeX)
                .sub(new BN(prevSnap.volumeX))
                .toString(),
              volumeY: +new BN(currentSnap.volumeY)
                .sub(new BN(prevSnap.volumeY))
                .toString(),
              ticksPreviousSnapshot: prevSnap.ticks,
              ticksCurrentSnapshot: currentSnap.ticks,
              weeklyData: lastWeeklyData ?? {
                apy: 0,
                weeklyFactor: [0, 0, 0, 0, 0, 0, 0],
                weeklyRange: [
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                ],
                tokenXamount: new BN(0),
                volumeX: 0,
              },
              currentTickIndex: pool.currentTickIndex,
              activeTokens,
            });

            input[address.toString()] = {
              feeTier: { fee: pool.fee.v.toString() },
              volumeX: +new BN(currentSnap.volumeX)
                .sub(new BN(prevSnap.volumeX))
                .toString(),
              volumeY: +new BN(currentSnap.volumeY)
                .sub(new BN(prevSnap.volumeY))
                .toString(),
              ticksPreviousSnapshot: prevSnap.ticks.map((tick) => ({
                index: tick.index,
                sign: tick.sign,
                bump: tick.bump,
                liquidityChange: { v: tick.liquidityChange.v.toString() },
                liquidityGross: { v: tick.liquidityGross.v.toString() },
                sqrtPrice: { v: tick.sqrtPrice.v.toString() },
                feeGrowthOutsideX: { v: tick.feeGrowthOutsideX.v.toString() },
                feeGrowthOutsideY: { v: tick.feeGrowthOutsideY.v.toString() },
                secondsPerLiquidityOutside: {
                  v: tick.secondsPerLiquidityOutside.v.toString(),
                },
                pool: tick.pool.toString(),
              })),
              ticksCurrentSnapshot: currentSnap.ticks.map((tick) => ({
                index: tick.index,
                sign: tick.sign,
                bump: tick.bump,
                liquidityChange: { v: tick.liquidityChange.v.toString() },
                liquidityGross: { v: tick.liquidityGross.v.toString() },
                sqrtPrice: { v: tick.sqrtPrice.v.toString() },
                feeGrowthOutsideX: { v: tick.feeGrowthOutsideX.v.toString() },
                feeGrowthOutsideY: { v: tick.feeGrowthOutsideY.v.toString() },
                secondsPerLiquidityOutside: {
                  v: tick.secondsPerLiquidityOutside.v.toString(),
                },
                pool: tick.pool.toString(),
              })),
              weeklyData: apySnaps?.[address.toString()] ?? {
                apy: 0,
                weeklyFactor: [0, 0, 0, 0, 0, 0, 0],
                weeklyRange: [
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                  { tickLower: null, tickUpper: null },
                ],
              },
              currentTickIndex: pool.currentTickIndex,
              activeTokens,
            };

            weeklyData[address.toString()] = {
              ...poolApy,
              apy: isNaN(+JSON.stringify(poolApy.apy)) ? 0 : poolApy.apy,
              weeklyFactor: poolApy.weeklyFactor.map((factor) =>
                isNaN(+JSON.stringify(factor)) ? 0 : factor
              ),
            };
          } catch (_error) {
            weeklyData[address.toString()] = {
              apy: 0,
              weeklyFactor: [0, 0, 0, 0, 0, 0, 0],
              weeklyRange: [
                { tickLower: null, tickUpper: null },
                { tickLower: null, tickUpper: null },
                { tickLower: null, tickUpper: null },
                { tickLower: null, tickUpper: null },
                { tickLower: null, tickUpper: null },
                { tickLower: null, tickUpper: null },
                { tickLower: null, tickUpper: null },
              ],
              tokenXamount: new BN(0),
              volumeX: 0,
            };
          }
        }
      })
      .catch(() => {
        weeklyData[address.toString()] = {
          apy: 0,
          weeklyFactor: [0, 0, 0, 0, 0, 0, 0],
          weeklyRange: [
            { tickLower: null, tickUpper: null },
            { tickLower: null, tickUpper: null },
            { tickLower: null, tickUpper: null },
            { tickLower: null, tickUpper: null },
            { tickLower: null, tickUpper: null },
            { tickLower: null, tickUpper: null },
            { tickLower: null, tickUpper: null },
          ],
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

  Object.entries(weeklyData).forEach(([address, data]) => {
    if (!apyArchive[address]) {
      apyArchive[address] = [];
    }
    apyArchive[address].push({
      timestamp,
      apy: data.apy,
      range: data.weeklyRange[data.weeklyRange.length - 1],
      weeklyFactor: data.weeklyFactor,
      tokenXAmount: data.tokenXamount.toString(),
      volumeX: data.volumeX,
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
    apy[address] = {
      apy: data.apy,
      weeklyFactor: data.weeklyFactor,
      weeklyRange: data.weeklyRange,
    };
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
