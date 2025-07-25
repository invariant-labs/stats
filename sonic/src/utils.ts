/* eslint-disable @typescript-eslint/naming-convention */
import {
  Market,
  PoolStructure,
  Tick,
} from "@invariant-labs/sdk-sonic/lib/market";
import { Market as sonicMarket } from "@invariant-labs/sdk-sonic/lib/market";
import { DECIMAL, Range } from "@invariant-labs/sdk-sonic/lib/utils";
import { BN } from "@coral-xyz/anchor";
import { Connection, ParsedAccountData, PublicKey } from "@solana/web3.js";
import axios, { AxiosResponse } from "axios";
import { TokenInfo } from "@solana/spl-token-registry";
import { Network, Network as sonicNetwork } from "@invariant-labs/sdk-sonic";
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

export interface IPriceData {
  data: Record<string, { price: number }>;
  lastUpdateTimestamp: number;
}

export const getTokensPrices = async (
  network: Network
): Promise<Record<string, { price: number }>> => {
  const supportedNetworks = {
    [Network.TEST]: "sonic-testnet",
    [Network.MAIN]: "sonic-mainnet",
  };
  const { data } = await axios.get<IPriceData>(
    `https://api.invariant.app/price/${
      supportedNetworks[network] ?? "sonic-testnet"
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

export const sonicTestnetTokensData = {
  "6B8zhSGkjZcQxHCE9RFwYMxT8ipifJ4JZLFTskLMcMeL": {
    decimals: 9,
    coingeckoId: "usd-coin",
    ticker: "USDC",
    solAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  "87ZPWWeTNS8iCMakTPwbEpkn7zAfVzxRNUmZCgBdjj4H": {
    decimals: 9,
    coingeckoId: "bitcoin",
    ticker: "BTC",
    solAddress: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  },
  "62rMuAVWh2mQYE9wP4cPhaLDsbn8SzQNbHyJqUM6oQCB": {
    decimals: 9,
    coingeckoId: "ethereum",
    ticker: "WETH",
    solAddress: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  },
  So11111111111111111111111111111111111111112: {
    decimals: 9,
    coingeckoId: "solana",
    ticker: "SOL",
    solAddress: "So11111111111111111111111111111111111111112",
  },
};

export const sonicMainnetTokensData = {
  HbDgpvHVxeNSRCGEUFvapCYmtYfqxexWcCbxtYecruy8: {
    decimals: 6,
    coingeckoId: "usd-coin",
    ticker: "USDC",
    solAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  So11111111111111111111111111111111111111112: {
    decimals: 9,
    coingeckoId: "solana",
    ticker: "SOL",
    solAddress: "So11111111111111111111111111111111111111112",
  },
  qPzdrTCvxK3bxoh2YoTZtDcGVgRUwm37aQcC3abFgBy: {
    decimals: 6,
    coingeckoId: "tether",
    ticker: "USDT",
    solAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  },
  mrujEYaN1oyQXDHeYNxBYpxWKVkQ2XsGxfznpifu4aL: {
    decimals: 9,
    coingeckoId: "sonic",
    ticker: "SONIC",
    solAddress: "SonicxvLud67EceaEzCLRnMTBqzYUUYNr93DBkBdDES",
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

export interface ApySnapshot {
  apy: number;
  weeklyFactor: number[];
  weeklyRange: Range[];
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
  marketProgram: Market | sonicMarket
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

export const getsonicTokensData = (
  network: sonicNetwork
): Record<string, TokenData> => {
  switch (network) {
    case sonicNetwork.MAIN:
      return sonicMainnetTokensData;
    case sonicNetwork.TEST:
      return sonicTestnetTokensData;
    default:
      return {};
  }
};

export const supportedTokens = {};

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
