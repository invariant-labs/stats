import { VercelRequest, VercelResponse } from "@vercel/node";
//@ts-ignore
import TIMESTAMP from "../../../data/timestamp.json";
import fs from "fs";
import path from "path";

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

  const { net, interval, address } = req.query;

  const network = (net as string).split("-")[1] as "mainnet" | "testnet";

  const filePath = path.join(
    process.cwd(),
    "data",
    "intervals",
    network,
    `${address}.json`
  );

  const data = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
    : null;

  if (!data) {
    throw new Error(`Data not found for address: ${address}`);
  }

  const intervalData = data[interval as string];
  intervalData.volumePlot = intervalData.volumePlot.slice(0, 30);
  intervalData.liquidityPlot = intervalData.liquidityPlot.slice(0, 30);
  intervalData.feesPlot = intervalData.feesPlot.slice(0, 30);

  const response = {
    timestamp: TIMESTAMP.v,
    ...intervalData,
  };

  res.json(response);
}
