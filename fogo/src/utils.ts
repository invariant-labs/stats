import { Network } from "@invariant-labs/sdk-fogo";
import {
  Market,
  PoolStructure,
  Tick,
} from "@invariant-labs/sdk-fogo/lib/market";
import { Market as FogoMarket } from "@invariant-labs/sdk-fogo/lib/market";
import { DECIMAL, Range } from "@invariant-labs/sdk-fogo/lib/utils";
import BN from "bn.js";
import { Connection, ParsedAccountData, PublicKey } from "@solana/web3.js";
import axios from "axios";
import MAINNET_TOKENS from "../../data/mainnet_tokens.json";
import { TokenInfo } from "@solana/spl-token-registry";
import { Network as FogoNetwork } from "@invariant-labs/sdk-fogo";
import { readFileSync } from "fs";

export const MAX_ATAS_IN_BATCH = 100;

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
    [Network.TEST]: "fogo-testnet",
    [Network.MAIN]: "fogo-mainnet",
  };
  const { data } = await axios.get<IPriceData>(
    `https://api.invariant.app/price/${
      supportedNetworks[network] ?? "fogo-testnet"
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

export const fogoTestnetTokensData = {
  HNQRxWh8Q36BAv4YV9cZUUSebwerZuQK5TLxwefS4KLy: {
    decimals: 6,
    coingeckoId: "usd-coin",
    ticker: "USDC",
    solAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  D5iUETZ2ugRwPNaa3hr6R5mzAYE5KesqJwZaWLQ8QYCt: {
    decimals: 9,
    coingeckoId: "bitcoin",
    ticker: "BTC",
    solAddress: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
  },
  FvLECEfW93DscEAdbtLF6KPTmwougdkvQnygKjm8EbDH: {
    decimals: 9,
    coingeckoId: "etherum",
    ticker: "ETH",
    solAddress: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  },
  "9Lxd3admpK1tfnJmQqkxzbZbkGo2f6EQNqKtMX5VXJeY": {
    decimals: 9,
    coingeckoId: "solana",
    ticker: "SOL",
    solAddress: "So11111111111111111111111111111111111111112",
  },
  So11111111111111111111111111111111111111112: {
    decimals: 9,
    coingeckoId: "",
    ticker: "FOGO",
    solAddress: "So11111111111111111111111111111111111111112",
  },
};

export const fogoMainnetTokensData = {
  So11111111111111111111111111111111111111112: {
    decimals: 9,
    coingeckoId: "solana",
    ticker: "SOL",
    solAddress: "So11111111111111111111111111111111111111112",
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
  marketProgram: Market | FogoMarket
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

export const DEFAULT_TOKENS = ["bitcoin", "ethereum", "usd-coin"];

export const getFogoTokensData = (
  network: FogoNetwork
): Record<string, TokenData> => {
  switch (network) {
    case FogoNetwork.MAIN:
      return fogoMainnetTokensData;
    case FogoNetwork.TEST:
      return fogoTestnetTokensData;
    default:
      return {};
  }
};

export const supportedTokens = {};
