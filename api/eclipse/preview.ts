import { VercelRequest, VercelResponse } from "@vercel/node";

import ECLIPSE_MAINNET_DATA from "../../data/eclipse/mainnet_intervals.json";
import path from "path";
import fs from "fs";
import { calculateAPYForInterval } from "../../eclipse/src/utils";

const pools = [
  { address: "HRgVv1pyBLXdsAddq4ubSqo8xdQWRrYbvmXqEDtectce", fee: 900000000 },
  { address: "FvVsbwsbGVo6PVfimkkPhpcRfBrRitiV946nMNNuz7f9", fee: 100000000 },
  { address: "E2B7KUFwjxrsy9cC17hmadPsxWHD1NufZXTyrtuz8YxC", fee: 900000000 },
  { address: "86vPh8ctgeQnnn8qPADy5BkzrqoH5XjMCWvkd4tYhhmM", fee: 900000000 },
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

  const poolsData = data.daily.poolsData;
  const poolParams = (address: string, fee: number) => {
    const filePath = path.join(
      process.cwd(),
      "data",
      "eclipse",
      "intervals",
      "mainnet",
      `${address}.json`
    );

    const data = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
      : null;
    if (!data) {
      throw new Error(`Data not found for address: ${address}`);
    }

    const volumePlot = data.daily.volumePlot.filter(predicate);
    const liquidityPlot = data.daily.liquidityPlot.filter(predicate);
    const feesPlot = data.daily.feesPlot.filter(predicate);
    const volume = volumePlot[0]?.value || 0;
    const tvl = liquidityPlot[0]?.value || 0;
    // const fees = feesPlot[0]?.value || 0;
    const apy = calculateAPYForInterval(volume, tvl, fee);
    const index = poolsData.findIndex((item: any) => item.address === address);
    poolsData[index] = {
      ...poolsData[index],
      volume,
      tvl,
      apy,
    };
  };

  pools.forEach((pool) => poolParams(pool.address, pool.fee));

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
