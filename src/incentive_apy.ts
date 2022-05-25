import { Network, Market, getMarketAddress, Pair } from "@invariant-labs/sdk";
import { rewardsAPY } from "@invariant-labs/sdk/lib/utils";
import { Staker } from "@invariant-labs/staker-sdk";
import { Provider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_TICKS from "../data/ticks_devnet.json";
import MAINNET_TICKS from "../data/ticks_mainnet.json";
import DEVNET_REWARDS from "../data/rewards_data_devnet.json";
import MAINNET_REWARDS from "../data/rewards_data_mainnet.json";
import DEVNET_APY from "../data/incentive_apy_devnet.json";
import MAINNET_APY from "../data/incentive_apy_mainnet.json";
import {
  TicksSnapshot,
  jsonToTicks,
  marketToStakerNetwork,
  devnetTokensData,
  getTokensData,
  TokenData,
  getTokensPrices,
  RewardsData,
  ApySnapshot,
} from "./utils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider;
  let fileName: string;
  let snaps: Record<string, TicksSnapshot[]>;
  let rewardsData: Record<string, RewardsData>;
  let tokensData: Record<string, TokenData>;
  let apySnaps: Record<string, ApySnapshot>;

  let inputFilename: string;

  switch (network) {
    case Network.MAIN:
      provider = Provider.local("https://ssc-dao.genesysgo.net");
      fileName = "./data/incentive_apy_mainnet.json";
      snaps = jsonToTicks(MAINNET_TICKS);
      rewardsData = MAINNET_REWARDS;
      tokensData = await getTokensData();
      apySnaps = MAINNET_APY;
      inputFilename = "./data/incentive_apy_mainnet_input.json";
      break;
    case Network.DEV:
    default:
      provider = Provider.local("https://api.devnet.solana.com");
      fileName = "./data/incentive_apy_devnet.json";
      snaps = jsonToTicks(DEVNET_TICKS);
      rewardsData = DEVNET_REWARDS;
      tokensData = devnetTokensData;
      apySnaps = DEVNET_APY;

      inputFilename = "./data/incentive_apy_devnet_input.json";
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
  const currentTickIndexes: Record<string, number> = {};
  const apy: Record<string, ApySnapshot> = {};

  const input: Record<string, any> = {};

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
      currentTickIndexes[address.toString()] = pool.currentTickIndex;
    })
  );

  allIncentives.forEach((incentive) => {
    if (snaps[incentive.pool.toString()].length < 25) {
      apy[incentive.publicKey.toString()] = {
        apy: 0,
        weeklyFactor: 0.01,
      };
    } else {
      const len = snaps[incentive.pool.toString()].length;
      const currentSnap = snaps[incentive.pool.toString()][len - 1];
      const prevSnap = snaps[incentive.pool.toString()][len - 25];

      const incentiveRewardData = rewardsData?.[incentive.publicKey.toString()];
      const rewardToken =
        typeof incentiveRewardData === "undefined"
          ? { decimals: 0 }
          : tokensData?.[incentiveRewardData.token] ?? { decimals: 0 };
      const rewardTokenPrice = rewardToken.coingeckoId
        ? coingeckoPrices[rewardToken.coingeckoId] ?? 0
        : 0;

      try {
        const incentiveApy = rewardsAPY({
          ticksPreviousSnapshot: prevSnap.ticks,
          ticksCurrentSnapshot: currentSnap.ticks,
          rewardInUSD:
            typeof incentiveRewardData === "undefined"
              ? 0
              : rewardTokenPrice * incentiveRewardData.total,
          tokenXprice: xPrices?.[incentive.pool.toString()] ?? 0,
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
          weeklyFactor:
            apySnaps?.[incentive.publicKey.toString()]?.weeklyFactor ?? 0.01,
          tokenDecimal: rewardToken.decimals,
          currentTickIndex:
            currentTickIndexes?.[incentive.pool.toString()] ?? 0,
        });

        input[incentive.publicKey.toString()] = {
          ticksPreviousSnapshot: prevSnap.ticks,
          ticksCurrentSnapshot: currentSnap.ticks,
          rewardInUSD:
            typeof incentiveRewardData === "undefined"
              ? 0
              : rewardTokenPrice * incentiveRewardData.total,
          tokenXprice: xPrices?.[incentive.pool.toString()] ?? 0,
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
          weeklyFactor:
            apySnaps?.[incentive.publicKey.toString()]?.weeklyFactor ?? 0.01,
          tokenDecimal: rewardToken.decimals,
          currentTickIndex:
            currentTickIndexes?.[incentive.pool.toString()] ?? 0,
        };

        console.log(incentiveApy);

        apy[incentive.publicKey.toString()] = {
          apy: isNaN(+JSON.stringify(incentiveApy.reward))
            ? 0
            : incentiveApy.reward,
          weeklyFactor: isNaN(+JSON.stringify(incentiveApy.rewardFactor))
            ? 0.01
            : incentiveApy.rewardFactor,
        };
      } catch (_error) {
        apy[incentive.publicKey.toString()] = {
          apy: 0,
          weeklyFactor: 0.01,
        };
      }
    }
  });

  fs.writeFile(fileName, JSON.stringify(apy), (err) => {
    if (err) {
      throw err;
    }
  });

  fs.writeFile(inputFilename, JSON.stringify(input), (err) => {
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
