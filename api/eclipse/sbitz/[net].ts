import { VercelRequest, VercelResponse } from "@vercel/node";
//@ts-ignore
import ECLIPSE_MAINNET_DATA from "../../../data/eclipse/sbitz.json";
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

  let data: ISbitzData = ECLIPSE_MAINNET_DATA;

  const lastEntry =
    data.length > 0
      ? data.reduce((latest, entry) =>
          entry.timestamp > latest.timestamp ? entry : latest
        )
      : {};

  res.json(lastEntry);
}
