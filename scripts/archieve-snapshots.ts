import SOLANA_MAINNET_DATA from "../data/mainnet.json";
import { PoolStatsData } from "../api/utils";
import fs from "fs";

const SNAPS_TO_KEEP = 90; // Number of snapshots to keep

const main = async () => {
  const snaps = SOLANA_MAINNET_DATA as Record<string, PoolStatsData>;
  console.log("Total snapshots:", Object.keys(snaps).length);

  const archieveSnaps: Record<string, PoolStatsData> = {};
  const lightWeightSnaps: Record<string, PoolStatsData> = {};

  for (const [key, value] of Object.entries(snaps)) {
    console.log(`Processing ${key}...`);
    const length = value.snapshots.length;
    const recentSliceIndex =
      length - SNAPS_TO_KEEP < 0 ? 0 : length - SNAPS_TO_KEEP;
    const archievePoolSnaps = value.snapshots.slice(0, recentSliceIndex); // Archieve first part of the snapshots
    const lightWeightPoolSnaps = value.snapshots.slice(recentSliceIndex); // Keep only the last 90 snapshots
    archieveSnaps[key] = {
      ...value,
      snapshots: archievePoolSnaps,
    };
    lightWeightSnaps[key] = {
      ...value,
      snapshots: lightWeightPoolSnaps,
    };
  }

  fs.writeFileSync(
    "data/archieve/solana_mainnet.json",
    JSON.stringify(archieveSnaps)
  );
  fs.writeFileSync("data/mainnet.json", JSON.stringify(lightWeightSnaps));
};

main();
