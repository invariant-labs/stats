import { VercelRequest, VercelResponse } from "@vercel/node";

import ECLIPSE_MAINNET_DATA from "../../data/eclipse/mainnet_intervals.json";

export default function (req: VercelRequest, res: VercelResponse) {
  // const main = () => {
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
    const change = (now * 100) / prev;
    return { value: now, change };
  };
  const volume24 = get24hValue(volumePlot);
  const tvl24 = get24hValue(liquidityPlot);
  const fees24 = get24hValue(feesPlot);

  const response = {
    timestamp: volumePlot[0]?.timestamp || 0,
    volume24,
    tvl24,
    fees24,
    volume: volume24,
    tvl: tvl24,
    fees: fees24,
    cumulativeVolume,
    cumulativeFees,
    volumePlot: volumePlot.slice(0, 30),
    liquidityPlot: liquidityPlot.slice(0, 30),
    feesPlot: feesPlot.slice(0, 30),
    poolsData: data.daily.poolsData,
    tokensData: data.daily.tokensData,
  };

  res.json(response);
}
