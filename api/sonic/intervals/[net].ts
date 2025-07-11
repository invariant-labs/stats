import { VercelRequest, VercelResponse } from "@vercel/node";
//@ts-ignore
import SONIC_TESTNET_DATA from "../../../data/sonic/testnet_intervals.json";
//@ts-ignore
import SONIC_MAINNET_DATA from "../../../data/sonic/mainnet_intervals.json";
//@ts-ignore
import TIMESTAMP from "../../../data/sonic/timestamp.json";

// import {
//   mapStringToInterval,
//   TotalIntervalStats,
// } from "../../../sonic/src/utils";

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

  const { net, interval } = req.query;
  let data;

  if (net === "sonic-mainnet") {
    data = SONIC_MAINNET_DATA as any;
  } else if (net === "sonic-testnet") {
    data = SONIC_TESTNET_DATA as any;
  } else {
    throw new Error("Invalid network specified");
  }

  // const interval = mapStringToInterval(rawInterval as string);
  const dailyData = data.daily;
  //   const cumulativeVolume = data.all.volume;
  //   const cumulativeFees = data.all.fees;
  const volume24 = dailyData.volume;
  const tvl24 = dailyData.tvl;
  const fees24 = dailyData.fees;
  const intervalData = data[interval as string];
  intervalData.volumePlot = intervalData.volumePlot.slice(0, 30);
  intervalData.liquidityPlot = intervalData.liquidityPlot.slice(0, 30);

  const response = {
    timestamp: TIMESTAMP.v,
    volume24,
    tvl24,
    fees24,
    // cumulativeVolume,
    // cumulativeFees,
    ...intervalData,
  };

  res.json(response);
}
