import { VercelRequest, VercelResponse } from "@vercel/node";
import DEVNET_APY from "../../../data/pool_apy_archive_devnet.json";
import MAINNET_APY from "../../../data/pool_apy_archive_mainnet.json";
import ECLIPSE_DEVNET_APY from "../../../data/eclipse/pool_apy_archive_devnet.json";
import ECLIPSE_MAINNET_APY from "../../../data/eclipse/pool_apy_archive_mainnet.json";

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

  const { net } = req.query
  if (net === 'devnet') {
    res.json(DEVNET_APY)
    return
  }
  if (net === 'mainnet') {
    res.json(MAINNET_APY)
    return
  }
  if (net === 'eclipse-devnet') {
    res.json(ECLIPSE_DEVNET_APY)
    return
  }
  if (net === 'eclipse-mainnet') {
    res.json(ECLIPSE_MAINNET_APY)
    return
  }
  res.status(400).send('INVALID NETWORK')
  return
}