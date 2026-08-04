import { VercelRequest, VercelResponse } from "@vercel/node";

import ECLIPSE_MAINNET_DATA from "../../data/eclipse/mainnet_intervals.json";
import path from "path";
import fs from "fs";
import { calculateAPYForInterval } from "../../eclipse/src/utils";
import { printBN } from "../utils";

const pools = [
  { address: "HRgVv1pyBLXdsAddq4ubSqo8xdQWRrYbvmXqEDtectce", fee: 900000000 },
  { address: "FvVsbwsbGVo6PVfimkkPhpcRfBrRitiV946nMNNuz7f9", fee: 100000000 },
  { address: "E2B7KUFwjxrsy9cC17hmadPsxWHD1NufZXTyrtuz8YxC", fee: 900000000 },
  { address: "86vPh8ctgeQnnn8qPADy5BkzrqoH5XjMCWvkd4tYhhmM", fee: 900000000 },
  { address: "HHHGD7BZ7H5fPLh3DNEPFezpLoYBJ16WsmbwRJXXEFSg", fee: 100000000 },
  { address: "HG7iQMk29cgs74ZhSwrnye3C6SLQwKnfsbXqJVRi1x8H", fee: 10000000000 },
  { address: "1Zxv7bYYzMuK8eey85ZSowa24S8B7QNfDx3GQpKQ4Bf", fee: 100000000 },
  { address: "DA75rd2KfPyYJY286qgwtYMfwfjTY6T53sM5Hto9FWfi", fee: 100000000 },
  { address: "DXSJENyZAsrSTESpKGtC2YsEsBEauns47Qt46tN8p9NF", fee: 200000000 },
  { address: "6ip62Wj6FYpe1rJm7Wo3ebPCDivWi5hjqRBYGnn8Ee7Q", fee: 500000000 },
  { address: "1Zxv7bYYzMuK8eey85ZSowa24S8B7QNfDx3GQpKQ4Bf", fee: 900000000 },
  { address: "5N5j6yMzazQVPa9fycC2rjqHaj8f1mZJbLVS6A7CJ1iF", fee: 10000000 }, // ETH/USDC 0.1
  { address: "2YMcH9VEBXKzA4c2DHua487ZpGaZarYeRjgNBXPxHSRj", fee: 30000000 }, // ETH/USDC 0.3
  { address: "GuXMNMmmrP1MgYMCm4RcKV7R1jef5LZBjJSxX7c3YH7R", fee: 10000000000 }, // ETH/USDC 1
  { address: "G8Skt6kgqVL9ocYn4aYVGs3gUg8EfQrTJAkA2qt3gcs8", fee: 100000000 }, // ETH/USDC 0.01
  { address: "FdEcxaJ9cDW5Y3AZ79eDtzdvK7uaxSEfn5vPb47ew5yg", fee: 200000000 }, // ETH/USDC 0.02
  { address: "3f8r3ioxkAZViSp5PcA319K9HB2ZF7aSK2CeaL6w1Lho", fee: 500000000 }, // ETH/USDC 0.05
  { address: "HRgVv1pyBLXdsAddq4ubSqo8xdQWRrYbvmXqEDtectce", fee: 900000000 }, // ETH/USDC 0.09
  { address: "8wTVWkMitZZBAgH8fAxwUc9qxVdCxZdMpw554xUKksym", fee: 10000000 }, // ETH/USDC 0.1
  { address: "JC2Uyumt8zpwAkwHawwSds8cCTL8M2ESceg4DpPApznb", fee: 30000000 }, // ETH/USDC 0.3
  { address: "5WFyCtryxTK3v7LMS1169m1Vz1xUauxJYHfRyMh8uhoH", fee: 10000000000 }, // ETH/USDC 1
  { address: "6AL6jcaDUfeg3NrybF2PpmFjyKc8XPqcu8MDXAjoyjjM", fee: 100000000 }, // ETH/USDC 0.011
  { address: "FSBb5Atma2HpUhembdBT1edYw1kmVPHVqvtR1Q11jBGL", fee: 200000000 }, // ETH/USDC 0.02
  { address: "7owDutq5guBRS94XCbVy1Q1tW6nXNhHeeQPeDTQ1xTYb", fee: 500000000 }, // ETH/USDC 0.05
  { address: "86vPh8ctgeQnnn8qPADy5BkzrqoH5XjMCWvkd4tYhhmM", fee: 900000000 }, // ETH/USDC 0.09
  { address: "5nVk1wDt6TnLXiPvTDmfKzLoRbBJKuHm4pSneTPPWWS2", fee: 10000000 }, // ETH/USDC 0.1
  { address: "DSPSc9ManiurhdDBJA3XgZvc1MDibeocrKBB4MukDouE", fee: 30000000 }, // ETH/USDC 0.3
  { address: "4x7P9KXWm9QdueFFvoVY5Sd8B4YKsGUBB7xQ3iDQQQoa", fee: 10000000000 }, // ETH/USDC 1
];

export default function (req: VercelRequest, res: VercelResponse) {
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

  const { timestamp } = req.query;
  const data = ECLIPSE_MAINNET_DATA;

  const predicate = (item: any) => item.timestamp <= +timestamp;
  const volumePlot = data.daily.volumePlot.filter(predicate);
  const liquidityPlot = data.daily.liquidityPlot.filter(predicate);
  const feesPlot = data.daily.feesPlot.filter(predicate);

  const cumulativeVolume = volumePlot.reduce(
    (acc, item) => acc + item.value,
    0
  );
  const cumulativeFees = feesPlot.reduce((acc, item) => acc + item.value, 0);

  const get24hValue = (plot: any[]) => {
    const now = plot[0].value;
    const prev = plot[1].value;
    const change = ((now - prev) / prev) * 100;
    return { value: now, change };
  };
  const volume24 = get24hValue(volumePlot);
  const tvl24 = get24hValue(liquidityPlot);
  const fees24 = get24hValue(feesPlot);

  const poolParams = (address: string, fee: number) => {
    const filePath = path.join(
      process.cwd(),
      "data",
      "eclipse",
      "intervals",
      "mainnet",
      `${address}.json`
    );

    const poolData = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
      : null;
    if (!poolData) {
      throw new Error(`Data not found for address: ${address}`);
    }

    const volumePlot = poolData.daily.volumePlot.filter(predicate);
    const liquidityPlot = poolData.daily.liquidityPlot.filter(predicate);
    const feesPlot = poolData.daily.feesPlot.filter(predicate);
    const volume = volumePlot[0]?.value || 0;
    const tvl = liquidityPlot[0]?.value || 0;
    const apy = calculateAPYForInterval(volume, tvl, +printBN(fee, 10));

    return {
      address,
      volume,
      tvl,
      apy,
    };
  };

  const updatedPools = pools.map((pool) => poolParams(pool.address, pool.fee));

  const poolsData = data.daily.poolsData.map((pool: any) => {
    const updated = updatedPools.find((p) => p.address === pool.poolAddress);
    return updated ? { ...pool, ...updated } : pool;
  });

  const response = {
    timestamp: volumePlot[0]?.timestamp || 0,
    volume24,
    tvl24,
    fees24,
    volume: volume24,
    tvl: tvl24,
    fees: fees24,
    cumulativeVolume: { value: cumulativeVolume, change: null },
    cumulativeFees: { value: cumulativeFees, change: null },
    volumePlot: volumePlot.slice(0, 30),
    liquidityPlot: liquidityPlot.slice(0, 30),
    feesPlot: feesPlot.slice(0, 30),
    poolsData,
    tokensData: data.daily.tokensData,
  };

  res.json(response);
}
