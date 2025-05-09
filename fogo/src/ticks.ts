import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Network,
  Market,
  Pair,
  getMarketAddress,
  sleep,
  IWallet,
} from "@invariant-labs/sdk-fogo";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: AnchorProvider;
  let folderName: string;

  switch (network) {
    case Network.TEST:
      provider = AnchorProvider.local("https://testnet.fogo.io");
      folderName = "../data/fogo/ticks/testnet/";
      break;
    case Network.MAIN:
      provider = AnchorProvider.local("");
      folderName = "../data/fogo/ticks/mainnet/";
      break;
    default:
      throw new Error("Unknown network");
  }

  const connection = provider.connection;

  const market = Market.build(
    network,
    provider.wallet as IWallet,
    connection,
    new PublicKey(getMarketAddress(network))
  );

  const now = Date.now();
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
    1000 * 60 * 60 * 12;

  const allPools = await market.getAllPools();

  for (let pool of allPools) {
    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
    });
    const address = await pair.getAddress(market.program.programId);
    const ticks = await market.getAllTicks(pair);

    let volumeX, volumeY;

    try {
      const volumes = await market.getVolume(pair);
      volumeX = volumes.volumeX;
      volumeY = volumes.volumeY;
    } catch {
      volumeX = new BN("0");
      volumeY = new BN("0");
    }

    fs.readFile(
      folderName + address.toString() + ".json",
      "utf-8",
      (err, data) => {
        let snaps: any[] = [];
        if (!err) {
          snaps = JSON.parse(data);
        }

        snaps.push({
          timestamp,
          ticks,
          volumeX: volumeX.toString(),
          volumeY: volumeY.toString(),
        });

        snaps = snaps.slice(Math.max(snaps.length - 8, 0), snaps.length);

        fs.writeFile(
          folderName + address + ".json",
          JSON.stringify(snaps),
          (err) => {
            if (err) {
              console.log(err);
            }
          }
        );
      }
    );

    await sleep(100);
  }
};

createSnapshotForNetwork(Network.TEST).then(
  () => {
    console.log("Fogo: Testnet ticks snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

// createSnapshotForNetwork(Network.MAIN).then(
//   () => {
//     console.log("Fogo: Mainnet ticks snapshot done!");
//   },
//   (err) => {
//     console.log(err);
//   }
// );
