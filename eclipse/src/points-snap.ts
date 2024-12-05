import { AnchorProvider } from "@coral-xyz/anchor";
import {
  CreatePositionEvent,
  getMarketAddress,
  InvariantEventNames,
  IWallet,
  Market,
  Network,
  parseEvent,
  RemovePositionEvent,
} from "@invariant-labs/sdk-eclipse";
import {
  ConfirmedSignatureInfo,
  Connection,
  ParsedTransactionWithMeta,
  PublicKey,
} from "@solana/web3.js";
import * as fs from "fs";

enum EventTypes {
  OpenPosition,
  RemovePosition,
}

const fetchAllSignatures = async (
  connection: Connection,
  programId: PublicKey,
  lastTxHash: string
) => {
  const allSignatures: ConfirmedSignatureInfo[] = [];
  let beforeTxHash: string | undefined = undefined;
  let done: boolean = false;

  while (!done) {
    const signatures = await connection.getSignaturesForAddress(
      programId,
      { before: beforeTxHash, until: lastTxHash },
      "confirmed"
    );

    if (signatures.length === 0) {
      done = true;
      break;
    }

    allSignatures.push(...signatures);

    if (signatures[signatures.length - 1].signature === lastTxHash) {
      done = true;
    } else {
      beforeTxHash = signatures[signatures.length - 1].signature;
    }
  }

  return allSignatures.map((signatureInfo) => signatureInfo.signature);
};

const processParsedTransactions = (
  parsedTransactions: (ParsedTransactionWithMeta | null)[]
) => {
  return parsedTransactions
    .filter((tx) => tx?.meta?.logMessages && tx.transaction.signatures[0])
    .map((tx) => {
      return tx!.meta!.logMessages!;
    });
};

const fetchTransactionLogs = async (
  connection: Connection,
  signatures: string[],
  batchSize: number
) => {
  const batchCount = Math.ceil(signatures.length / batchSize);
  const batchedSignatures = new Array(batchCount).fill(0);

  return (
    await Promise.all(
      batchedSignatures.map(async (_, idx) => {
        const batchSignatures = signatures.slice(
          idx * batchSize,
          (idx + 1) * batchSize
        );
        return processParsedTransactions(
          await connection.getParsedTransactions(batchSignatures, "confirmed")
        );
      })
    )
  ).flat();
};

const extractEvents = (market: Market, transactionLog: string[]) => {
  const eventsObject = {};
  const eventLogs = transactionLog.filter((log) =>
    log.startsWith("Program data:")
  );
  eventLogs.forEach((eventLog) => {
    const decodedEvent = market.eventDecoder.decode(
      eventLog.split("Program data: ")[1]
    );
    if (!decodedEvent) {
      return;
    }
    switch (decodedEvent.name) {
      case InvariantEventNames.CreatePositionEvent:
        eventsObject[EventTypes.OpenPosition].push(parseEvent(decodedEvent));
        break;
      case InvariantEventNames.RemovePositionEvent:
        eventsObject[EventTypes.RemovePosition].push(parseEvent(decodedEvent));
        break;
      default:
        return;
    }
  });
  return eventsObject;
};

export const createPointsSnap = async (network: Network) => {
  const MAX_SIGNATURES_PER_CALL = 300;
  let provider: AnchorProvider;
  let lastTxHashFileName: string;
  let snapFileName: string;

  switch (network) {
    case Network.MAIN:
      provider = AnchorProvider.local("https://eclipse.helius-rpc.com");
      lastTxHashFileName = "../data/eclipse/points/last_tx_hash_mainnet.json";
      snapFileName = "../data/eclipse/points/points.json";
      break;
    default:
      throw new Error("Unknown network");
  }

  const connection = provider.connection;
  const programId = new PublicKey(getMarketAddress(network));

  const market = Market.build(
    network,
    provider.wallet as IWallet,
    connection,
    programId
  );

  const lastTxHash: string = JSON.parse(
    fs.readFileSync(lastTxHashFileName, "utf-8")
  ).lastTxHash;
  const sigs = await fetchAllSignatures(connection, programId, lastTxHash);
  if (sigs.length === 0) return;
  const data = { lastTxHash: sigs[0] };
  fs.writeFileSync(lastTxHashFileName, JSON.stringify(data, null, 2));
  const txLogs = await fetchTransactionLogs(
    connection,
    sigs,
    MAX_SIGNATURES_PER_CALL
  );

  const finalLogs = txLogs.flat();

  const events = extractEvents(market, finalLogs);
  fs.writeFileSync(snapFileName, JSON.stringify(events, null, 2));
};

createPointsSnap(Network.MAIN);
