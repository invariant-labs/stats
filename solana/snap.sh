#!/bin/bash
export NODE_OPTIONS="--max-old-space-size=8192"

echo "SOLANA_RPC_URL is set: $([ -n "$SOLANA_RPC_URL" ] && echo 'Yes' || echo 'No')"
echo "HELLO_WORLD is set: $([ -n "$HELLO_WORLD" ] && echo 'Yes' || echo 'No')"

ts-node ./src/snap.ts
# ts-node ./src/ticks.ts
# ts-node ./src/pool_apy.ts
# ts-node ./src/full-snap.ts
