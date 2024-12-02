import MAINNET_DATA from "../../data/mainnet.json";

let sum = 0;

Object.values(MAINNET_DATA).forEach((data) => {
  data.snapshots.forEach((snap) => {
    sum += snap.volumeX.usdValue24;
    sum += snap.volumeY.usdValue24;
  });
});

console.log(sum);
