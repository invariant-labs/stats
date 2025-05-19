// //@ts-ignore
// import ECLIPSE_MAINNET_DATA from "../data/eclipse/full_mainnet.json";
//@ts-ignore
import ECLIPSE_MAINNET_DATA from "../data/eclipse/intervals/mainnet/HRgVv1pyBLXdsAddq4ubSqo8xdQWRrYbvmXqEDtectce.json";
//@ts-ignore
import GLOBAL_STATS from "../data/eclipse/mainnet_intervals.json";
function main() {
  const sortedPlot = GLOBAL_STATS.daily.volumePlot.sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const isSorted = sortedPlot.every(
    (val, index) =>
      GLOBAL_STATS.daily.volumePlot[index].timestamp === val.timestamp
  );
  console.log("Is sorted: ", isSorted);

  const dailyTotalVolume = ECLIPSE_MAINNET_DATA.daily.volumePlot.reduce(
    (acc: number, val) => acc + val.value,
    0
  );
  const dailyTotalFees = ECLIPSE_MAINNET_DATA.daily.feesPlot.reduce(
    (acc: number, val) => acc + val.value,
    0
  );

  const weeklyTotalVolume = ECLIPSE_MAINNET_DATA.weekly.volumePlot.reduce(
    (acc: number, val) => acc + val.value,
    0
  );
  const weeklyTotalFees = ECLIPSE_MAINNET_DATA.weekly.feesPlot.reduce(
    (acc: number, val) => acc + val.value,
    0
  );
  const monthlyTotalVolume = ECLIPSE_MAINNET_DATA.monthly.volumePlot.reduce(
    (acc: number, val) => acc + val.value,
    0
  );
  const monthlyTotalFees = ECLIPSE_MAINNET_DATA.monthly.feesPlot.reduce(
    (acc: number, val) => acc + val.value,
    0
  );
  const totalVolume = ECLIPSE_MAINNET_DATA.yearly.volumePlot.reduce(
    (acc: number, val) => acc + val.value,
    0
  );
  const totalFees = ECLIPSE_MAINNET_DATA.yearly.feesPlot.reduce(
    (acc: number, val) => acc + val.value,
    0
  );

  console.log("--- VOLUMES ---");
  console.log("Daily Total Volume: ", dailyTotalVolume);
  console.log("Weekly Total Volume: ", weeklyTotalVolume);
  console.log("Monthly Total Volume: ", monthlyTotalVolume);
  console.log("Total Volume: ", totalVolume);
  console.log("--- FEES ---");
  console.log("Daily Total Fees: ", dailyTotalFees);
  console.log("Weekly Total Fees: ", weeklyTotalFees);
  console.log("Monthly Total Fees: ", monthlyTotalFees);
  console.log("Total Fees: ", totalFees);
}

main();
