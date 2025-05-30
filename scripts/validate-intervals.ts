//@ts-ignore
import ECLIPSE_MAINNET_DATA from "../data/eclipse/mainnet_intervals.json";

function main() {
  const data = ECLIPSE_MAINNET_DATA as any;

  const validate = (key: string, entriesToSum: number) => {
    const expectedVolume = data.daily.volumePlot
      .slice(0, entriesToSum)
      .reduce((acc: number, entry: any) => acc + entry.value, 0);
    const expectedTVL =
      data.daily.liquidityPlot
        .slice(0, entriesToSum)
        .reduce((acc: number, entry: any) => acc + entry.value, 0) /
      entriesToSum;

    const sumPoolTVLS = data[key].poolsData.reduce((acc: number, pool: any) => {
      return acc + pool.tvl;
    }, 0);
    const sumTokenTVLS = data[key].tokensData.reduce(
      (acc: number, token: any) => {
        return acc + token.tvl;
      },
      0
    );

    const sumPoolVolumes = data[key].poolsData.reduce(
      (acc: number, pool: any) => {
        return acc + pool.volume;
      },
      0
    );

    const sumTokenVolumes = data[key].tokensData.reduce(
      (acc: number, token: any) => {
        return acc + token.volume;
      },
      0
    );

    console.log("key", key);
    console.log("Expected Volume:", expectedVolume);
    console.log("Sum of Pool Volumes:", sumPoolVolumes);
    console.log("Sum of Token Volumes:", sumTokenVolumes);
    console.log("Expected TVL:", expectedTVL);
    console.log("Sum of Pool TVLs:", sumPoolTVLS);
    console.log("Sum of TVLs:", sumTokenTVLS);
  };

  validate("daily", 1);
  validate("weekly", 7);
  validate("monthly", 30);
}

main();
