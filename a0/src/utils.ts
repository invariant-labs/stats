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
          decimals: 18,
          coingeckoId: "ethereum",
        },
        [WAZERO_ADDRESS.Mainnet]: {
          decimals: 8,
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
          decimals: 18,
          coingeckoId: "ethereum",
        },
        [WAZERO_ADDRESS.Testnet]: {
          decimals: 8,
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
