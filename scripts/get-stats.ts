// //@ts-ignore
// import ECLIPSE_MAINNET_DATA from "../data/eclipse/full_mainnet.json";
//@ts-ignore
import ECLIPSE_MAINNET_DATA from "../data/eclipse/mainnet.json";
//@ts-ignore
import APY_ARCHIVE from "../data/eclipse/pool_apy_archive_mainnet.json";
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
  const poolData = data[POOL_ADDRESS];
  console.log(Object.keys(poolData));
  const latestSnap = poolData.snapshots;
  console.log("latestSnap", latestSnap);
  // console.log(APY_ARCHIVE[POOL_ADDRESS]);
}

main();
