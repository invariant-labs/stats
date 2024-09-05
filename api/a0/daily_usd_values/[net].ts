import { VercelRequest, VercelResponse } from "@vercel/node";
import TESTNET_DATA from "../../../data/a0/testnet.json";
import MAINNET_DATA from "../../../data/a0/mainnet.json";
import { PoolStatsData, A0Network as Network } from "./../../utils";

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

  let snaps: Record<string, PoolStatsData>;

  const { net, limit = "10", skip = "0" } = req.query;
  switch (net) {
    case Network.Testnet:
      snaps = TESTNET_DATA;
      break;
    case Network.Mainnet:
      snaps = MAINNET_DATA;
      break;
    default:
      res.status(400).send("INVALID NETWORK");
      return;
  }

  const dataByTimestamp: Record<
    number,
    {
      volumeUSD: number;
      tvlUSD: number;
      feeUSD: number;
    }
  > = {};

  Object.values(snaps).forEach(({ snapshots }) => {
    snapshots.forEach((snap) => {
      if (!dataByTimestamp[snap.timestamp]) {
        dataByTimestamp[snap.timestamp] = {
          volumeUSD: 0,
          tvlUSD: 0,
          feeUSD: 0,
        };
      }

      dataByTimestamp[snap.timestamp].volumeUSD +=
        snap.volumeX.usdValue24 + snap.volumeY.usdValue24;
      dataByTimestamp[snap.timestamp].tvlUSD +=
        snap.liquidityX.usdValue24 + snap.liquidityY.usdValue24;
      dataByTimestamp[snap.timestamp].feeUSD +=
        snap.feeX.usdValue24 + snap.feeY.usdValue24;
    });
  });

  const data = Object.entries(dataByTimestamp)
    .map(([timestamp, timedata]) => ({
      ...timedata,
      timestamp: +timestamp,
    }))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-(Number(limit) + Number(skip)));

  data.splice(data.length - Number(skip), Number(skip));

  res.json(data);
}
