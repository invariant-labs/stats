import { VercelRequest, VercelResponse } from "@vercel/node";
//@ts-ignore
import ECLIPSE_TESTNET_DATA from "../../../data/eclipse/sbitz/testnet.json";
//@ts-ignore
import ECLIPSE_MAINNET_DATA from "../../../data/eclipse/sbitz/mainnet.json";
import { ISbitzData } from "../../../eclipse/src/utils";

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
  let data: ISbitzData;

  if (net === "eclipse-mainnet") {
    data = ECLIPSE_MAINNET_DATA as ISbitzData;
  } else if (net === "eclipse-testnet") {
    data = ECLIPSE_TESTNET_DATA as ISbitzData;
  } else {
    data = ECLIPSE_TESTNET_DATA as ISbitzData;
  }

  res.json(data);
}
