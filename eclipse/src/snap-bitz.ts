import { AnchorProvider } from "@coral-xyz/anchor";
import fs from "fs";
import { LiquidityStaking } from "@invariant-labs/sbitz";
import { IWallet } from "@invariant-labs/sbitz/lib/types";
import { Network } from "@invariant-labs/sbitz/lib/network";
import {
  getBitzSupply,
  getSbitzSupply,
  getBitzHoldersAmount,
  getSbitzHoldersAmount,
} from "@invariant-labs/sbitz/lib/utils";
import { ISbitzData } from "./utils";

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: AnchorProvider;
  let fileName: string;

  switch (network) {
    case Network.TEST:
      provider = AnchorProvider.local(
        "https://testnet.dev2.eclipsenetwork.xyz"
      );
      fileName = "../data/eclipse/sbitz/testnet.json";
      break;
    case Network.MAIN:
      provider = AnchorProvider.local("https://eclipse.helius-rpc.com");
      fileName = "../data/eclipse/sbitz/mainnet.json";
      break;
    default:
      throw new Error("Unknown network");
  }

  const data: ISbitzData = JSON.parse(fs.readFileSync(fileName, "utf-8"));

  const connection = provider.connection;

  const staking = LiquidityStaking.build(
    network,
    provider.wallet as IWallet,
    connection
  );
  const now = Date.now();
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
    1000 * 60 * 60 * 12;
  const [
    bitzStaked,
    totalBitzStaked,
    bitzSupply,
    sbitzSupply,
    bitzHolders,
    sbitzHolders,
  ] = await Promise.all([
    staking.getStakedAmount(),
    staking.getAllStakedAmount(),
    getBitzSupply(connection),
    getSbitzSupply(connection),
    getBitzHoldersAmount(),
    getSbitzHoldersAmount(),
  ]);

  data.data.push({
    timestamp,
    bitzStaked,
    bitzSupply,
    totalBitzStaked,
    sbitzHolders,
    sbitzSupply,
    bitzHolders,
  });

  fs.writeFile(fileName, JSON.stringify(data), (err) => {
    if (err) {
      throw err;
    }
  });
};

createSnapshotForNetwork(Network.TEST).then(
  () => {
    console.log("Eclipse: Bitz testnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Eclipse: Bitz mainnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
