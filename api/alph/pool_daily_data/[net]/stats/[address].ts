import { VercelRequest, VercelResponse } from "@vercel/node";
//@ts-ignore
import TESTNET_DATA from "../../../../../data/alph/testnet.json";
//@ts-ignore
import MAINNET_DATA from "../../../../../data/alph/mainnet.json";
import {
  PoolStatsData,
  ALPHNetwork as Network,
  toStringWithDecimals,
} from "../../../../utils";

export default function (req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
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

  let data: Record<string, PoolStatsData>;

  switch (net) {
    case Network.Testnet:
      data = TESTNET_DATA;
      break;
    case Network.Mainnet:
      data = MAINNET_DATA;
      break;
    default:
      res.status(400).send("INVALID NETWORK");
      return;
  }

  const addressData = data?.[address as string];

  if (typeof addressData === "undefined") {
    res.json([]);
    return;
  }

  const formattedData = addressData.snapshots
    .map((snap, index) => {
      const prevData =
        index > 0
          ? addressData.snapshots[index - 1]
          : {
              volumeX: {
                tokenBNFromBeginning: "0",
              },
              volumeY: {
                tokenBNFromBeginning: "0",
              },
              feeX: {
                tokenBNFromBeginning: "0",
              },
              feeY: {
                tokenBNFromBeginning: "0",
              },
            };
      const volumeX = toStringWithDecimals(
        BigInt(snap.volumeX.tokenBNFromBeginning) -
          BigInt(prevData.volumeX.tokenBNFromBeginning),
        addressData.tokenX.decimals
      );
      const volumeY = toStringWithDecimals(
        BigInt(snap.volumeY.tokenBNFromBeginning) -
          BigInt(prevData.volumeY.tokenBNFromBeginning),
        addressData.tokenY.decimals
      );
      const liquidityX = toStringWithDecimals(
        BigInt(snap.liquidityX.tokenBNFromBeginning),
        addressData.tokenX.decimals
      );
      const liquidityY = toStringWithDecimals(
        BigInt(snap.liquidityY.tokenBNFromBeginning),
        addressData.tokenY.decimals
      );
      const feeX = toStringWithDecimals(
        BigInt(snap.feeX.tokenBNFromBeginning) -
          BigInt(prevData.feeX.tokenBNFromBeginning),
        addressData.tokenX.decimals
      );
      const feeY = toStringWithDecimals(
        BigInt(snap.feeY.tokenBNFromBeginning) -
          BigInt(prevData.feeY.tokenBNFromBeginning),
        addressData.tokenY.decimals
      );
      return {
        date: snap.timestamp,
        volumeUsd: snap.volumeX.usdValue24 + snap.volumeY.usdValue24,
        liquidityUsd: snap.liquidityX.usdValue24 + snap.liquidityY.usdValue24,
        feeUsd: snap.feeX.usdValue24 + snap.feeY.usdValue24,
        details: {
          volumeX,
          volumeY,
          liquidityX,
          liquidityY,
          feeX,
          feeY,
        },
      };
    })
    .slice(-(Number(limit) + Number(skip)));

  formattedData.splice(formattedData.length - Number(skip), Number(skip));

  res.json(formattedData);
}
