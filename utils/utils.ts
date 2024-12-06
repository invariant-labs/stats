import { PoolStatsData } from "../api/utils";

export const getCumulativeStats = (
  startTimestamp: number,
  endTimestamp: number,
  data: Record<string, PoolStatsData>
): { volume: number; fee: number } => {
  let volume = 0;
  let fee = 0;

  Object.entries(data).forEach(([_, value]) => {
    for (const snapshot of value.snapshots) {
      if (
        snapshot.timestamp >= startTimestamp &&
        snapshot.timestamp <= endTimestamp
      ) {
        volume += snapshot.volumeX.usdValue24 + snapshot.volumeY.usdValue24;
        fee += snapshot.feeX.usdValue24 + snapshot.feeY.usdValue24;
      }
    }
  });

  return { volume, fee };
};
