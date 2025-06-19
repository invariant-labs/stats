export NODE_OPTIONS="--max-old-space-size=8192"

npx tsx ./src/snap.ts true
# npx tsx ./src/ticks.ts
# npx tsx ./src/pool_apy.ts
npx tsx ./src/daily_pool_apy.ts true
npx tsx ./src/aggregate-intervals.ts true
npx tsx ./src/full-snap.ts true
npx tsx ./src/snap-bitz.ts
