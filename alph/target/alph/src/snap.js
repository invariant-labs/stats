"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSnapshotForNetwork = exports.getY = void 0;
const alph_sdk_1 = require("@invariant-labs/alph-sdk");
const testnet_json_1 = __importDefault(require("../../data/a0/testnet.json"));
const mainnet_json_1 = __importDefault(require("../../data/a0/mainnet.json"));
const fs = __importStar(require("fs"));
const utils_1 = require("./utils");
const getPairLiquidityValues = async (pool, liquidityTicks) => {
    let liquidityX = 0n;
    let liquidityY = 0n;
    const visitedTicks = [];
    for (let i = 0; i < liquidityTicks.length; i++) {
        let curr = liquidityTicks[i];
        if (visitedTicks.length === 0 || curr.sign) {
            visitedTicks.push(curr);
            continue;
        }
        for (let j = visitedTicks.length - 1; j >= 0; j--) {
            let prev = visitedTicks[j];
            if (!prev.sign) {
                throw new Error("Prev tick must have positive liquidity");
            }
            let liquidityLower = prev.liquidityChange;
            let liquidityUpper = curr.liquidityChange;
            let xVal, yVal;
            let liquidityDelta;
            let lowerTickIndex = prev.index;
            let upperTickIndex = curr.index;
            if (liquidityUpper >= liquidityLower) {
                liquidityDelta = liquidityLower;
                curr.liquidityChange = (liquidityUpper - liquidityLower);
                visitedTicks.pop();
            }
            else {
                liquidityDelta = liquidityUpper;
                prev.liquidityChange = (liquidityLower - liquidityUpper);
            }
            const lowerSqrtPrice = (0, alph_sdk_1.calculateSqrtPrice)(lowerTickIndex);
            const upperSqrtPrice = (0, alph_sdk_1.calculateSqrtPrice)(upperTickIndex);
            try {
                xVal = getX(liquidityDelta, upperSqrtPrice, pool.sqrtPrice, lowerSqrtPrice);
            }
            catch (error) {
                xVal = 0n;
            }
            try {
                yVal = (0, exports.getY)(liquidityDelta, upperSqrtPrice, pool.sqrtPrice, lowerSqrtPrice);
            }
            catch (error) {
                yVal = 0n;
            }
            liquidityX = liquidityX + xVal;
            liquidityY = liquidityY + yVal;
        }
    }
    if (visitedTicks.length !== 0) {
        throw new Error("Ticks were not emptied");
    }
    return { liquidityX, liquidityY };
};
const getX = (liquidity, upperSqrtPrice, currentSqrtPrice, lowerSqrtPrice) => {
    if (upperSqrtPrice <= 0n || currentSqrtPrice <= 0n || lowerSqrtPrice <= 0n) {
        throw new Error("Price cannot be lower or equal 0");
    }
    let denominator;
    let nominator;
    if (currentSqrtPrice >= upperSqrtPrice) {
        return 0n;
    }
    else if (currentSqrtPrice < lowerSqrtPrice) {
        denominator = (lowerSqrtPrice * upperSqrtPrice) / alph_sdk_1.PRICE_DENOMINATOR;
        nominator = upperSqrtPrice - lowerSqrtPrice;
    }
    else {
        denominator = (upperSqrtPrice * currentSqrtPrice) / alph_sdk_1.PRICE_DENOMINATOR;
        nominator = upperSqrtPrice - currentSqrtPrice;
    }
    return (liquidity * nominator) / denominator / alph_sdk_1.LIQUIDITY_DENOMINATOR;
};
const getY = (liquidity, upperSqrtPrice, currentSqrtPrice, lowerSqrtPrice) => {
    if (lowerSqrtPrice <= 0n || currentSqrtPrice <= 0n || upperSqrtPrice <= 0n) {
        throw new Error("Price cannot be 0");
    }
    let difference;
    if (currentSqrtPrice <= lowerSqrtPrice) {
        return 0n;
    }
    else if (currentSqrtPrice >= upperSqrtPrice) {
        difference = upperSqrtPrice - lowerSqrtPrice;
    }
    else {
        difference = currentSqrtPrice - lowerSqrtPrice;
    }
    return (liquidity * difference) / alph_sdk_1.PRICE_DENOMINATOR / alph_sdk_1.LIQUIDITY_DENOMINATOR;
};
exports.getY = getY;
const stringifyPoolKey = (poolKey) => {
    poolKey.feeTier.fee = String(poolKey.feeTier.fee);
    poolKey.feeTier.tickSpacing = String(poolKey.feeTier.tickSpacing);
    return JSON.stringify(poolKey);
};
const getGlobalFee = (feeProtocolTokenX, feeProtocolTokenY, protocolFee) => {
    const feeX = (feeProtocolTokenX * alph_sdk_1.PERCENTAGE_DENOMINATOR) / protocolFee;
    const feeY = (feeProtocolTokenY * alph_sdk_1.PERCENTAGE_DENOMINATOR) / protocolFee;
    return {
        feeX,
        feeY,
    };
};
const getVolume = (feeProtocolTokenX, feeProtocolTokenY, protocolFee, poolKey) => {
    const feeDenominator = (protocolFee * BigInt(poolKey.feeTier.fee)) / alph_sdk_1.PERCENTAGE_SCALE;
    return {
        volumeX: (feeProtocolTokenX * alph_sdk_1.PERCENTAGE_SCALE) / feeDenominator,
        volumeY: (feeProtocolTokenY * alph_sdk_1.PERCENTAGE_SCALE) / feeDenominator,
    };
};
const createSnapshotForNetwork = async (network) => {
    let fileName;
    let snaps;
    let invariantAddress;
    let tokensData = (0, utils_1.getTokensData)(network);
    switch (network) {
        default:
            throw new Error("Network not specified");
        case alph_sdk_1.Network.Testnet:
            fileName = "../data/a0/testnet.json";
            snaps = testnet_json_1.default;
            invariantAddress = alph_sdk_1.INVARIANT_ADDRESS.Testnet;
            break;
        case alph_sdk_1.Network.Mainnet:
            fileName = "../data/a0/mainnet.json";
            snaps = mainnet_json_1.default;
            invariantAddress = alph_sdk_1.INVARIANT_ADDRESS.Mainnet;
    }
    (0, alph_sdk_1.setOfficialNodeProvider)(network);
    const coingeckoPrices = {};
    (await (0, utils_1.getCoingeckoPricesData)(Object.values(tokensData).map((v) => v.coingeckoId))).map((val) => {
        val.current_price = val.current_price * Number(alph_sdk_1.PRICE_DENOMINATOR);
        return (coingeckoPrices[val.id] = val.current_price);
    });
    const invariant = await alph_sdk_1.Invariant.load(invariantAddress);
    const allPoolKeys = await invariant.getAllPoolKeys();
    let poolsData = [];
    const poolPromises = allPoolKeys.map((poolKey) => {
        return invariant.getPool(poolKey);
    });
    const poolsBatchSize = 8;
    let pools = [];
    while (poolPromises.length != 0) {
        const poolsBatch = await Promise.all(poolPromises.splice(0, poolsBatchSize));
        pools = pools.concat(poolsBatch);
    }
    const poolsWithKeys = allPoolKeys.map((poolKey, i) => {
        return [poolKey, pools[i]];
    });
    const protocolFee = await invariant.getProtocolFee();
    for (let [poolKey, pool] of poolsWithKeys) {
        let lastSnapshot;
        const tokenXData = tokensData?.[poolKey.tokenX] ?? {
            decimals: 0,
        };
        const tokenYData = tokensData?.[poolKey.tokenY] ?? {
            decimals: 0,
        };
        const tokenXPrice = BigInt(tokenXData.coingeckoId ? coingeckoPrices[tokenXData.coingeckoId] ?? 0 : 0);
        const tokenYPrice = BigInt(tokenYData.coingeckoId ? coingeckoPrices[tokenYData.coingeckoId] ?? 0 : 0);
        const { feeProtocolTokenX, feeProtocolTokenY } = pool;
        const tickmap = await invariant.getFullTickmap(poolKey);
        const liquidityTicks = await invariant.getAllLiquidityTicks(poolKey, tickmap);
        const stringifiedPoolKey = stringifyPoolKey(poolKey);
        if (snaps?.[stringifiedPoolKey]) {
            lastSnapshot =
                snaps[stringifiedPoolKey].snapshots[snaps[stringifiedPoolKey].snapshots.length - 1];
        }
        let volumeX, volumeY, liquidityX, liquidityY, feeX, feeY;
        try {
            const volumes = getVolume(feeProtocolTokenX, feeProtocolTokenY, protocolFee, poolKey);
            volumeX = volumes.volumeX;
            volumeY = volumes.volumeY;
        }
        catch {
            volumeX = BigInt(lastSnapshot?.volumeX.tokenBNFromBeginning ?? 0n);
            volumeY = BigInt(lastSnapshot?.volumeY.tokenBNFromBeginning ?? 0n);
        }
        try {
            const liq = await getPairLiquidityValues(pool, liquidityTicks);
            liquidityX = liq.liquidityX;
            liquidityY = liq.liquidityY;
        }
        catch (e) {
            liquidityY = BigInt(lastSnapshot?.liquidityX.tokenBNFromBeginning ?? 0n);
            liquidityX = BigInt(lastSnapshot?.liquidityY.tokenBNFromBeginning ?? 0n);
        }
        try {
            const fees = getGlobalFee(feeProtocolTokenX, feeProtocolTokenY, protocolFee);
            feeX = fees.feeX;
            feeY = fees.feeY;
        }
        catch {
            feeX = BigInt(lastSnapshot?.feeX.tokenBNFromBeginning ?? 0n);
            feeY = BigInt(lastSnapshot?.feeY.tokenBNFromBeginning ?? 0n);
        }
        poolsData.push({
            poolKey: stringifiedPoolKey,
            stats: {
                volumeX: {
                    tokenBNFromBeginning: volumeX.toString(),
                    usdValue24: (0, utils_1.getUsdValue24)(volumeX, tokenXData.decimals, tokenXPrice, typeof lastSnapshot !== "undefined"
                        ? BigInt(lastSnapshot.volumeX.tokenBNFromBeginning)
                        : 0n),
                },
                volumeY: {
                    tokenBNFromBeginning: volumeY.toString(),
                    usdValue24: (0, utils_1.getUsdValue24)(volumeY, tokenYData.decimals, tokenYPrice, typeof lastSnapshot !== "undefined"
                        ? BigInt(lastSnapshot.volumeY.tokenBNFromBeginning)
                        : 0n),
                },
                liquidityX: {
                    tokenBNFromBeginning: liquidityX.toString(),
                    usdValue24: (0, utils_1.getUsdValue24)(liquidityX, tokenXData.decimals, tokenXPrice, 0n),
                },
                liquidityY: {
                    tokenBNFromBeginning: liquidityY.toString(),
                    usdValue24: (0, utils_1.getUsdValue24)(liquidityY, tokenYData.decimals, tokenYPrice, 0n),
                },
                feeX: {
                    tokenBNFromBeginning: feeX.toString(),
                    usdValue24: (0, utils_1.getUsdValue24)(feeX, tokenXData.decimals, tokenXPrice, typeof lastSnapshot !== "undefined"
                        ? BigInt(lastSnapshot.feeX.tokenBNFromBeginning)
                        : 0n),
                },
                feeY: {
                    tokenBNFromBeginning: feeY.toString(),
                    usdValue24: (0, utils_1.getUsdValue24)(feeY, tokenYData.decimals, tokenYPrice, typeof lastSnapshot !== "undefined"
                        ? BigInt(lastSnapshot.feeY.tokenBNFromBeginning)
                        : 0n),
                },
            },
        });
    }
    const now = Date.now();
    const timestamp = Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) +
        1000 * 60 * 60 * 12;
    poolsData.forEach(({ poolKey, stats }) => {
        const parsedPoolKey = JSON.parse(poolKey);
        if (!snaps[poolKey]) {
            snaps[poolKey] = {
                snapshots: [],
                tokenX: {
                    address: parsedPoolKey.tokenX,
                    decimals: tokensData?.[parsedPoolKey.tokenX]?.decimals ?? 0,
                },
                tokenY: {
                    address: parsedPoolKey.tokenY,
                    decimals: tokensData?.[parsedPoolKey.tokenY]?.decimals ?? 0,
                },
            };
        }
        snaps[poolKey].snapshots.push({
            timestamp,
            ...stats,
        });
    });
    fs.writeFileSync(fileName, JSON.stringify(snaps));
};
exports.createSnapshotForNetwork = createSnapshotForNetwork;
const main = async () => {
    const mainnet = (0, exports.createSnapshotForNetwork)(alph_sdk_1.Network.Mainnet).then(() => {
        console.log("Mainnet snapshot done!");
    }, (err) => {
        console.log(err);
    });
    const testnet = (0, exports.createSnapshotForNetwork)(alph_sdk_1.Network.Testnet).then(() => {
        console.log("Testnet snapshot done!");
    }, (err) => {
        console.log(err);
    });
    await Promise.allSettled([testnet, mainnet]);
    process.exit(0);
};
main();
