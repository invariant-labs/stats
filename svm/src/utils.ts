/* eslint-disable @typescript-eslint/naming-convention */
import { MOCK_TOKENS, Network } from "@invariant-labs/sdk";
import { Network as StakerNetwork } from "@invariant-labs/staker-sdk";
import { Tick } from "@invariant-labs/sdk/lib/market";
import { DECIMAL, Range } from "@invariant-labs/sdk/lib/utils";
import { BN } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import axios, { AxiosResponse } from "axios";
import MAINNET_TOKENS from "../../data/mainnet_tokens.json";
import { TokenInfo } from "@solana/spl-token-registry";

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
      price: number;
    }
  >;
}

export const getJupPricesData = async (
  ids: string[]
): Promise<Record<string, number>> => {
  const maxTokensPerRequest = 100;

  const chunkedIds: string[][] = [];
  for (let i = 0; i < ids.length; i += maxTokensPerRequest) {
    chunkedIds.push(ids.slice(i, i + maxTokensPerRequest));
  }

  const requests = chunkedIds.map(
    async (idsChunk) =>
      await axios.get<JupApiPriceData>(
        `https://price.jup.ag/v4/price?ids=${idsChunk.join(",")}`
      )
  );

  const responses = await Promise.all(requests);
  const concatRes = responses.flatMap((response) =>
    Object.values(response.data.data).map(({ id, price }) => ({ id, price }))
  );

  return concatRes.reduce<Record<string, number>>((acc, { id, price }) => {
    acc[id] = price ?? 0;
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

export const getTokensPrices = async (
  idsList: string[]
): Promise<Record<string, number>> => {
  const prices = await getCoingeckoPricesData(idsList);

  const snaps = {};

  prices.forEach(({ id, current_price }) => {
    snaps[id] = current_price ?? 0;
  });

  return snaps;
};

export const getUsdValue24 = (
  total: BN,
  decimals: number,
  price: number,
  lastTotal: BN
) => {
  const bnPrice = printBNtoBN(price.toFixed(DECIMAL), DECIMAL);

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
  "5W3bmyYDww6p5XRZnCR6m2c75st6XyCxW1TgGS3wTq7S": {
    decimals: 9,
    coingeckoId: "usd-coin",
    ticker: "USDC",
  },
  "3JXmQAzBPU66dkVQufSE1ChBMRAdCHp6T7ZMBKAwhmWw": {
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

export interface PoolApyArchiveSnapshot {
  timestamp: number;
  apy: number;
  range: Range;
  tokenXAmount?: string;
  volumeX?: number;
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
