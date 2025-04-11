#!/bin/bash
export NODE_OPTIONS="--max-old-space-size=8192"

RPC_URL="$1"

ts-node ./src/snap.ts "$RPC_URL"
ts-node ./src/ticks.ts "$RPC_URL"
ts-node ./src/pool_apy.ts "$RPC_URL"
ts-node ./src/full-snap.ts "$RPC_URL"
