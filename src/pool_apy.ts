import { Network, Market, getMarketAddress, Pair } from "@invariant-labs/sdk";
import { poolAPY } from "@invariant-labs/sdk/lib/utils";
import { BN, Provider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_APY from "../data/pool_apy_devnet.json";
import MAINNET_APY from "../data/pool_apy_mainnet.json";
import { ApySnapshot, jsonArrayToTicks } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider;
  let fileName: string;
  let ticksFolder: string;
  let apySnaps: Record<string, ApySnapshot>;

  switch (network) {
    case Network.MAIN:
      provider = Provider.local("https://ssc-dao.genesysgo.net");
      fileName = "./data/pool_apy_mainnet.json";
      ticksFolder = "./data/ticks/mainnet/";
      apySnaps = MAINNET_APY;
      break;
    case Network.DEV:
    default:
      provider = Provider.local("https://api.devnet.solana.com");
      fileName = "./data/pool_apy_devnet.json";
      ticksFolder = "./data/ticks/devnet/";
      apySnaps = DEVNET_APY;
  }

  const connection = provider.connection;

  const market = await Market.build(
    network,
    provider.wallet,
    connection,
    new PublicKey(getMarketAddress(network))
  );

  const allPools = await market.getAllPools();

  const apy: Record<string, ApySnapshot> = {};
  const input: Record<string, any> = {};

  await Promise.all(
    allPools.map(async (pool) => {
      const pair = new Pair(pool.tokenX, pool.tokenY, { fee: pool.fee.v });
      const address = await pair.getAddress(market.program.programId);

      return await fs.promises
        .readFile(ticksFolder + address.toString() + ".json", "utf-8")
        .then((data) => {
          const snaps = jsonArrayToTicks(address.toString(), JSON.parse(data));

          if (
            !snaps.length ||
            (snaps[snaps.length - 1].timestamp - snaps[0].timestamp) /
              (1000 * 60 * 60) <
              24
          ) {
            apy[address.toString()] = {
              apy: 0,
              weeklyFactor: 0,
            };
          } else {
            const len = snaps.length;
            const currentSnap = snaps[len - 1];

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
            const prevSnap = snaps[index];

            try {
              const poolApy = poolAPY({
                feeTier: { fee: pool.fee.v },
                volumeX: +new BN(currentSnap.volumeX)
                  .sub(new BN(prevSnap.volumeX))
                  .toString(),
                volumeY: +new BN(currentSnap.volumeY)
                  .sub(new BN(prevSnap.volumeY))
                  .toString(),
                ticksPreviousSnapshot: prevSnap.ticks,
                ticksCurrentSnapshot: currentSnap.ticks,
                weeklyFactor: apySnaps?.[address.toString()]?.weeklyFactor ?? 0,
                currentTickIndex: pool.currentTickIndex,
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
                weeklyFactor: apySnaps?.[address.toString()]?.weeklyFactor ?? 0,
                currentTickIndex: pool.currentTickIndex,
              };

              apy[address.toString()] = {
                apy: isNaN(+JSON.stringify(poolApy.apy)) ? 0 : poolApy.apy,
                weeklyFactor: isNaN(+JSON.stringify(poolApy.apyFactor))
                  ? 0
                  : poolApy.apyFactor,
              };
            } catch (_error) {
              apy[address.toString()] = {
                apy: 0,
                weeklyFactor: 0,
              };
            }
          }
        })
        .catch(() => {
          apy[address.toString()] = {
            apy: 0,
            weeklyFactor: 0,
          };
        });
    })
  );

  if (network === Network.MAIN) {
    fs.writeFile(
      "./data/input_mainnet_pool_apy.json",
      JSON.stringify(input),
      (err) => {
        if (err) {
          throw err;
        }
      }
    );
  }

  fs.writeFile(fileName, JSON.stringify(apy), (err) => {
    if (err) {
      throw err;
    }
  });
};

createSnapshotForNetwork(Network.DEV).then(
  () => {
    console.log("Devnet pool apy snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Mainnet pool apy snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
