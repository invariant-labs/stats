import { AnchorProvider } from "@coral-xyz/anchor";
import fs from "fs";
import BN from "bn.js";
import { LiquidityStaking } from "@invariant-labs/sbitz";
import { IWallet } from "@invariant-labs/sbitz/lib/types";
import { BITZ_MINT, SBITZ_MINT } from "@invariant-labs/sbitz/lib/consts";
import { Network } from "@invariant-labs/sbitz/lib/network";
import {
  getBitzHoldersAmount,
  getSbitzHoldersAmount,
  deserializeStake,
} from "@invariant-labs/sbitz/lib/utils";
import { ISbitzData } from "./utils";
import { PublicKey } from "web3-eclipse";

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: AnchorProvider;
  let fileName: string;

  switch (network) {
    case Network.MAIN:
      provider = AnchorProvider.local("https://eclipse.helius-rpc.com");
      fileName = "../data/eclipse/sbitz.json";
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

  const lastRewards =
    data && data.length > 0
      ? new BN(data[data.length - 1].rewards24h)
      : new BN(0);

  const now = Date.now();
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
    1000 * 60 * 60 * 12;

  const [boost] = staking.getBoostAddressAndBump(BITZ_MINT);
  const [stakeAuthority] = staking.getAuthorityAddressAndBump();
  const [stake] = staking.getStakeAddressAndBump(boost, stakeAuthority);
  const bitzStakingReserve = new PublicKey(
    "7rkHt2NULbkz9rhEeH9nJxLuFgCzSsmcYiDpXjMTfBtF"
  );

  const [
    stakeAccount,
    totalBitzStaked,
    bitzSupply,
    sbitzSupply,
    bitzHolders,
    sbitzHolders,
    mintInfo,
  ] = await Promise.all([
    connection.getAccountInfo(stake),
    connection.getTokenAccountBalance(bitzStakingReserve),
    connection.getTokenSupply(BITZ_MINT),
    connection.getTokenSupply(SBITZ_MINT),
    getBitzHoldersAmount(),
    getSbitzHoldersAmount(),
    staking.getMintInfo(),
  ]);

  const bitzStaked = stakeAccount
    ? deserializeStake(stakeAccount.data).balance
    : new BN(0);

  const claimedYield = mintInfo.claimedYield;
  const rewards24h = claimedYield.sub(lastRewards);

  data.push({
    timestamp,
    bitzStaked: bitzStaked.toString(),
    bitzSupply: bitzSupply.value.amount,
    totalBitzStaked: totalBitzStaked.value.amount,
    sbitzHolders,
    sbitzSupply: sbitzSupply.value.amount,
    bitzHolders,
    rewards24h: rewards24h.toString(),
  });

  fs.writeFile(fileName, JSON.stringify(data), (err) => {
    if (err) {
      throw err;
    }
  });
};

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Eclipse: Bitz mainnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
