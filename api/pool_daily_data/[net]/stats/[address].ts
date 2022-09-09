import { VercelRequest, VercelResponse } from "@vercel/node";
import BN from "bn.js";
import DEVNET_DATA from "../../../../data/devnet.json";
import MAINNET_DATA from "../../../../data/mainnet.json";
import { PoolStatsData, printBN } from "../../../../src/utils";

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

  let data: Record<string, PoolStatsData>;

  if (net === "devnet") {
    data = DEVNET_DATA;
  } else if (net === "mainnet") {
    data = MAINNET_DATA;
  } else {
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
      const volumeX = +printBN(
        new BN(snap.volumeX.tokenBNFromBeginning).sub(
          new BN(prevData.volumeX.tokenBNFromBeginning)
        ),
        addressData.tokenX.decimals
      );
      const volumeY = +printBN(
        new BN(snap.volumeY.tokenBNFromBeginning).sub(
          new BN(prevData.volumeY.tokenBNFromBeginning)
        ),
        addressData.tokenY.decimals
      );
      const liquidityX = +printBN(
        new BN(snap.liquidityX.tokenBNFromBeginning),
        addressData.tokenX.decimals
      );
      const liquidityY = +printBN(
        new BN(snap.liquidityY.tokenBNFromBeginning),
        addressData.tokenY.decimals
      );
      const feeX = +printBN(
        new BN(snap.feeX.tokenBNFromBeginning).sub(
          new BN(prevData.feeX.tokenBNFromBeginning)
        ),
        addressData.tokenX.decimals
      );
      const feeY = +printBN(
        new BN(snap.feeY.tokenBNFromBeginning).sub(
          new BN(prevData.feeY.tokenBNFromBeginning)
        ),
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
