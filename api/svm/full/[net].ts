import { VercelRequest, VercelResponse } from "@vercel/node";
import DEVNET_DATA from "../../../data/devnet.json";
import MAINNET_DATA from "../../../data/mainnet.json";
import ECLIPSE_DEVNET_DATA from "../../../data/eclipse/devnet.json";
import { PoolSnapshot, PoolStatsData } from "../../../svm/src/utils";

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

  if (net === "devnet") {
    data = DEVNET_DATA;
  } else if (net === "mainnet") {
    data = MAINNET_DATA;
  } else if (net === "eclipse-devnet") {
    data = ECLIPSE_DEVNET_DATA;
  } else {
    res.status(400).send("INVALID NETWORK");
    return
  }

  const snaps: Record<string, PoolSnapshot[]> = sliceSnaps(
    onlySnaps(data),
    Number(limit),
    Number(skip)
  );

  res.json(snaps);
}
