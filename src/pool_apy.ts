import { Network, Market, getMarketAddress, Pair } from "@invariant-labs/sdk";
import { poolAPY } from "@invariant-labs/sdk/lib/utils";
import { BN, Provider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_TICKS from "../data/ticks_devnet.json";
import MAINNET_TICKS from "../data/ticks_mainnet.json";
import DEVNET_APY from "../data/pool_apy_devnet.json";
import MAINNET_APY from "../data/pool_apy_mainnet.json";
import { TicksSnapshot, jsonToTicks, ApySnapshot } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider;
  let fileName: string;
  let snaps: Record<string, TicksSnapshot[]>;
  let apySnaps: Record<string, ApySnapshot>;

  switch (network) {
    case Network.MAIN:
      provider = Provider.local("https://ssc-dao.genesysgo.net");
      fileName = "./data/pool_apy_mainnet.json";
      snaps = jsonToTicks(MAINNET_TICKS);
      apySnaps = MAINNET_APY;
      break;
    case Network.DEV:
    default:
      provider = Provider.local("https://api.devnet.solana.com");
      fileName = "./data/pool_apy_devnet.json";
      snaps = jsonToTicks(DEVNET_TICKS);
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

  await Promise.all(
    allPools.map(async (pool) => {
      const pair = new Pair(pool.tokenX, pool.tokenY, { fee: pool.fee.v });
      const address = await pair.getAddress(market.program.programId);

      if (snaps[address.toString()].length < 25) {
        apy[address.toString()] = {
          apy: 0,
          weeklyFactor: 0.01,
        };
      } else {
        const len = snaps[address.toString()].length;
        const currentSnap = snaps[address.toString()][len - 1];
        const prevSnap = snaps[address.toString()][len - 25];

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
            weeklyFactor: apySnaps?.[address.toString()]?.weeklyFactor ?? 0.01,
            currentTickIndex: pool.currentTickIndex,
          });

          apy[address.toString()] = {
            apy: isNaN(+JSON.stringify(poolApy.apy)) ? 0 : poolApy.apy,
            weeklyFactor: isNaN(+JSON.stringify(poolApy.apyFactor))
              ? 0.01
              : poolApy.apyFactor,
          };
        } catch (_error) {
          apy[address.toString()] = {
            apy: 0,
            weeklyFactor: 0.01,
          };
        }
      }
    })
  );

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
