import { VercelRequest, VercelResponse } from "@vercel/node";
import DEVNET_APY from "../../../../data/pool_apy_archive_devnet.json";
import MAINNET_APY from "../../../../data/pool_apy_archive_mainnet.json";
import ECLIPSE_DEVNET_APY from "../../../../data/eclipse/pool_apy_archive_devnet.json";
import ECLIPSE_MAINNET_APY from "../../../../data/eclipse/pool_apy_archive_mainnet.json";
import { PoolApyArchiveSnapshot } from "../../../../svm/src/utils";

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

  const { net, address, limit = "10", skip = "0" } = req.query;

  let apyArchive: Record<string, PoolApyArchiveSnapshot[]>;

  if (net === "devnet") {
    apyArchive = DEVNET_APY;
  } else if (net === "mainnet") {
    apyArchive = MAINNET_APY;
  } else if (net === "eclipse-devnet") {
    apyArchive = ECLIPSE_DEVNET_APY;
  } else if (net === "eclipse-mainnet") {
    apyArchive = ECLIPSE_MAINNET_APY;
  }else {
    res.status(400).send("INVALID NETWORK");
    return;
  }

  const data = apyArchive?.[address as string] ?? [];

  const formattedData = data.map((snap) => ({
    date: snap.timestamp,
    apy: snap.apy,
    tradingLowerTick: snap.range.tickLower,
    tradingUpperTick: snap.range.tickUpper,
  }))

  res.json(
    formattedData.slice(-(Number(limit) + Number(skip))).slice(0, Number(limit))
  );
}
