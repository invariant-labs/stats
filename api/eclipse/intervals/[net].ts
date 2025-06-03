import { VercelRequest, VercelResponse } from "@vercel/node";
//@ts-ignore
import ECLIPSE_TESTNET_DATA from "../../../data/eclipse/testnet_intervals.json";
//@ts-ignore
import ECLIPSE_MAINNET_DATA from "../../../data/eclipse/mainnet_intervals.json";
//@ts-ignore
import TIMESTAMP from "../../../data/eclipse/timestamp.json";

import {
  mapStringToInterval,
  TotalIntervalStats,
} from "../../../eclipse/src/utils";
import { Network } from "@invariant-labs/sdk-eclipse";

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

  const { net, interval: rawInterval } = req.query;
  let data;

  if (net === "eclipse-mainnet") {
    data = ECLIPSE_MAINNET_DATA as TotalIntervalStats;
  } else if (net === "eclipse-testnet") {
  } else {
    data = ECLIPSE_TESTNET_DATA as TotalIntervalStats;
  }
  const interval = mapStringToInterval(rawInterval as string);
  const dailyData = data.daily;
  const volume24 = dailyData.volume;
  const tvl24 = dailyData.tvl;
  const fees24 = dailyData.fees;
  const intervalData = data[interval];
  intervalData.volumePlot = intervalData.volumePlot.slice(0, 30);
  intervalData.liquidityPlot = intervalData.liquidityPlot.slice(0, 30);

  const response = {
    timestamp: TIMESTAMP.v,
    volume24,
    tvl24,
    fees24,
    ...intervalData,
  };

  res.json(response);
}
