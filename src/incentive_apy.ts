import { Network, Market, getMarketAddress, Pair } from "@invariant-labs/sdk";
import { rewardsAPY } from "@invariant-labs/sdk/lib/utils";
import { Staker } from "@invariant-labs/staker-sdk";
import { Provider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";
import DEVNET_REWARDS from "../data/rewards_data_devnet.json";
import MAINNET_REWARDS from "../data/rewards_data_mainnet.json";
import DEVNET_APY from "../data/incentive_apy_devnet.json";
import MAINNET_APY from "../data/incentive_apy_mainnet.json";
import {
  marketToStakerNetwork,
  devnetTokensData,
  getTokensData,
  TokenData,
  getTokensPrices,
  RewardsData,
  jsonArrayToTicks,
  IncentiveApySnapshot,
} from "./utils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config();

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider;
  let fileName: string;
  let ticksFolder: string;
  let rewardsData: Record<string, RewardsData>;
  let tokensData: Record<string, TokenData>;
  let apySnaps: Record<string, IncentiveApySnapshot>;

  switch (network) {
    case Network.MAIN:
      provider = Provider.local("https://rpc.nightly.app:8899/");
      fileName = "./data/incentive_apy_mainnet.json";
      ticksFolder = "./data/ticks/mainnet/";
      rewardsData = MAINNET_REWARDS;
      tokensData = await getTokensData();
      apySnaps = MAINNET_APY;
      break;
    case Network.DEV:
    default:
      provider = Provider.local("https://api.devnet.solana.com");
      fileName = "./data/incentive_apy_devnet.json";
      ticksFolder = "./data/ticks/devnet/";
      rewardsData = DEVNET_REWARDS;
      tokensData = devnetTokensData;
      apySnaps = DEVNET_APY;
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
  const apy: Record<string, IncentiveApySnapshot> = {};

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

  await Promise.all(
    allIncentives.map(async (incentive) => {
      return await fs.promises
        .readFile(ticksFolder + incentive.pool.toString() + ".json", "utf-8")
        .then((data) => {
          const snaps = jsonArrayToTicks(
            incentive.pool.toString(),
            JSON.parse(data)
          );

          if (
            !snaps.length ||
            (snaps[snaps.length - 1].timestamp - snaps[0].timestamp) /
              (1000 * 60 * 60) <
              24
          ) {
            apy[incentive.publicKey.toString()] = {
              apy: 0,
              apySingleTick: 0,
            };
          } else {
            const len = snaps.length;
            const currentSnap = snaps[len - 1];

            let index = 0;
            for (let i = 0; i < len; i++) {
              if (
                (snaps[snaps.length - 1].timestamp - snaps[i].timestamp) /
                  (1000 * 60 * 60) >=
                24
              ) {
                index = i;
              } else {
                break;
              }
            }
            const prevSnap = snaps[index];

            const incentiveRewardData =
              rewardsData?.[incentive.publicKey.toString()];
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
                rewardInUsd:
                  typeof incentiveRewardData === "undefined"
                    ? 0
                    : rewardTokenPrice * incentiveRewardData.total,
                tokenPrice: xPrices?.[incentive.pool.toString()] ?? 0,
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
                tokenDecimal: rewardToken.decimals,
                currentTickIndex:
                  currentTickIndexes?.[incentive.pool.toString()] ?? 0,
              });

              apy[incentive.publicKey.toString()] = {
                apy: isNaN(+JSON.stringify(incentiveApy.apy))
                  ? 0
                  : incentiveApy.apy,
                apySingleTick: isNaN(
                  +JSON.stringify(incentiveApy.apySingleTick)
                )
                  ? 0
                  : incentiveApy.apySingleTick,
              };
            } catch (_error) {
              apy[incentive.publicKey.toString()] = {
                apy: 0,
                apySingleTick: 0,
              };
            }
          }
        })
        .catch(() => {
          apy[incentive.publicKey.toString()] = {
            apy: 0,
            apySingleTick: 0,
          };
        });
    })
  );

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

createSnapshotForNetwork(Network.MAIN).then(
  () => {
    console.log("Mainnet incentive apy snapshot done!");
  },
  (err) => {
    console.log(err);
  }
);
