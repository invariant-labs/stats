import { getCumulativeStats } from "../utils/utils";
import SOLANA_MAINNET_DATA from "../data/mainnet.json";
import SOLANA_DEVNET_DATA from "../data/devnet.json";
import ECLIPSE_MAINNET_DATA from "../data/eclipse/mainnet.json";
import ECLIPSE_TESTNET_DATA from "../data/eclipse/testnet.json";
import ECLIPSE_DEVNET_DATA from "../data/eclipse/devnet.json";
import ALEPH_ZERO_MAINNET_DATA from "../data/a0/mainnet.json";
import ALEPH_ZERO_TESTNET_DATA from "../data/a0/testnet.json";
import ALEPHIUM_MAINNET_DATA from "../data/alph/mainnet.json";
import ALEPHIUM_TESTNET_DATA from "../data/alph/testnet.json";
import VARA_TESTNET_DATA from "../data/vara/testnet.json";
import { PoolStatsData } from "../api/utils";

const main = async () => {
  const chain = process.argv[2];
  const network = process.argv[3];
  const startTimestamp = +process.argv[4];
  const endTimestamp = +process.argv[5];
  let snaps: Record<string, PoolStatsData> = {};

  switch (`${chain}-${network}`) {
    case "solana-mainnet":
      snaps = SOLANA_MAINNET_DATA as Record<string, PoolStatsData>;
      break;
    case "solana-devnet":
      snaps = SOLANA_DEVNET_DATA as Record<string, PoolStatsData>;
      break;
    case "eclipse-mainnet":
      snaps = ECLIPSE_MAINNET_DATA as Record<string, PoolStatsData>;
      break;
    case "eclipse-testnet":
      snaps = ECLIPSE_TESTNET_DATA as Record<string, PoolStatsData>;
      break;
    case "eclipse-devnet":
      snaps = ECLIPSE_DEVNET_DATA as Record<string, PoolStatsData>;
      break;
    case "aleph-zero-mainnet":
      snaps = ALEPH_ZERO_MAINNET_DATA as Record<string, PoolStatsData>;
      break;
    case "aleph-zero-testnet":
      snaps = ALEPH_ZERO_TESTNET_DATA as Record<string, PoolStatsData>;
      break;
    case "alephium-mainnet":
      snaps = ALEPHIUM_MAINNET_DATA as Record<string, PoolStatsData>;
      break;
    case "alephium-testnet":
      snaps = ALEPHIUM_TESTNET_DATA as Record<string, PoolStatsData>;
      break;
    case "vara-testnet":
      snaps = VARA_TESTNET_DATA as Record<string, PoolStatsData>;
      break;
    default:
      throw new Error("Invalid chain or network");
  }

  const { volume, fee } = getCumulativeStats(
    startTimestamp,
    endTimestamp,
    snaps
  );
  console.log(
    `Chain: ${chain.toUpperCase()}, Network: ${network.toUpperCase()}, Volume: $${volume
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}, Fee: $${fee
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
  );
};

main();
