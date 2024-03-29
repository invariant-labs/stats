import { VercelRequest, VercelResponse } from "@vercel/node";
import DEVNET_DATA from "../../data/devnet.json";
import MAINNET_DATA from "../../data/mainnet.json";
import ECLIPSE_DEVNET_DATA from '../../data/eclipse/devnet.json'
import { PoolSnapshot, PoolStatsData } from "../../src/utils";

const onlySnaps = (
  data: Record<string, PoolStatsData>
): Record<string, PoolSnapshot[]> => {
  const newData: Record<string, PoolSnapshot[]> = {};

  Object.entries(data).forEach(([address, pool]) => {
    newData[address] = pool.snapshots.slice(-31);
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

  const { net } = req.query;
  if (net === "devnet") {
    res.json(onlySnaps(DEVNET_DATA));
    return;
  }
  if (net === "mainnet") {
    res.json(onlySnaps(MAINNET_DATA));
    return;
  }
  if (net === "eclipse-devnet") {
    res.json(onlySnaps(ECLIPSE_DEVNET_DATA));
    return;
  }
  res.status(400).send("INVALID NETWORK");
}
