import { VercelRequest, VercelResponse } from "@vercel/node";
import DEVNET_DATA from "../../../data/full_devnet.json";
import MAINNET_DATA from "../../../data/full_mainnet.json";
import {
  PoolStatsDataWithString,
  TimeData,
  TokenStatsDataWithString,
} from "../../../svm/src/utils";

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
  liquidityPlot: TimeData[];
}

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

  const { net } = req.query;

  let data: FullSnap;

  if (net === "devnet") {
    data = DEVNET_DATA as unknown as FullSnap;
  } else if (net === "mainnet") {
    data = MAINNET_DATA as unknown as FullSnap;
  } else {
    return res.status(400).send("INVALID NETWORK");
  }

  res.json(data);
}