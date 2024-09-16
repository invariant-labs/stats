import {
  BTC_ADDRESS,
  ETH_ADDRESS,
  WAZERO_ADDRESS,
  USDC_ADDRESS,
  Network,
} from "@invariant-labs/a0-sdk";
import { PRICE_DENOMINATOR } from "@invariant-labs/a0-sdk/target/consts";
import axios, { AxiosResponse } from "axios";

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

export interface PoolData {
  tokenX: string;
  tokenY: string;
  fee: number;
  volume24: number;
  tvl: number;
  // apy: number
}

export const getTokensData = (network: Network) => {
  switch (network) {
    case Network.Mainnet:
      return {
        [USDC_ADDRESS.Mainnet]: {
          decimals: 6,
          coingeckoId: "usd-coin",
        },
        [BTC_ADDRESS.Mainnet]: {
          decimals: 8,
          coingeckoId: "bitcoin",
        },
        [ETH_ADDRESS.Mainnet]: {
          decimals: 12,
          coingeckoId: "ethereum",
        },
        [WAZERO_ADDRESS.Mainnet]: {
          decimals: 12,
          coingeckoId: "aleph-zero",
        },
      };
    case Network.Testnet:
      return {
        [USDC_ADDRESS.Testnet]: {
          decimals: 6,
          coingeckoId: "usd-coin",
        },
        [BTC_ADDRESS.Testnet]: {
          decimals: 8,
          coingeckoId: "bitcoin",
        },
        [ETH_ADDRESS.Testnet]: {
          decimals: 12,
          coingeckoId: "ethereum",
        },
        [WAZERO_ADDRESS.Testnet]: {
          decimals: 12,
          coingeckoId: "aleph-zero",
        },
      };
    default:
      return {};
  }
};

export const toStringWithDecimals = (num: bigint, decimals: number) => {
  const upper = num / BigInt(10 ** decimals);
  const lower = num - upper;

  return upper + "." + lower;
};

export const getUsdValue24 = (
  total: bigint,
  decimals: number,
  price: bigint,
  lastTotal: bigint
) => {
  return +toStringWithDecimals(
    ((total - lastTotal) * price) / PRICE_DENOMINATOR,
    decimals
  );
};

export interface CoingeckoApiPriceData {
  id: string;
  current_price: number;
}

// Use the same one from utils if it doesn't break the build due to esm/cjs differences
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

export interface TokenStatsData {
  address: string;
  price: number;
  volume24: number;
  tvl: number;
}

export interface TimeData {
  timestamp: number;
  value: number;
}

export const printBigint = (amount: bigint, decimals: bigint): string => {
  const parsedDecimals = Number(decimals);
  const amountString = amount.toString();
  const isNegative = amountString.length > 0 && amountString[0] === "-";

  const balanceString = isNegative ? amountString.slice(1) : amountString;

  if (balanceString.length <= parsedDecimals) {
    return (
      (isNegative ? "-" : "") +
      "0." +
      "0".repeat(parsedDecimals - balanceString.length) +
      balanceString
    );
  } else {
    return (
      (isNegative ? "-" : "") +
      trimZeros(
        balanceString.substring(0, balanceString.length - parsedDecimals) +
          "." +
          balanceString.substring(balanceString.length - parsedDecimals)
      )
    );
  }
};

export const trimZeros = (numStr: string): string => {
  return numStr
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/^0+(\d)|(\d)0+$/gm, "$1$2")
    .replace(/\.$/, "");
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
