#!/bin/bash
export NODE_OPTIONS="--max-old-space-size=8192"

ts-node ./src/snap.ts
ts-node ./src/ticks.ts
ts-node ./src/pool_apy.ts
ts-node ./src/full-snap.ts
