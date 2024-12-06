import { VercelRequest, VercelResponse } from "@vercel/node";
//@ts-ignore
import DEVNET_APY from "../../../data/incentive_apy_devnet.json";
//@ts-ignore
import MAINNET_APY from "../../../data/incentive_apy_mainnet.json";
import { IncentiveApySnapshot, RewardsData } from "../../../solana/src/utils";
//@ts-ignore
import DEVNET_REWARDS from "../../../data/rewards_data_devnet.json";
//@ts-ignore
import MAINNET_REWARDS from "../../../data/rewards_data_mainnet.json";

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

  let apyData: Record<string, IncentiveApySnapshot>;
  let rewardsData: Record<string, RewardsData>;

  const { net } = req.query;
  if (net === "devnet") {
    apyData = DEVNET_APY;
    rewardsData = DEVNET_REWARDS;
  } else if (net === "mainnet") {
    apyData = MAINNET_APY;
    rewardsData = MAINNET_REWARDS;
  } else {
    res.status(400).send("INVALID NETWORK");
    return;
  }

  const data = {};

  Object.entries(apyData).forEach(([address, apy]) => {
    data[address] = {
      ...apy,
      ...rewardsData[address],
    };
  });

  Object.entries(rewardsData).forEach(([address, rewards]) => {
    if (!data[address]) {
      data[address] = {
        apy: 0,
        ...rewards,
      };
    }
  });

  res.json(data);
}
