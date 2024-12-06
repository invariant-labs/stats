import { VercelRequest, VercelResponse } from "@vercel/node";
//@ts-ignore
import TESTNET_DATA from "../../../data/alph/testnet.json";
//@ts-ignore
import MAINNET_DATA from "../../../data/alph/mainnet.json";
import {
  PoolSnapshot,
  PoolStatsData,
  ALPHNetwork as Network,
} from "../../utils";

const onlySnaps = (
  data: Record<string, PoolStatsData>
): Record<string, PoolSnapshot[]> => {
  const newData: Record<string, PoolSnapshot[]> = {};

  Object.entries(data).forEach(([address, pool]) => {
    newData[address] = pool.snapshots.slice(-31);
  });

  return newData;
};

const sliceSnaps = (
  data: Record<string, PoolSnapshot[]>,
  limit: number,
  skip: number
): Record<string, PoolSnapshot[]> => {
  const newData: Record<string, PoolSnapshot[]> = {};

  Object.entries(data).forEach(([address, pool]) => {
    const arr = pool.slice(-limit + skip);
    arr.splice(arr.length - skip, skip);
    newData[address] = arr;
  });

  return newData;
};

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

  const { net, limit = "28", skip = "0" } = req.query;

  let data: Record<string, PoolStatsData>;

  switch (net) {
    case Network.Testnet:
      data = TESTNET_DATA;
      break;
    case Network.Mainnet:
      data = MAINNET_DATA;
      break;
    default:
      res.status(400).send("INVALID NETWORK");
      return;
  }

  const snaps: Record<string, PoolSnapshot[]> = sliceSnaps(
    onlySnaps(data),
    Number(limit),
    Number(skip)
  );

  res.json(snaps);
}
