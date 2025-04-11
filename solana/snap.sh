#!/bin/bash
export NODE_OPTIONS="--max-old-space-size=8192"

RPC_URL="$1"

echo "RPC URL: $RPC_URL"

npx tsx ./src/snap.ts "$RPC_URL"
npx tsx ./src/ticks.ts "$RPC_URL"
npx tsx ./src/pool_apy.ts "$RPC_URL"
npx tsx ./src/full-snap.ts "$RPC_URL"
