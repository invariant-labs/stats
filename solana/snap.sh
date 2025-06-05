#!/bin/bash
export NODE_OPTIONS="--max-old-space-size=8192"

ts-node ./src/snap.ts true 
# ts-node ./src/ticks.ts
# ts-node ./src/pool_apy.ts
ts-node ./src/daily_pool_apy.ts true
ts-node ./src/aggregate-intervals.ts true
ts-node ./src/full-snap.ts true
