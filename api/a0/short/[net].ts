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

  let volume24 = 0;
  let tvl = 0;
  let fees24 = 0;
  let snaps: Record<string, PoolStatsData>;

  const { net } = req.query;
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

  const lastTimestamp = Math.max(
    ...Object.values(snaps)
      .filter((items) => items.snapshots.length > 0)
      .map((items) => +items.snapshots[items.snapshots.length - 1].timestamp)
  );

  Object.values(snaps).forEach(({ snapshots }) => {
    const snap = snapshots[snapshots.length - 1];
    volume24 +=
      snap.timestamp === lastTimestamp
        ? snap.volumeX.usdValue24 + snap.volumeY.usdValue24
        : 0;
    tvl += snap.liquidityX.usdValue24 + snap.liquidityY.usdValue24;
    fees24 +=
      snap.timestamp === lastTimestamp
        ? snap.feeX.usdValue24 + snap.feeY.usdValue24
        : 0;
  });
  res.json({
    volume24,
    tvl,
    fees24,
  });
}
