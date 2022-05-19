import { Network, Market, getMarketAddress, Pair } from "@invariant-labs/sdk";
import { poolAPY, rewardsAPY } from "@invariant-labs/sdk/lib/utils";
import { Staker } from "@invariant-labs/staker-sdk";
import { BN, Provider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_TICKS from "../data/ticks_devnet.json";
import MAINNET_TICKS from "../data/ticks_mainnet.json";
import {
  TicksSnapshot,
  jsonToTicks,
  marketToStakerNetwork,
  devnetTokensData,
  getTokensData,
  TokenData,
  getTokensPrices,
} from "./utils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider;
  let fileName: string;
  let snaps: Record<string, TicksSnapshot[]>;
  let tokensData: Record<string, TokenData>;

  switch (network) {
    case Network.MAIN:
      provider = Provider.local("https://ssc-dao.genesysgo.net");
      fileName = "./data/incentive_apy_mainnet.json";
      snaps = jsonToTicks(MAINNET_TICKS);
      tokensData = await getTokensData();
      break;
    case Network.DEV:
    default:
      provider = Provider.local("https://api.devnet.solana.com");
      fileName = "./data/incentive_apy_devnet.json";
      snaps = jsonToTicks(DEVNET_TICKS);
      tokensData = devnetTokensData;
  }

  const idsList: string[] = [];

  Object.values(tokensData).forEach((token) => {
    if (typeof token?.coingeckoId !== "undefined") {
      idsList.push(token.coingeckoId);
    }
  });

  const coingeckoPrices = await getTokensPrices(idsList);

  const connection = provider.connection;

  const market = await Market.build(
    network,
    provider.wallet,
    connection,
    new PublicKey(getMarketAddress(network))
  );

  const staker = await Staker.build(
    marketToStakerNetwork(network),
    provider.wallet,
    connection
  );

  const allPools = await market.getAllPools();
  const allIncentives = await staker.getAllIncentive();

  const xPrices: Record<string, number> = {};
  const apy: Record<string, number> = {};

  await Promise.all(
    allPools.map(async (pool) => {
      const pair = new Pair(pool.tokenX, pool.tokenY, { fee: pool.fee.v });
      const address = await pair.getAddress(market.program.programId);
      const tokenXData = tokensData?.[pool.tokenX.toString()] ?? {
        decimals: 0,
      };
      const tokenXPrice = tokenXData.coingeckoId
        ? coingeckoPrices[tokenXData.coingeckoId] ?? 0
        : 0;

      xPrices[address.toString()] = tokenXPrice;
    })
  );

  allIncentives.forEach((incentive) => {
    if (snaps[incentive.pool.toString()].length < 25) {
      apy[incentive.publicKey.toString()] = 0;
    } else {
      const len = snaps[incentive.pool.toString()].length;
      const currentSnap = snaps[incentive.pool.toString()][len - 1];
      const prevSnap = snaps[incentive.pool.toString()][len - 25];

      apy[incentive.publicKey.toString()] = rewardsAPY({
        ticksPreviousSnapshot: prevSnap.ticks,
        ticksCurrentSnapshot: currentSnap.ticks,
        rewardInUSD: 0,
        tokenXprice: xPrices[incentive.pool.toString()],
        duration:
          Math.floor(
            (incentive.endTime.v.toNumber() -
              incentive.startTime.v.toNumber()) /
              60 /
              60 /
              24
          ) *
          60 *
          60 *
          24,
      });
    }
  });

  fs.writeFile(fileName, JSON.stringify(apy), (err) => {
    if (err) {
      throw err;
    }
  });
};

createSnapshotForNetwork(Network.DEV).then(
  () => {
    console.log("Devnet incentive apy snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);

// createSnapshotForNetwork(Network.MAIN).then(
//   () => {
//     console.log("Mainnet incentive apy snapshot done!");
//   },
//   (err) => {
//     console.log(err);
//   }
// );
