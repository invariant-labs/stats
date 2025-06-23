import { VercelRequest, VercelResponse } from "@vercel/node";
//@ts-ignore
import ECLIPSE_MAINNET_DATA from "../../../data/eclipse/sbitz.json";
import {
  BITZ_SBITZ_DECIMAL,
  ISbitzData,
  TimeData,
} from "../../../eclipse/src/utils";
import { printBN } from "../../utils";

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

  let data: ISbitzData = ECLIPSE_MAINNET_DATA;

  const lastEntry =
    data.length > 0
      ? data.reduce((latest, entry) =>
          entry.timestamp > latest.timestamp ? entry : latest
        )
      : {};

  const last30Entires = data.splice(-30);

  const sbitzSupplyPlot: TimeData[] = [];
  const bitzSupplyPlot: TimeData[] = [];
  const sbitzTVLPlot: TimeData[] = [];
  for (const entry of last30Entires) {
    sbitzSupplyPlot.push({
      timestamp: entry.timestamp,
      value: +printBN(entry.sbitzSupply, BITZ_SBITZ_DECIMAL),
    });
    bitzSupplyPlot.push({
      timestamp: entry.timestamp,
      value: +printBN(entry.bitzSupply, BITZ_SBITZ_DECIMAL),
    });
    sbitzTVLPlot.push({
      timestamp: entry.timestamp,
      value: entry.sBitzTVL,
    });
  }

  res.json({ ...lastEntry, sbitzSupplyPlot, bitzSupplyPlot, sbitzTVLPlot });
}
