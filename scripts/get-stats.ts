//@ts-ignore
import ECLIPSE_MAINNET_DATA from "../data/eclipse/full_mainnet.json";

import {
  PoolStatsDataWithString,
  TimeData,
  TokenStatsDataWithString,
} from "../solana/src/utils";

interface FullSnap {
  volume24: {
    value: number;
    change: number;
  };
  tvl24: {
    value: number;
    change: number;
  };
  fees24: {
    value: number;
    change: number;
  };
  tokensData: TokenStatsDataWithString[];
  poolsData: PoolStatsDataWithString[];
  volumePlot: TimeData[];
  liquidityPlot: TimeData[];
}

const POOL_ADDRESS = "HRgVv1pyBLXdsAddq4ubSqo8xdQWRrYbvmXqEDtectce";

// preview api response
function main() {
  let data: FullSnap;

  data = ECLIPSE_MAINNET_DATA as unknown as FullSnap;

  console.log("ECLIPSE_MAINNET_DATA");
  const pool = data.poolsData.find((p) => p.poolAddress === POOL_ADDRESS);
  console.log(pool);
}

main();
