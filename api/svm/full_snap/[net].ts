import { VercelRequest, VercelResponse } from "@vercel/node";
//@ts-ignore
import DEVNET_DATA from "../../../data/full_devnet.json";
//@ts-ignore
import MAINNET_DATA from "../../../data/full_mainnet.json";
//@ts-ignore
import ECLIPSE_DEVNET_DATA from "../../../data/eclipse/full_devnet.json";
//@ts-ignore
import ECLIPSE_TESTNET_DATA from "../../../data/eclipse/full_testnet.json";
//@ts-ignore
import ECLIPSE_MAINNET_DATA from "../../../data/eclipse/full_mainnet.json";
import {
  PoolStatsDataWithString,
  TimeData,
  TokenStatsDataWithString,
} from "../../../solana/src/utils";

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
  } else if (net === "eclipse-devnet") {
    data = ECLIPSE_DEVNET_DATA as unknown as FullSnap;
  } else if (net === "eclipse-testnet") {
    data = ECLIPSE_TESTNET_DATA as unknown as FullSnap;
  } else if (net === "eclipse-mainnet") {
    data = ECLIPSE_MAINNET_DATA as unknown as FullSnap;
  } else {
    return res.status(400).send("INVALID NETWORK");
  }

  res.json(data);
}
