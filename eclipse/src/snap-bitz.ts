import { AnchorProvider, BN } from "@coral-xyz/anchor";
import fs from "fs";
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
import {
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
} from "spl-token-eclipse";

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

  const lastRewards =
    data.data && data.data.length > 0
      ? new BN(data.data[data.data.length - 1].rewards24h)
      : new BN(0);

  const now = Date.now();
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
    1000 * 60 * 60 * 12;

  const [boost] = staking.getBoostAddressAndBump(BITZ_MINT);
  const [stakeAuthority] = staking.getAuthorityAddressAndBump();
  const [stake] = staking.getStakeAddressAndBump(boost, stakeAuthority);
  const [treasury] = staking.getTreasuryAddressAndBump();
  const treasuryTokens = getAssociatedTokenAddressSync(
    BITZ_MINT,
    treasury,
    true
  );

  const [
    [stakeAccount, treasuryTokensAccount, bitzInfo, sbitzInfo],
    bitzHolders,
    sbitzHolders,
    mintInfo,
  ] = await Promise.all([
    connection.getMultipleAccountsInfo([
      stake,
      treasuryTokens,
      BITZ_MINT,
      SBITZ_MINT,
    ]),
    getBitzHoldersAmount(),
    getSbitzHoldersAmount(),
    staking.getMintInfo(),
  ]);

  const bitzStaked = stakeAccount
    ? deserializeStake(stakeAccount.data).balance
    : new BN(0);

  const totalBitzStaked = treasuryTokensAccount
    ? new BN(
        unpackAccount(
          treasuryTokens,
          treasuryTokensAccount,
          treasuryTokensAccount.owner
        ).amount.toString()
      )
    : new BN(0);

  const bitzSupply = bitzInfo
    ? new BN(unpackMint(BITZ_MINT, bitzInfo, bitzInfo.owner).supply.toString())
    : new BN(0);
  const sbitzSupply = sbitzInfo
    ? new BN(
        unpackMint(SBITZ_MINT, sbitzInfo, sbitzInfo.owner).supply.toString()
      )
    : new BN(0);

  const claimedYield = mintInfo.claimedYield;
  const rewards24h = claimedYield.sub(lastRewards);

  data.data.push({
    timestamp,
    bitzStaked: bitzStaked.toString(),
    bitzSupply: bitzSupply.toString(),
    totalBitzStaked: totalBitzStaked.toString(),
    sbitzHolders,
    sbitzSupply: sbitzSupply.toString(),
    bitzHolders,
    rewards24h: rewards24h.toString(),
  });

  fs.writeFile(fileName, JSON.stringify(data), (err) => {
    if (err) {
      throw err;
    }
  });
};

// createSnapshotForNetwork(Network.TEST).then(
//   () => {
//     console.log("Eclipse: Bitz testnet snapshot done!");
//   },
//   (err) => {
//     console.log(err);
//   }
// );

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Eclipse: Bitz mainnet snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
