/* eslint-disable @typescript-eslint/naming-convention */
import { MOCK_TOKENS, Network } from "@invariant-labs/sdk";
import { Network as StakerNetwork } from "@invariant-labs/staker-sdk";
import { Market, PoolStructure, Tick } from "@invariant-labs/sdk/lib/market";
import { Market as EclipseMarket } from "@invariant-labs/sdk-eclipse/lib/market";
import { DECIMAL, Range } from "@invariant-labs/sdk/lib/utils";
import BN from "bn.js";
import { Connection, ParsedAccountData, PublicKey } from "@solana/web3.js";
import axios, { AxiosResponse } from "axios";
// @ts-ignore
import MAINNET_TOKENS from "../../data/mainnet_tokens.json";
import { TokenInfo } from "@solana/spl-token-registry";
import { Network as EclipseNetwork } from "@invariant-labs/sdk-eclipse";
import { readFileSync, writeFileSync } from "fs";
import { AccountLayout } from "@solana/spl-token";
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
  feesPlot: TimeData[];
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
  volume: number;
  tvl: number;
  fees: number;
  apy: number;
  volumePlot: TimeData[];
  liquidityPlot: TimeData[];
  feesPlot: TimeData[];
}

export interface SnapshotValueData {
  tokenBNFromBeginning: string;
  usdValue24: number;
}
export interface DailyApyData {
  apy: number;
  totalVolumeX: number;
  totalXAmount: BN | string;
  volumeX: number;
  volumeY: number;
}

export interface PoolSnapshot {
  timestamp: number;
  volumeX: SnapshotValueData;
  volumeY: SnapshotValueData;
  liquidityX: SnapshotValueData;
  liquidityY: SnapshotValueData;
  feeX: SnapshotValueData;
  feeY: SnapshotValueData;
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

export interface CoingeckoApiPriceData {
  id: string;
  current_price: number;
}

export const getCoingeckoPricesData = async (
  ids: string[]
): Promise<CoingeckoApiPriceData[]> => {
  const requests: Array<Promise<AxiosResponse<CoingeckoApiPriceData[]>>> = [];
  for (let i = 0; i < ids.length; i += 250) {
    const idsSlice = ids.slice(i, i + 250);
    const idsList = idsSlice.reduce(
      (acc, id, index) => acc + id + (index < 249 ? "," : ""),
      ""
    );
    requests.push(
      axios.get<CoingeckoApiPriceData[]>(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${idsList}&per_page=250`
      )
    );
  }

  return await Promise.all(requests).then((responses) =>
    responses
      .map((res) => res.data)
      .reduce((acc, data) => [...acc, ...data], [])
  );
};

export interface JupApiPriceData {
  data: Record<
    string,
    {
      id: string;
      price: string;
    }
  >;
}

export const getJupPricesData = async (
  ids: string[]
): Promise<Record<string, string>> => {
  const maxTokensPerRequest = 100;

  const chunkedIds: string[][] = [];
  for (let i = 0; i < ids.length; i += maxTokensPerRequest) {
    chunkedIds.push(ids.slice(i, i + maxTokensPerRequest));
  }

  const requests = chunkedIds.map(
    async (idsChunk) =>
      await axios.get<JupApiPriceData>(
        `https://lite-api.jup.ag/price/v3?ids=${idsChunk.join(",")}`
      )
  );

  const responses = await Promise.all(requests);

  const concatRes = responses.flatMap((response) => {
    const filteredData = Object.fromEntries(
      Object.entries(response.data).filter(([_, value]) => value !== null)
    );

    return Object.entries(filteredData).map((e) => ({
      id: e[0],
      price: e[1].usdPrice,
    }));
  });

  return concatRes.reduce<Record<string, string>>((acc, { id, price }) => {
    acc[id] = price ?? "0";
    return acc;
  }, {});
};

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

export const tokensPriceViaCoingecko = [
  {
    address: "4dmKkXNHdgYsXqBHCuMikNQWwVomZURhYvkkX5c4pQ7y",
    coingeckoId: "synthetify-token",
  },
];

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

export const getTokensPrices = async (
  idsList: string[],
  addresses?: string[]
): Promise<Record<string, number>> => {
  const prices = await getCoingeckoPricesData(idsList);
  const snaps = {};

  if (addresses?.length !== 0 && addresses) {
    prices.forEach(({ id, current_price }, index) => {
      snaps[addresses[index]] = current_price ?? 0;
    });
    return snaps;
  }

  prices.forEach(({ id, current_price }) => {
    snaps[id] = current_price ?? 0;
  });

  return snaps;
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
          liquidityChange: { v: new BN(tick.liquidityChange.v, "hex") },
          liquidityGross: { v: new BN(tick.liquidityGross.v, "hex") },
          sqrtPrice: { v: new BN(tick.sqrtPrice.v, "hex") },
          feeGrowthOutsideX: { v: new BN(tick.feeGrowthOutsideX.v, "hex") },
          feeGrowthOutsideY: { v: new BN(tick.feeGrowthOutsideY.v, "hex") },
          secondsPerLiquidityOutside: {
            v: new BN(tick.secondsPerLiquidityOutside.v, "hex"),
          },
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

export const marketToStakerNetwork = (network: Network): StakerNetwork => {
  switch (network) {
    case Network.DEV:
      return StakerNetwork.DEV;
    case Network.MAIN:
      return StakerNetwork.MAIN;
    default:
      return StakerNetwork.DEV;
  }
};

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
        liquidityChange: { v: new BN(tick.liquidityChange.v, "hex") },
        liquidityGross: { v: new BN(tick.liquidityGross.v, "hex") },
        sqrtPrice: { v: new BN(tick.sqrtPrice.v, "hex") },
        feeGrowthOutsideX: { v: new BN(tick.feeGrowthOutsideX.v, "hex") },
        feeGrowthOutsideY: { v: new BN(tick.feeGrowthOutsideY.v, "hex") },
        secondsPerLiquidityOutside: {
          v: new BN(tick.secondsPerLiquidityOutside.v, "hex"),
        },
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
  range?: Range;
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

export const getJupPricesData2 = async (
  ids: string[]
): Promise<Record<string, TokenPriceData>> => {
  const maxTokensPerRequest = 100;

  const chunkedIds: string[][] = [];
  for (let i = 0; i < ids.length; i += maxTokensPerRequest) {
    chunkedIds.push(ids.slice(i, i + maxTokensPerRequest));
  }

  const requests = chunkedIds.map(
    async (idsChunk) =>
      await axios.get<RawJupApiResponse>(
        `https://lite-api.jup.ag/price/v3?ids=${idsChunk.join(",")}`
      )
  );

  const responses = await Promise.all(requests);
  const concatRes = responses.flatMap((response) =>
    Object.entries(response.data).map((e) => ({
      id: e[0],
      price: e[1].usdPrice ?? "0",
    }))
  );

  return concatRes.reduce<Record<string, TokenPriceData>>((acc, tokenData) => {
    if (tokenData?.id) {
      acc[tokenData.id] = { price: Number(tokenData.price ?? 0) };
    }
    return acc;
  }, {});
};

export type CoinGeckoAPIData = CoinGeckoAPIPriceData[];

export type CoinGeckoAPIPriceData = {
  id: string;
  current_price: number;
  price_change_percentage_24h: number;
};

export const DEFAULT_TOKENS = ["bitcoin", "ethereum", "usd-coin", "aleph-zero"];

export const getCoingeckoPricesData2 = async (): Promise<CoinGeckoAPIData> => {
  const { data } = await axios.get<CoinGeckoAPIData>(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${DEFAULT_TOKENS}`
  );

  return data;
};

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

export const getParsedTokenAccountsFromAddresses = async (
  connection: Connection,
  addresses: PublicKey[]
): Promise<Record<string, string>> => {
  const batches = addresses.length / MAX_ATAS_IN_BATCH;
  const promises: any[] = [];
  for (let i = 0; i < batches; i++) {
    const start = i * MAX_ATAS_IN_BATCH;
    const end = Math.min((i + 1) * MAX_ATAS_IN_BATCH, addresses.length);
    const batch = addresses.slice(start, end);
    promises.push(connection.getMultipleAccountsInfo(batch, "confirmed"));
  }

  const awaited = await Promise.all(promises);

  const reservesAccounts = awaited
    .flat()
    .map((res) => {
      const decoded = AccountLayout.decode(res.data);
      const amountBI = decoded.amount.readBigUInt64LE(0);
      return amountBI.toString();
    })
    .flat();

  const reserves: Record<string, string> = reservesAccounts.reduce(
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
): Record<string, string> => {
  const rawData = readFileSync(cacheFileName, "utf-8");
  return JSON.parse(rawData);
};

export const saveReservesToCache = () => {};

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
      fee: { v: new BN(pool.fee.v, "hex") },
      protocolFee: { v: new BN(pool.protocolFee.v, "hex") },
      liquidity: { v: new BN(pool.liquidity.v, "hex") },
      sqrtPrice: { v: new BN(pool.sqrtPrice.v, "hex") },
      tickmap: new PublicKey(pool.tickmap),
      feeGrowthGlobalX: { v: new BN(pool.feeGrowthGlobalX.v, "hex") },
      feeGrowthGlobalY: { v: new BN(pool.feeGrowthGlobalY.v, "hex") },
      feeProtocolTokenX: new BN(pool.feeProtocolTokenX, "hex"),
      feeProtocolTokenY: new BN(pool.feeProtocolTokenY, "hex"),
      secondsPerLiquidityGlobal: {
        v: new BN(pool.secondsPerLiquidityGlobal.v, "hex"),
      },
      startTimestamp: new BN(pool.startTimestamp, "hex"),
      lastTimestamp: new BN(pool.lastTimestamp, "hex"),
      feeReceiver: new PublicKey(pool.feeReceiver),
      oracleAddress: new PublicKey(pool.oracleAddress),
    };
  });
  return pools;
};

export const savePoolsToCache = (
  pools: PoolStructure[],
  cacheFileName: string
) => {
  const stringifiedPools = pools.map((pool) => {
    return {
      ...pool,
      tokenX: pool.tokenX.toString(),
      tokenY: pool.tokenY.toString(),
      tokenXReserve: pool.tokenXReserve.toString(),
      tokenYReserve: pool.tokenYReserve.toString(),
      tickmap: pool.tickmap.toString(),
      feeReceiver: pool.feeReceiver.toString(),
      oracleAddress: pool.oracleAddress.toString(),
    };
  });
  const jsonData = JSON.stringify(stringifiedPools, null, 2);
  writeFileSync(cacheFileName, jsonData);
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
  feesPlot: [],
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

export const getEmptyIntervalsData = (): PoolIntervalPlots => {
  return {
    daily: getEmptyIntervalData(),
    weekly: getEmptyIntervalData(),
    monthly: getEmptyIntervalData(),
    yearly: getEmptyIntervalData(),
    all: getEmptyIntervalData(),
  };
};

const getEmptyIntervalData = (): IntervalPlot => {
  return {
    volumePlot: [],
    liquidityPlot: [],
    feesPlot: [],
    volume: 0,
    fees: 0,
    tvl: 0,
    apy: 0,
  };
};

export const getTokensPriceFeed = async (
  addresses: string[]
): Promise<Record<string, string>> => {
  const jupPrices = await getJupPricesData(addresses);
  const coingeckoIds = tokensPriceViaCoingecko.map(
    (token) => token.coingeckoId
  );
  const coingeckoAddresses = tokensPriceViaCoingecko.map(
    (token) => token.address
  );
  const coingeckoPrices = await getTokensPrices(
    coingeckoIds,
    coingeckoAddresses
  );

  Object.entries(coingeckoPrices).forEach(([address, price]) => {
    jupPrices[address] = price.toString();
  });
  return jupPrices;
};
