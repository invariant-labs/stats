import { Network, Market, Pair, getMarketAddress } from "@invariant-labs/sdk";
import { Provider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_TICKS from "../data/ticks_devnet.json";
import MAINNET_TICKS from "../data/ticks_mainnet.json";
import { jsonToTicks, TicksSnapshot } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider;
  let fileName: string;
  let snaps: Record<string, TicksSnapshot[]>;

  switch (network) {
    case Network.MAIN:
      provider = Provider.local("https://ssc-dao.genesysgo.net");
      fileName = "./data/ticks_mainnet.json";
      snaps = jsonToTicks(MAINNET_TICKS);
      break;
    case Network.DEV:
    default:
      provider = Provider.local("https://api.devnet.solana.com");
      fileName = "./data/ticks_devnet.json";
      snaps = jsonToTicks(DEVNET_TICKS);
  }

  const connection = provider.connection;

  const market = await Market.build(
    network,
    provider.wallet,
    connection,
    new PublicKey(getMarketAddress(network))
  );

  const allPools = await market.getAllPools();

  const poolsData = await Promise.all(
    allPools.map(async (pool) => {
      const pair = new Pair(pool.tokenX, pool.tokenY, { fee: pool.fee.v });
      const address = await pair.getAddress(market.program.programId);
      const ticks = await market.getAllTicks(pair);

      return {
        address: address.toString(),
        ticks,
      };
    })
  );

  const now = Date.now();
  const timestamp = Math.floor(now / (1000 * 60 * 60)) * (1000 * 60 * 60);

  poolsData.forEach(({ address, ticks }) => {
    if (!snaps[address]) {
      snaps[address] = [];
    }

    snaps[address].push({
      timestamp,
      ticks,
    });

    snaps[address] = snaps[address].slice(
      Math.max(snaps[address].length - 25, 0),
      snaps[address].length
    );
  });

  fs.writeFile(fileName, JSON.stringify(snaps), (err) => {
    if (err) {
      throw err;
    }
  });
};

createSnapshotForNetwork(Network.DEV).then(
  () => {
    console.log("Devnet ticks snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Mainnet ticks snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
