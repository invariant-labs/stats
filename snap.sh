ts-node ./src/snap.ts
ts-node ./src/ticks.ts
ts-node ./src/pool_apy.ts

ts-node ./src/eclipse/snap.ts
ts-node ./src/eclipse/ticks.ts
ts-node ./src/eclipse/pool_apy.ts

jq '.type = "module"' ./package.json > tmp.json && mv tmp.json ./package.json
npx tsx --experimental-wasm-modules ./src/a0/snap.js
jq '.type = "commonjs"' ./package.json > tmp.json && mv tmp.json ./package.json
