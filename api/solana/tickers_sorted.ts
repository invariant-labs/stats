import { VercelRequest, VercelResponse } from "@vercel/node";
import { PoolStatsData } from "../utils";
import { BN, Provider, Wallet } from "@project-serum/anchor";
import { getMarketAddress, Market, Network } from "@invariant-labs/sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { PoolStructure } from "@invariant-labs/sdk/lib/market";
import { PoolSnapshot, printBN } from "../utils";
import data from "../../data/mainnet.json";
import fullData from "../../data/full_mainnet.json";
import {
  PoolStatsDataWithString,
  TimeData,
  TokenStatsDataWithString,
} from "../../solana/src/utils";

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
    "5dX3tkVDmbHBWMCQMerAHTmd9wsRvmtKLoQt6qv9fHy7", // USDT/USDC 0.01%
    "8v7UUgCxfheNJrwoDfFyZynE9CDTgwpTBEPCRMXadPHj", // DOGIN/SOL 0.2%
    "8KuayFj5yvJz8kybcEvQn5tuJ6egywDohSPteGpu6tST", // HADES/USDC 1%
    "GMj5Pga1nQpow3f5qHL2KNfRFihx31VF8ecP2qhpgPzq", // jupSOL/SOL 0.01%
    "FPbp7mWLzqsjUDRY1ujfh5dNaSR7nzym7rV8P8GhbjcZ", // JLP/USDT 0.01%
    "7drJL7kEdJfgNzeaEYKDqTkfmiG2ain3nEPtGHDZc6i2", // INV/USDC 0.3%
    "92iP1tzdCjTMoLy6rZgEZcZTpvhcvWWa5yASC9wMSnv3", // TULIP/USDC 0.3%
    "2SgUGxYDczrB6wUzXHPJH65pNhWkEzNMEx3km4xTYUTC", // SOL/USDC 0.01%
    "Aoa3FhXZ6jgFzMHBtG2Z7ekdsCt9XCcn7hk95HA5FoB", // SOL/USDC 0.02%
    "6rvpVhL9fxm2WLMefNRaLwv6aNdivZadMi56teWfSkuU", // SOL/USDC 0.05%
    "FwiuNR91xfiUvWiBu4gieK4SFmh9qjMhYS9ebyYJ8PGj", // USDH/USDC 0.01%
    "BYTvYRsTtduFNMoPRiq7he2jEqh9BGvW8UZVjUrb8Z7R", // JitoSOL/mSOL 0.01%
    "67thJrJa8QB2ZHV3TJVpHWK5uR9oQDDfrBou7jKR81cV", // DOGIN/USDC 0.01%
    "9uzQcsaW74EQqSx9z15xBghF7B1a4xE8tMVifeZL71pH", // MUMU/USDC 1%
    "Hupfi1jGC8BDgiojUJS1wauVnUXCtd84ATnrvVnfa28p", // JLP/SOL 0.01%
  ];

  // Tokens which price should be evaluated last, the lower the value the less likely the token is to be the base_currency
  const targetTokenOrder = new Map([
    ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 0], // USDC
    ["Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", 10], // USDT
    ["USDH1SM1ojwWUga67PGrgFWUHibbjqMvuMaDkRJTgkX", 20], // USDH
    ["So11111111111111111111111111111111111111112", 30], // SOL
    ["J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", 40], // JitoSOL
    ["mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", 50], // mSol
    ["27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", 60], // JLP
    ["jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v", 70], // jupSOL
  ]);
  const connection = new Connection(
    "https://mainnet.helius-rpc.com/?api-key=ef843b40-9876-4a02-a181-a1e6d3e61b4c"
  );
  const keypair = new Keypair();
  const wallet = new Wallet(keypair);
  const provider = new Provider(connection, wallet, {});

  const network = Network.MAIN;
  const market = await Market.build(
    network,
    provider.wallet,
    provider.connection,
    new PublicKey(getMarketAddress(network))
  );

  const priceMap = new Map<string, BN>();
  (await market.program.account.pool.fetchMultiple(poolsList)).map((p, i) => {
    if (p) {
      const { sqrtPrice } = p as unknown as PoolStructure;
      // price * 10^48
      const price = sqrtPrice.v.mul(sqrtPrice.v);
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
