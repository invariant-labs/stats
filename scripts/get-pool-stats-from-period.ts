import { getCumulativeStats } from "../utils/utils";
// import SOLANA_MAINNET_DATA from "../data/mainnet.json";
// import SOLANA_DEVNET_DATA from "../data/devnet.json";
import ECLIPSE_MAINNET_DATA from "../data/eclipse/mainnet.json";
import fs from "fs";
// import ECLIPSE_TESTNET_DATA from "../data/eclipse/testnet.json";
// import ECLIPSE_DEVNET_DATA from "../data/eclipse/devnet.json";
// import ALEPH_ZERO_MAINNET_DATA from "../data/a0/mainnet.json";
// import ALEPH_ZERO_TESTNET_DATA from "../data/a0/testnet.json";
// import ALEPHIUM_MAINNET_DATA from "../data/alph/mainnet.json";
// import ALEPHIUM_TESTNET_DATA from "../data/alph/testnet.json";
// import VARA_TESTNET_DATA from "../data/vara/testnet.json";

const START_TIMESTAMP = 1743984000000; // 07.04.2024 00:00
const END_TIMESTAMP = 1744761600000; // 16.04.2024 00:00

const POOLS: string[] = [
  "HRgVv1pyBLXdsAddq4ubSqo8xdQWRrYbvmXqEDtectce", // ETH/USDC 0.09%
  "E2B7KUFwjxrsy9cC17hmadPsxWHD1NufZXTyrtuz8YxC", // SOL/USDC 0.09%
  "FvVsbwsbGVo6PVfimkkPhpcRfBrRitiV946nMNNuz7f9", // TETH/ETH 0.01%
  "86vPh8ctgeQnnn8qPADy5BkzrqoH5XjMCWvkd4tYhhmM", // SOL/ETH 0.09%
  "HG7iQMk29cgs74ZhSwrnye3C6SLQwKnfsbXqJVRi1x8H", // BITZ/ETH 1%
];

const main = async () => {
  const stats = {};
  for (const pool of POOLS) {
    const poolStats = ECLIPSE_MAINNET_DATA[pool];

    const associatedSnapshots = poolStats.snapshots.filter(
      (snap) =>
        snap.timestamp >= START_TIMESTAMP && snap.timestamp <= END_TIMESTAMP
    );

    const parsedSnapshots = associatedSnapshots.map((snap) => {
      const dayVolume = snap.volumeX.usdValue24 + snap.volumeY.usdValue24;
      return {
        date: new Date(snap.timestamp).toISOString().split("T")[0],
        volume: dayVolume,
        TVL: snap.liquidityX.usdValue24 + snap.liquidityY.usdValue24,
        // timestamp: snap.timestamp,
        // volumeX: snap.volumeX.usdValue24,
        // volumeY: snap.volumeY.usdValue24,
        // liquidityX: snap.liquidityX.usdValue24,
        // liquidityY: snap.liquidityY.usdValue24,
      };
    });

    stats[pool] = parsedSnapshots;
  }

  fs.writeFileSync("./scripts/pool-stats.json", JSON.stringify(stats, null, 2));
};

main();
