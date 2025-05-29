/* eslint-disable @typescript-eslint/naming-convention */
import { MOCK_TOKENS, Network } from "@invariant-labs/sdk-eclipse";
// import { Network as StakerNetwork } from "@invariant-labs/staker-sdk";
import {
  Market,
  PoolStructure,
  Tick,
} from "@invariant-labs/sdk-eclipse/lib/market";
import { Market as EclipseMarket } from "@invariant-labs/sdk-eclipse/lib/market";
import {
  dailyFactorPool,
  DECIMAL,
  Range,
} from "@invariant-labs/sdk-eclipse/lib/utils";
import BN from "bn.js";
import { Connection, ParsedAccountData, PublicKey } from "@solana/web3.js";
import axios, { AxiosResponse } from "axios";
//@ts-ignore
import MAINNET_TOKENS from "../../data/mainnet_tokens.json";
import { TokenInfo } from "@solana/spl-token-registry";
import { Network as EclipseNetwork } from "@invariant-labs/sdk-eclipse";
import { readFileSync } from "fs";

export const MAX_ATAS_IN_BATCH = 100;
export const ONE_DAY = 24 * 60 * 60; // seconds
export const TIERS_TO_OMIT = [0.001, 0.003];
export enum Intervals {
  Daily = "daily",
  Weekly = "weekly",
  Monthly = "monthly",
  Yearly = "yearly",
  All = "all",
}

export interface IntervalStats {
  daily: TotalIntervalStats;
  weekly: TotalIntervalStats;
  monthly: TotalIntervalStats;
  yearly: TotalIntervalStats;
  all: TotalIntervalStats;
}
export interface TotalIntervalStats {
  volume: {
    value: number;
    change: number;
  };
  tvl: {
    value: number;
    change: number;
  };
  fees: {
    value: number;
    change: number;
  };
  volumePlot: TimeData[];
  liquidityPlot: TimeData[];
  tokensData: (Omit<TokenStatsDataWithString, "volume24"> & {
    volume: number;
  })[];
  poolsData: (Omit<PoolStatsDataWithString, "volume24"> & { volume: number })[];
}

export interface PoolIntervalPlots {
  daily: IntervalPlot;
  weekly: IntervalPlot;
  monthly: IntervalPlot;
  yearly: IntervalPlot;
  all: IntervalPlot;
}

export interface IntervalPlot {
  volumePlot: TimeData[];
  liquidityPlot: TimeData[];
  feesPlot: TimeData[];
}
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
  lockedX?: SnapshotValueData;
  lockedY?: SnapshotValueData;
  protocolFeeX?: string;
  protocolFeeY?: string;
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

export interface PoolsApyStatsData {
  apy: number;
  weeklyFacetor: number[];
  weeklyRange: Range[];
}

export interface PoolLock {
  lockedX: BN;
  lockedY: BN;
}

export interface DailyApyData {
  apy: number;
  totalVolumeX: number;
  totalXAmount: BN;
  volumeX: number;
  volumeY: number;
}

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

export const printBNtoBN = (amount: string, decimals: number): BN => {
  const balanceString = amount.split(".");
  if (balanceString.length !== 2) {
    return new BN(balanceString[0] + "0".repeat(decimals));
  }
  if (balanceString[1].length <= decimals) {
    return new BN(
      balanceString[0] +
        balanceString[1] +
        "0".repeat(decimals - balanceString[1].length)
    );
  }
  return new BN(0);
};

export interface TokenData {
  ticker?: string;
  coingeckoId?: string;
  decimals: number;
  solAddress?: string;
}

export const getTokensData = async (): Promise<Record<string, TokenData>> => {
  const tokensObj: Record<string, TokenData> = {};

  (MAINNET_TOKENS as TokenInfo[]).forEach((token) => {
    tokensObj[token.address.toString()] = {
      decimals: token.decimals,
      coingeckoId: token.extensions?.coingeckoId,
      ticker: token?.symbol,
    };
  });

  return tokensObj;
};

export interface IPriceData {
  data: Record<string, { price: number }>;
  lastUpdateTimestamp: number;
}

export const getTokensPrices = async (
  network: Network
): Promise<Record<string, { price: number }>> => {
  const supportedNetworks = {
    [Network.TEST]: "eclipse-testnet",
    [Network.MAIN]: "eclipse-mainnet",
  };
  const { data } = await axios.get<IPriceData>(
    `https://price.invariant.app/${
      supportedNetworks[network] ?? "eclipse-testnet"
    }`
  );

  return data.data;
};

export const getUsdValue24 = (
  total: BN,
  decimals: number,
  price: number | string,
  lastTotal: BN
) => {
  const priceString =
    typeof price === "string" ? price : price.toFixed(DECIMAL);
  const bnPrice = printBNtoBN(priceString, DECIMAL);

  return +printBN(
    total
      .sub(lastTotal)
      .mul(bnPrice)
      .div(new BN(10 ** DECIMAL)),
    decimals
  );
};

export const devnetTokensData = {
  [MOCK_TOKENS.USDC]: {
    decimals: 6,
    coingeckoId: "usd-coin",
    ticker: "USDC",
  },
  [MOCK_TOKENS.USDT]: {
    decimals: 6,
    coingeckoId: "tether",
    ticker: "USDT",
  },
  [MOCK_TOKENS.SOL]: {
    decimals: 9,
    coingeckoId: "solana",
    ticker: "SOL",
  },
  [MOCK_TOKENS.MSOL]: {
    decimals: 9,
    coingeckoId: "msol",
    ticker: "mSOL",
  },
  [MOCK_TOKENS.BTC]: {
    decimals: 6,
    coingeckoId: "bitcoin",
    ticker: "BTC",
  },
  [MOCK_TOKENS.REN_DOGE]: {
    decimals: 8,
    coingeckoId: "rendoge",
    ticker: "renDOGE",
  },
};

export const eclipseDevnetTokensData = {
  GEds1ARB3oywy2sSdiNGDyxz9MhpfqPkFYYStdZmHaiN: {
    decimals: 9,
    coingeckoId: "usd-coin",
    ticker: "USDC",
  },
  CfwLhXJ2r2NmUE1f7oAeySY6eEZ7f5tC8v95nopUs5ez: {
    decimals: 9,
    coingeckoId: "bitcoin",
    ticker: "BTC",
  },
  So11111111111111111111111111111111111111112: {
    decimals: 9,
    coingeckoId: "ethereum",
    ticker: "WETH",
  },
};

export const eclipseTestnetTokensData = {
  "5gFSyxjNsuQsZKn9g5L9Ky3cSUvJ6YXqWVuPzmSi8Trx": {
    decimals: 9,
    coingeckoId: "usd-coin",
    ticker: "USDC",
    solAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  "2F5TprcNBqj2hXVr9oTssabKdf8Zbsf9xStqWjPm8yLo": {
    decimals: 9,
    coingeckoId: "bitcoin",
    ticker: "BTC",
    solAddress: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  },
  So11111111111111111111111111111111111111112: {
    decimals: 9,
    coingeckoId: "ethereum",
    ticker: "WETH",
    solAddress: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  },
};

export const eclipseMainnetTokensData = {
  So11111111111111111111111111111111111111112: {
    decimals: 9,
    coingeckoId: "ethereum",
    ticker: "WETH",
    solAddress: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  },
  CEBP3CqAbW4zdZA57H2wfaSG1QNdzQ72GiQEbQXyW9Tm: {
    decimals: 6,
    coingeckoId: "tether",
    ticker: "USDT",
    solAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  },
  GU7NS9xCwgNPiAdJ69iusFrRfawjDDPjeMBovhV1d4kn: {
    decimals: 9,
    coingeckoId: "turbo-eth",
    ticker: "tETH",
  },
  "64mggk2nXg6vHC1qCdsZdEFzd5QGN4id54Vbho4PswCF": {
    decimals: 11,
  },
  // 2022 tokens
  AKEWE7Bgh87GPp171b4cJPSSZfmZwQ3KaqYqXoKLNAEE: {
    decimals: 6,
    coingeckoId: "usd-coin",
    ticker: "USDC",
    solAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  BeRUj3h7BqkbdfFU7FBNYbodgf8GCHodzKvF9aVjNNfL: {
    decimals: 9,
    coingeckoId: "solana",
    ticker: "SOL",
    solAddress: "So11111111111111111111111111111111111111112",
  },
  "841P4tebEgNux2jaWSjCoi9LhrVr9eHGjLc758Va3RPH": {
    decimals: 6,
    coingeckoId: "dogwifhat",
    ticker: "WIF",
    solAddress: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  },
  "9RryNMhAVJpAwAGjCAMKbbTFwgjapqPkzpGMfTQhEjf8": {
    decimals: 6,
    coingeckoId: "bridged-tia-hyperlane",
    ticker: "TIA",
  },
  V5m1Cc9VK61mKL8xVYrjR7bjD2BC5VpADLa6ws3G8KM: {
    decimals: 6,
    coingeckoId: "stride-staked-tia",
    ticker: "stTIA",
  },
  "2tGbYEm4nuPFyS6zjDTELzEhvVKizgKewi6xT7AaSKzn": {
    decimals: 6,
    coingeckoId: "orca",
    ticker: "ORCA",
    solAddress: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
  },
  HgD4Dc6qYCj3UanMDiuC4qANheeTsAvk6DY91B3F8gnL: {
    decimals: 5,
  },
};

export interface QuotientSnapshot {
  timestamp: number;
  quotient: number;
}

export interface TicksSnapshot {
  timestamp: number;
  ticks: Tick[];
  volumeX: string;
  volumeY: string;
}

export const jsonToTicks = (data: Record<string, any[]>) => {
  const snaps: Record<string, TicksSnapshot[]> = {};

  Object.entries(data).forEach(([address, poolSnaps]) => {
    snaps[address] = [];

    poolSnaps.forEach((snap) => {
      const ticks: Tick[] = [];

      snap.ticks.forEach((tick) => {
        ticks.push({
          index: tick.index,
          sign: tick.sign,
          bump: tick.bump,
          liquidityChange: new BN(tick.liquidityChange.v, "hex"),
          liquidityGross: new BN(tick.liquidityGross.v, "hex"),
          sqrtPrice: new BN(tick.sqrtPrice.v, "hex"),
          feeGrowthOutsideX: new BN(tick.feeGrowthOutsideX.v, "hex"),
          feeGrowthOutsideY: new BN(tick.feeGrowthOutsideY.v, "hex"),
          secondsPerLiquidityOutside: new BN(
            tick.secondsPerLiquidityOutside.v,
            "hex"
          ),
          pool: new PublicKey(address),
        });
      });

      snaps[address].push({
        timestamp: snap.timestamp,
        ticks,
        volumeX: snap.volumeX,
        volumeY: snap.volumeY,
      });
    });
  });

  return snaps;
};

// export const marketToStakerNetwork = (network: Network): StakerNetwork => {
//   switch (network) {
//     case Network.DEV:
//       return StakerNetwork.DEV;
//     case Network.MAIN:
//       return StakerNetwork.MAIN;
//     default:
//       return StakerNetwork.DEV;
//   }
// };

export interface RewardsData {
  token: string;
  total: number;
}

export interface IncentiveApySnapshot {
  apy: number;
  apySingleTick: number;
}

export const jsonArrayToTicks = (address: string, data: any[]) => {
  const snaps: TicksSnapshot[] = [];

  data.forEach((snap) => {
    const ticks: Tick[] = [];

    snap.ticks.forEach((tick) => {
      ticks.push({
        index: tick.index,
        sign: tick.sign,
        bump: tick.bump,
        liquidityChange: new BN(tick.liquidityChange, "hex"),
        liquidityGross: new BN(tick.liquidityGross, "hex"),
        sqrtPrice: new BN(tick.sqrtPrice, "hex"),
        feeGrowthOutsideX: new BN(tick.feeGrowthOutsideX, "hex"),
        feeGrowthOutsideY: new BN(tick.feeGrowthOutsideY, "hex"),
        secondsPerLiquidityOutside: new BN(
          tick.secondsPerLiquidityOutside,
          "hex"
        ),
        pool: new PublicKey(address),
      });
    });

    snaps.push({
      timestamp: snap.timestamp,
      ticks,
      volumeX: snap.volumeX,
      volumeY: snap.volumeY,
    });
  });

  return snaps;
};

export interface PoolApyArchiveSnapshot extends DailyApyData {
  timestamp: number;
  weeklyFactor?: number[];
  tokenX?: {
    address: string;
    ticker: string;
    decimals: number;
  };
  tokenY?: {
    address: string;
    ticker: string;
    decimals: number;
  };
}

export interface PoolWithAddress extends PoolStructure {
  address: PublicKey;
}

export interface TokenStatsDataWithString {
  address: string;
  price: number;
  volume24: number;
  tvl: number;
}

export interface TimeData {
  timestamp: number;
  value: number;
}

export interface PoolStatsDataWithString {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  fee: number;
  volume24: number;
  tvl: number;
  apy: number;
  liquidityX: number;
  liquidityY: number;
  lockedX: number;
  lockedY: number;
}

export const getPoolsFromAdresses = async (
  addresses: PublicKey[],
  marketProgram: Market | EclipseMarket
): Promise<PoolWithAddress[]> => {
  const pools = (await marketProgram.program.account.pool.fetchMultiple(
    addresses
  )) as Array<PoolStructure | null>;

  return pools
    .map((pool, index) =>
      pool !== null
        ? {
            ...pool,
            address: addresses[index],
          }
        : null
    )
    .filter((pool) => pool !== null) as PoolWithAddress[];
};

export const getParsedTokenAccountsFromAddresses = async (
  connection: Connection,
  addresses: PublicKey[]
): Promise<Record<string, ParsedAccountData>> => {
  const batches = addresses.length / MAX_ATAS_IN_BATCH;
  const promises: any[] = [];
  for (let i = 0; i < batches; i++) {
    const start = i * MAX_ATAS_IN_BATCH;
    const end = Math.min((i + 1) * MAX_ATAS_IN_BATCH, addresses.length);
    const batch = addresses.slice(start, end);
    promises.push(
      connection.getMultipleParsedAccounts(batch, {
        commitment: "confirmed",
      })
    );
  }
  const reservesAccounts = (await Promise.all(promises))
    .flat()
    .map((res) => res.value)
    .flat();

  const reserves: Record<string, ParsedAccountData> = reservesAccounts.reduce(
    (acc, ata, index) => {
      const address = addresses[index].toString();
      if (ata) {
        acc[address] = ata;
      }
      return acc;
    },
    {}
  );
  return reserves;
};

export const readReservesFromCache = (
  cacheFileName: string
): Record<string, ParsedAccountData> => {
  const rawData = readFileSync(cacheFileName, "utf-8");
  return JSON.parse(rawData);
};

export const readPoolsFromCache = (cacheFileName: string): PoolStructure[] => {
  const rawData = readFileSync(cacheFileName, "utf-8");
  const parsedData = JSON.parse(rawData);
  const pools: PoolStructure[] = parsedData.map((pool: any) => {
    return {
      ...pool,
      tokenX: new PublicKey(pool.tokenX),
      tokenY: new PublicKey(pool.tokenY),
      tokenXReserve: new PublicKey(pool.tokenXReserve),
      tokenYReserve: new PublicKey(pool.tokenYReserve),
      positionIterator: new BN(pool.positionIterator, "hex"),
      fee: new BN(pool.fee, "hex"),
      protocolFee: new BN(pool.protocolFee, "hex"),
      liquidity: new BN(pool.liquidity, "hex"),
      sqrtPrice: new BN(pool.sqrtPrice, "hex"),
      tickmap: new PublicKey(pool.tickmap),
      feeGrowthGlobalX: new BN(pool.feeGrowthGlobalX, "hex"),
      feeGrowthGlobalY: new BN(pool.feeGrowthGlobalY, "hex"),
      feeProtocolTokenX: new BN(pool.feeProtocolTokenX, "hex"),
      feeProtocolTokenY: new BN(pool.feeProtocolTokenY, "hex"),
      secondsPerLiquidityGlobal: new BN(pool.secondsPerLiquidityGlobal, "hex"),
      startTimestamp: new BN(pool.startTimestamp, "hex"),
      lastTimestamp: new BN(pool.lastTimestamp, "hex"),
      feeReceiver: new PublicKey(pool.feeReceiver),
      oracleAddress: new PublicKey(pool.oracleAddress),
    };
  });
  return pools;
};

export interface TokenPriceData {
  price: number;
}

interface RawJupApiResponse {
  data: Record<
    string,
    {
      id: string;
      price: string;
    }
  >;
  timeTaken: number;
}

export const DEFAULT_TOKENS = ["bitcoin", "ethereum", "usd-coin", "aleph-zero"];

export const getEclipseTokensData = (
  network: EclipseNetwork
): Record<string, TokenData> => {
  switch (network) {
    case EclipseNetwork.MAIN:
      return eclipseMainnetTokensData;
    case EclipseNetwork.TEST:
      return eclipseTestnetTokensData;
    default:
      return {};
  }
};

export const supportedTokens = {
  LaihKXA47apnS599tyEyasY2REfEzBNe4heunANhsMx: {
    decimals: 5,
  },
  trbts2EsWyMdnCjsHUFBKLtgudmBD7Rfbz8zCg1s4EK: {
    decimals: 9,
  },
};

export function isSameDay(
  timestamp: number,
  referenceTimestamp: number
): boolean {
  const date = new Date(timestamp);
  const referenceDate = new Date(referenceTimestamp);

  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth() &&
    date.getDate() === referenceDate.getDate()
  );
}

export function isSameWeek(
  timestamp: number,
  referenceTimestamp: number
): boolean {
  const date = new Date(timestamp);
  const referenceDate = new Date(referenceTimestamp);

  const startOfWeek = new Date(date);
  const dayOffset = (date.getDay() + 6) % 7;
  startOfWeek.setDate(date.getDate() - dayOffset);
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfReferenceWeek = new Date(referenceDate);
  const refDayOffset = (referenceDate.getDay() + 6) % 7;
  startOfReferenceWeek.setDate(referenceDate.getDate() - refDayOffset);
  startOfReferenceWeek.setHours(0, 0, 0, 0);

  return startOfWeek.getTime() === startOfReferenceWeek.getTime();
}

export function isSameMonth(
  timestamp: number,
  referenceTimestamp: number
): boolean {
  const date = new Date(timestamp);
  const referenceDate = new Date(referenceTimestamp);

  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth()
  );
}

export function isSameYear(
  timestamp: number,
  referenceTimestamp: number
): boolean {
  const date = new Date(timestamp);
  const referenceDate = new Date(referenceTimestamp);
  return date.getFullYear() === referenceDate.getFullYear();
}

export function getWeekNumber(timestamp: number): number {
  const date = new Date(timestamp);

  const targetDate = new Date(date.getTime());
  const dayNr = (date.getDay() + 6) % 7;
  targetDate.setDate(targetDate.getDate() - dayNr + 3);
  const firstThursday = targetDate.valueOf();
  targetDate.setMonth(0, 1);
  if (targetDate.getDay() !== 4) {
    targetDate.setMonth(0, 1 + ((4 - targetDate.getDay() + 7) % 7));
  }
  const weekNumber =
    1 + Math.ceil((firstThursday - targetDate.valueOf()) / 604800000);

  const weekYear = new Date(firstThursday).getFullYear();

  return weekYear * 100 + weekNumber;
}

export function getMonthNumber(timestamp: number): number {
  const date = new Date(timestamp);

  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  return year * 100 + month;
}

export function getYear(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getFullYear();
}

export function calculateWeightFromTimestamps(
  timestamp: number,
  referenceTimestamp: number
): number {
  const delta = timestamp - referenceTimestamp;
  const weight = Math.ceil(delta / ONE_DAY);
  return weight;
}

export const weightedArithmeticAvg = (
  ...args: Array<{ val: number; weight: number }>
): number => {
  if (args.length === 0) {
    throw new Error("requires at least one argument");
  }

  const sumOfWeights = args.reduce((acc, { weight }) => acc + weight, 0);
  const sum = args.reduce((acc, { val, weight }) => acc + val * weight, 0);

  return Number((sum / sumOfWeights).toFixed(2));
};

export const arithmeticAvg = (...args: Array<number>): number => {
  if (args.length === 0) {
    throw new Error("requires at least one argument");
  }

  const sum = args.reduce((acc, val) => acc + val, 0);

  return Number((sum / args.length).toFixed(2));
};

export const generateEmptyTotalIntevalStats = (): TotalIntervalStats => ({
  volume: {
    value: 0,
    change: 0,
  },
  tvl: {
    value: 0,
    change: 0,
  },
  fees: {
    value: 0,
    change: 0,
  },
  volumePlot: [],
  liquidityPlot: [],
  poolsData: [],
  tokensData: [],
});

export const calculateChangeFromValues = (
  previousValue: number,
  currentValue: number,
  previousChange: number
): number => {
  const currentChange = (currentValue * previousChange) / previousValue;
  return currentChange;
};

export const mapStringToInterval = (str: string) => {
  switch (str) {
    case "daily":
      return Intervals.Daily;
    case "weekly":
      return Intervals.Weekly;
    case "monthly":
      return Intervals.Monthly;
    case "yearly":
      return Intervals.Yearly;
    default:
      throw new Error("Invalid interval");
  }
};

export const calculateAPYForInterval = (
  volume: number,
  tvl: number,
  fee: number // 0.09 stands for  0.09%
) => {
  const factor = (volume * fee) / 100 / tvl;
  const APY = (Math.pow(factor + 1, 365) - 1) * 100;
  return APY === Infinity ? 1001 : isNaN(+JSON.stringify(APY)) ? 0 : APY;
};

export const getIntervalRange = (key: Intervals): number => {
  switch (key) {
    case Intervals.Daily:
      return 1; // snapshots for 1 day
    case Intervals.Weekly:
      return 7;
    case Intervals.Monthly:
      return 30;
    case Intervals.Yearly:
      return 365;
    default:
      return 36500; // 100years
  }
};
