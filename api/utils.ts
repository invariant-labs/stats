import BN from "bn.js";

export const printBN = (amount: BN, decimals: number): string => {
  const balanceString = amount.toString();
  if (balanceString.length <= decimals) {
    return "0." + "0".repeat(decimals - balanceString.length) + balanceString;
  } else {
    return (
      balanceString.substring(0, balanceString.length - decimals) +
      "." +
      balanceString.substring(balanceString.length - decimals)
    );
  }
};

export interface SnapshotValueData {
  tokenBNFromBeginning: string;
  usdValue24: number;
}

export interface PoolSnapshot {
  timestamp: number;
  volumeX: SnapshotValueData;
  volumeY: SnapshotValueData;
  liquidityX: SnapshotValueData;
  liquidityY: SnapshotValueData;
  feeX: SnapshotValueData;
  feeY: SnapshotValueData;
}

export interface PoolStatsData {
  snapshots: PoolSnapshot[];
  tokenX: {
    address: string;
    decimals: number;
  };
  tokenY: {
    address: string;
    decimals: number;
  };
}

export const enum A0Network {
  Testnet = "testnet",
  Mainnet = "mainnet",
}

export const enum ALPHNetwork {
  Testnet = "testnet",
  Mainnet = "mainnet",
}

export const enum VaraNetwork {
  Testnet = "testnet",
  Mainnet = "mainnet",
}

export const toStringWithDecimals = (num: bigint, decimals: number) => {
  const upper = num / BigInt(10 ** decimals);
  const lower = num - upper;

  return upper + "." + lower;
};
