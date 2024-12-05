import { VercelRequest, VercelResponse } from "@vercel/node";
import { PoolStatsData } from "../utils";
import { BN } from "anchor-eclipse";
import { Market, Network } from "@invariant-labs/sdk-eclipse";
import { Connection, Keypair } from "web3-eclipse";
import {
  parsePool,
  PoolStructure,
} from "@invariant-labs/sdk-eclipse/lib/market";
import { PoolSnapshot, printBN } from "../utils";
import data from "../../data/eclipse/mainnet.json";
import fullData from "../../data/eclipse/full_mainnet.json";
import {
  PoolStatsDataWithString,
  TimeData,
  TokenStatsDataWithString,
} from "../../svm/src/utils";

type NewType = TimeData;

interface FullSnap {
  volume24: {
    value: number;
    change: number;
  };
  tvl24: {
    value: number;
    change: number;
  };
  fees24: {
    value: number;
    change: number;
  };
  tokensData: TokenStatsDataWithString[];
  poolsData: PoolStatsDataWithString[];
  volumePlot: TimeData[];
  liquidityPlot: NewType[];
}

interface Ticker {
  ticker_id: string;
  base_currency: string;
  target_currency: string;
  pool_id: string;
  last_price: string;
  base_volume: string;
  target_volume: string;
  liquidity_in_usd: string;
}
function toFixed(x) {
  if (Math.abs(x) < 1.0) {
    var e = parseInt(x.toString().split("e-")[1]);
    if (e) {
      x *= Math.pow(10, e - 1);
      x = "0." + new Array(e).join("0") + x.toString().substring(2);
    }
  } else {
    var e = parseInt(x.toString().split("+")[1]);
    if (e > 20) {
      e -= 20;
      x /= Math.pow(10, e);
      x += new Array(e + 1).join("0");
    }
  }
  return x;
}

const formatNumber = (num: number): string => {
  return toFixed(num).toString();
};
export default async function (req: VercelRequest, res: VercelResponse) {
  // @ts-expect-error
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  // res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  const tickers: Ticker[] = [];

  const poolsList = [
    "G8Skt6kgqVL9ocYn4aYVGs3gUg8EfQrTJAkA2qt3gcs8", // USDC/ETH 0.01%
    "DSPSc9ManiurhdDBJA3XgZvc1MDibeocrKBB4MukDouE", // SOL/ETH 0.3%
    "6AL6jcaDUfeg3NrybF2PpmFjyKc8XPqcu8MDXAjoyjjM", // SOL/ETH 0.01%
    "5WFyCtryxTK3v7LMS1169m1Vz1xUauxJYHfRyMh8uhoH", // USDC/ETH 1%
    "FvVsbwsbGVo6PVfimkkPhpcRfBrRitiV946nMNNuz7f9", // tETH/ETH 0.01%
    "DA75rd2KfPyYJY286qgwtYMfwfjTY6T53sM5Hto9FWfi", // USDC/SOL 0.01%
    "92ca6jVdjE6STduV4tAg7ijuy436jimacWMyjM9Yzmcj", // LAIKA/ETH 1%
    "4x7P9KXWm9QdueFFvoVY5Sd8B4YKsGUBB7xQ3iDQQQoa", // SOL/ETH 1%
  ];

  // Tokens which price should be evaluated last, the lower the value the less likely the token is to be the base_currency
  const targetTokenOrder = new Map([
    ["AKEWE7Bgh87GPp171b4cJPSSZfmZwQ3KaqYqXoKLNAEE", 0], // USDC
    ["BeRUj3h7BqkbdfFU7FBNYbodgf8GCHodzKvF9aVjNNfL", 10], // SOL
    ["So11111111111111111111111111111111111111112", 20], // ETH
    ["GU7NS9xCwgNPiAdJ69iusFrRfawjDDPjeMBovhV1d4kn", 30], // tETH
  ]);
  const connection = new Connection("https://eclipse.helius-rpc.com");
  const keypair = new Keypair();

  const network = Network.MAIN;
  const market = await Market.buildWithoutProvider(network, connection);

  const priceMap = new Map<string, BN>();
  (await market.program.account.pool.fetchMultiple(poolsList)).map((p, i) => {
    if (p) {
      const { sqrtPrice } = parsePool(p);
      // price * 10^48
      const price = sqrtPrice.mul(sqrtPrice);
      priceMap.set(poolsList[i], price);
    }
  });

  const typedData = data as Record<string, PoolStatsData>;

  const decimals = new Map<string, number>();

  poolsList.forEach((p) => {
    const poolRecord = typedData[p];
    if (poolRecord) {
      if (poolRecord.tokenX.decimals != 0) {
        decimals.set(poolRecord.tokenX.address, poolRecord.tokenX.decimals);
      }
      if (poolRecord.tokenY.decimals != 0) {
        decimals.set(poolRecord.tokenY.address, poolRecord.tokenY.decimals);
      }
    }
  });
  // for some reason they're set to 0 in the last snap
  decimals.set("jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v", 9);
  decimals.set("5LafQUrVco6o7KMz42eqVEJ9LW31StPyGjeeu5sKoMtA", 6);

  const typedFullData = fullData as FullSnap;

  const usdPrices = new Map<string, number>();

  typedFullData.tokensData.forEach((tokenRecord) => {
    if (decimals.get(tokenRecord.address) !== undefined) {
      if (tokenRecord.price) {
        usdPrices.set(tokenRecord.address, tokenRecord.price);
      } else {
        console.error(tokenRecord);
      }
    }
  });

  for (const {
    poolAddress: pool_id,
    tvl,
    volume24,
    tokenX,
    tokenY,
  } of typedFullData.poolsData) {
    if (poolsList.includes(pool_id)) {
      try {
        typedFullData.tokensData.find((t) => t.price);
        const liquidity_in_usd = tvl;

        const price = priceMap.get(pool_id);

        if (!price) {
          console.error("Failed to fetch pool", pool_id);
          continue;
        }

        const tokenXDecimals = decimals.get(tokenX);
        const tokenYDecimals = decimals.get(tokenY);
        if (!tokenXDecimals) {
          console.error("Failed to read tokenX decimals", tokenX);
          continue;
        }
        if (!tokenYDecimals) {
          console.error("Failed to read tokenY decimals", tokenY);
          continue;
        }
        let xVolume = 0;
        let yVolume = 0;

        const PRICE_PRECISION = 24;
        const priceWithDecimals = price
          .mul(new BN(10).pow(new BN(tokenXDecimals)))
          .div(new BN(10).pow(new BN(tokenYDecimals)))
          .div(new BN(10).pow(new BN(48 - PRICE_PRECISION))); // limit

        let tokenXUsdPrice = usdPrices.get(tokenX);
        let tokenYUsdPrice = usdPrices.get(tokenY);

        if (!tokenXUsdPrice && !tokenYUsdPrice) {
          console.error(
            "Failed to read tokenX && tokenY usdPrice",
            tokenX,
            tokenY
          );
          continue;
        }

        if (!volume24) {
          xVolume = 0;
          yVolume = 0;
        } else if (!tokenXUsdPrice || !tokenYUsdPrice) {
          let last: undefined | PoolSnapshot;
          let prev: undefined | PoolSnapshot;

          for (const snap of typedData[pool_id].snapshots) {
            if (!last || last.timestamp < snap.timestamp) {
              last = snap;
              prev = last;
            }
          }

          if (!last || !prev) {
            continue;
          }
          let adjustedVolumeUsd = volume24;
          const volumeAdjustment = Math.floor(
            Math.log10(10 ** 12 / adjustedVolumeUsd)
          );

          adjustedVolumeUsd = Math.ceil(
            adjustedVolumeUsd * 10 ** volumeAdjustment
          );

          if (tokenYUsdPrice) {
            let adjustedPrice = tokenYUsdPrice;
            const priceAdjustment = Math.floor(
              Math.log10(10 ** 12 / adjustedPrice)
            );
            adjustedPrice = Math.ceil(adjustedPrice * 10 ** priceAdjustment);

            if (adjustedPrice === 0) {
              continue;
            }

            xVolume = Number(
              printBN(
                new BN(adjustedVolumeUsd)
                  .mul(new BN(10).pow(new BN(priceAdjustment)))
                  .mul(new BN(10).pow(new BN(PRICE_PRECISION)))
                  .div(new BN(adjustedPrice))
                  .div(priceWithDecimals),
                volumeAdjustment
              )
            );

            yVolume = volume24 / tokenYUsdPrice;
          } else if (tokenXUsdPrice) {
            let adjustedPrice = tokenXUsdPrice;
            const priceAdjustment = Math.floor(
              Math.log10(10 ** 12 / adjustedPrice)
            );
            adjustedPrice = Math.ceil(adjustedPrice * 10 ** priceAdjustment);

            if (adjustedPrice === 0) {
              continue;
            }

            yVolume = Number(
              printBN(
                new BN(adjustedVolumeUsd)
                  .mul(new BN(10).pow(new BN(priceAdjustment)))
                  .mul(priceWithDecimals)
                  .div(new BN(adjustedPrice)),
                volumeAdjustment + PRICE_PRECISION
              )
            );

            xVolume = volume24 / tokenXUsdPrice;
          }
        } else {
          xVolume = volume24 / (tokenXUsdPrice ?? 1);
          yVolume = volume24 / tokenYUsdPrice;
        }
        const tokenXPosition = targetTokenOrder.get(tokenX);
        const tokenYPosition = targetTokenOrder.get(tokenY);
        let flipPrice: boolean;
        if (tokenXPosition !== undefined && tokenYPosition !== undefined) {
          if (tokenXPosition < tokenYPosition) {
            flipPrice = true;
          } else {
            flipPrice = false;
          }
        } else if (tokenXPosition !== undefined) {
          flipPrice = true;
        } else {
          flipPrice = false;
        }

        if (!flipPrice) {
          const ticker: Ticker = {
            base_volume: formatNumber(xVolume),
            target_volume: formatNumber(yVolume),
            liquidity_in_usd: formatNumber(liquidity_in_usd),
            ticker_id: [tokenX, tokenY].join("_"),
            last_price: printBN(priceWithDecimals, PRICE_PRECISION),
            pool_id,
            base_currency: tokenX,
            target_currency: tokenY,
          };
          tickers.push(ticker);
        } else {
          const flippedPrice = new BN(10)
            .pow(new BN(PRICE_PRECISION * 2))
            .div(priceWithDecimals);

          const ticker: Ticker = {
            base_volume: formatNumber(yVolume),
            target_volume: formatNumber(xVolume),
            liquidity_in_usd: formatNumber(liquidity_in_usd),
            ticker_id: [tokenY, tokenX].join("_"),
            last_price: printBN(flippedPrice, PRICE_PRECISION),
            pool_id,
            base_currency: tokenY,
            target_currency: tokenX,
          };
          tickers.push(ticker);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  res.json(tickers);
}
