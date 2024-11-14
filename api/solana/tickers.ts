import { VercelRequest, VercelResponse } from "@vercel/node";
import {
  PoolStatsData,
  printBN,
} from "../../svm/src/utils";
import fs from "fs";
import { BN, Provider } from "@project-serum/anchor";
import { getMarketAddress, Market, Network } from "@invariant-labs/sdk";
import { PublicKey } from "@solana/web3.js";
import { PoolStructure } from "@invariant-labs/sdk/lib/market";
import { PoolSnapshot } from "../utils";

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

  let tickers: Ticker[] = [];

  let dataFileName = "./data/mainnet.json";
  const data: Record<string, PoolStatsData> = JSON.parse(
    fs.readFileSync(dataFileName, "utf-8")
  );

  const poolsList = [
    "5dX3tkVDmbHBWMCQMerAHTmd9wsRvmtKLoQt6qv9fHy7", // USDT/USDC 0.01%
    "8v7UUgCxfheNJrwoDfFyZynE9CDTgwpTBEPCRMXadPHj", // DOGIN/SOL 0.2%
    "8KuayFj5yvJz8kybcEvQn5tuJ6egywDohSPteGpu6tST", // HADES/USDC 1%
    "GMj5Pga1nQpow3f5qHL2KNfRFihx31VF8ecP2qhpgPzq", // jupSOL/SOL 0.01%
    "FPbp7mWLzqsjUDRY1ujfh5dNaSR7nzym7rV8P8GhbjcZ", // JLP/USDT 0.01%
    "7drJL7kEdJfgNzeaEYKDqTkfmiG2ain3nEPtGHDZc6i2", // INV/USDC 0.3%
    "92iP1tzdCjTMoLy6rZgEZcZTpvhcvWWa5yASC9wMSnv3", // TULIP/USDC 0.3%
    "2SgUGxYDczrB6wUzXHPJH65pNhWkEzNMEx3km4xTYUTC", // SOL/USDC 0.01%
    "Aoa3FhXZ6jgFzMHBtG2Z7ekdsCt9XCcn7hk95HA5FoB",  // SOL/USDC 0.02%
    "6rvpVhL9fxm2WLMefNRaLwv6aNdivZadMi56teWfSkuU", // SOL/USDC 0.05%
    "FwiuNR91xfiUvWiBu4gieK4SFmh9qjMhYS9ebyYJ8PGj", // USDH/USDC 0.01%
    "BYTvYRsTtduFNMoPRiq7he2jEqh9BGvW8UZVjUrb8Z7R", // JitoSOL/mSOL 0.01%
    "67thJrJa8QB2ZHV3TJVpHWK5uR9oQDDfrBou7jKR81cV", // DOGIN/USDC 0.01%
    "9uzQcsaW74EQqSx9z15xBghF7B1a4xE8tMVifeZL71pH", // MUMU/USDC 1%
  ];

  const provider = Provider.local("https://mainnet.helius-rpc.com/?api-key=6f17ef70-139f-463a-bfaa-85a120eee8d3");

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

  for (const [pool_id, pool] of Object.entries(data)) {
    let lastSnap: PoolSnapshot | undefined;
    let prevSnap: PoolSnapshot | undefined;
    let lastTimestamp = 0;

    for (const snap of pool.snapshots) {
      if (snap.timestamp > lastTimestamp) {
        prevSnap = lastSnap;
        lastSnap = snap;
      }
    }

    if (!lastSnap) {
      continue;
    }

    if (poolsList.includes(pool_id)) {
      const liquidity_in_usd = (
        lastSnap.liquidityX.usdValue24 + lastSnap.liquidityY.usdValue24
      ).toString();

      const price = priceMap.get(pool_id);

      if (!price) {
        console.error("Failed to fetch pool", pool_id);
        continue;
      }
      const PRICE_PRECISION = 24 
      const priceWithDecimals = price
        .mul(new BN(10).pow(new BN(pool.tokenX.decimals)))
        .div(new BN(10).pow(new BN(pool.tokenY.decimals)))
        .div(new BN(10).pow(new BN(48 - PRICE_PRECISION))); // limit
      const xVolume = new BN(lastSnap.volumeX.tokenBNFromBeginning).sub(
        new BN(prevSnap?.volumeX.tokenBNFromBeginning ?? "0")
      );
      const yVolume = new BN(lastSnap.volumeY.tokenBNFromBeginning).sub(
        new BN(prevSnap?.volumeY.tokenBNFromBeginning ?? "0")
      );

      const ticker: Ticker = {
        base_volume: printBN(xVolume, pool.tokenX.decimals),
        target_volume: printBN(yVolume, pool.tokenY.decimals),
        liquidity_in_usd,
        ticker_id: [pool.tokenX.address, pool.tokenY.address].join("_"),
        last_price: printBN(priceWithDecimals, PRICE_PRECISION),
        pool_id,
        base_currency: pool.tokenX.address,
        target_currency: pool.tokenY.address,
      };

      tickers.push(ticker);
    }
  }

  res.json(tickers);
}
