//@ts-ignore
import ECLIPSE_MAINNET_DATA from "../data/eclipse/mainnet_intervals.json";

import { PoolStatsDataWithString } from "../solana/src/utils";

function main() {
  const data = ECLIPSE_MAINNET_DATA as any;

  const validate = (key: string) => {
    const sumPoolTVLS = data[key].poolsData.reduce(
      (acc: number, pool: PoolStatsDataWithString) => {
        return acc + pool.tvl;
      },
      0
    );
    const sumTokenTVLS = data[key].tokensData.reduce(
      (acc: number, token: any) => {
        return acc + token.tvl;
      },
      0
    );

    console.log("key", key);
    console.log("Latest Liquidity", data[key].tvl.value);
    console.log("Sum of Pool TVLs:", sumPoolTVLS);
    console.log("Sum of TVLs:", sumTokenTVLS);
  };

  validate("daily");
  validate("weekly");
  validate("monthly");
  validate("yearly");
}

main();
