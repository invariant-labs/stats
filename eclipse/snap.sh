export NODE_OPTIONS="--max-old-space-size=8192"

npx tsx ./src/snap.ts
npx tsx ./src/ticks.ts
# npx tsx ./src/pool_apy.ts
npx tsx ./src/daily_pool_apy.ts
npx tsx ./src/full-snap.ts
