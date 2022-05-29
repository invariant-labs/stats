import { Network } from "@invariant-labs/sdk";
import fs from "fs";
import DEVNET_TICKS from "../data/ticks_devnet.json";
import MAINNET_TICKS from "../data/ticks_mainnet.json";

export const divideTicksForNetwork = async (network: Network) => {
  let folderName: string;
  let snaps: Record<string, any[]>;

  switch (network) {
    case Network.MAIN:
      folderName = "./data/ticks/mainnet/";
      snaps = MAINNET_TICKS as Record<string, any[]>;
      break;
    case Network.DEV:
    default:
      folderName = "./data/ticks/devnet/";
      snaps = DEVNET_TICKS as Record<string, any[]>;
  }

  Object.entries(snaps).forEach(([address, snaps]) => {
    fs.writeFile(folderName + address + '.json', JSON.stringify(snaps),  (err) => {
      if (err) {
        throw err;
      }
    })
  })
};

divideTicksForNetwork(Network.DEV).then(
  () => {
    console.log("Devnet ticks divided!");
  },
  (err) => {
    console.log(err);
  }
);

divideTicksForNetwork(Network.MAIN).then(
  () => {
    console.log("Mainnet ticks divided!");
  },
  (err) => {
    console.log(err);
  }
);
