import { VercelRequest, VercelResponse } from "@vercel/node";
import DEVNET_APY from "../../data/pool_apy_devnet.json";
import MAINNET_APY from "../../data/pool_apy_mainnet.json";
import ECLIPSE_DEVNET_APY from '../../data/eclipse/pool_apy_devnet.json'
import { ApySnapshot } from "../../src/utils";

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

  let apyData: Record<string, ApySnapshot>;

  const { net } = req.query;
  if (net === "devnet") {
    apyData = DEVNET_APY;
  } else if (net === "mainnet") {
    apyData = MAINNET_APY;
  } if (net === "eclipse-devnet") {
    apyData = ECLIPSE_DEVNET_APY;
  } else {
    res.status(400).send("INVALID NETWORK");
    return;
  }

  const data = {};

  Object.entries(apyData).forEach(([address, apy]) => {
    data[address] = apy.weeklyRange;
  });

  res.json(data);
}
