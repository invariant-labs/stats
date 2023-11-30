import { Network, Market, Pair, getMarketAddress, sleep } from '@invariant-labs/sdk-eclipse'
import { PoolStructure } from '@invariant-labs/sdk-eclipse/lib/market'
import { BN, Provider } from '@project-serum/anchor'
import { PublicKey } from '@solana/web3.js'
import fs from 'fs'
import DEVNET_DATA from '../../data/eclipse/devnet.json'
import {
  eclipseDevnetTokensData,
  getTokensPrices,
  getUsdValue24,
  PoolSnapshot,
  PoolStatsData,
  TokenData,
} from '../utils'

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config()

export const createSnapshotForNetwork = async (network: Network) => {
  let provider: Provider
  let fileName: string
  let snaps: Record<string, PoolStatsData>
  let tokensData: Record<string, TokenData>

  switch (network) {
    case Network.DEV:
    default:
      provider = Provider.local('https://staging-rpc.dev.eclipsenetwork.xyz')
      fileName = './data/eclipse/devnet.json'
      snaps = DEVNET_DATA
      tokensData = eclipseDevnetTokensData
  }

  const idsList: string[] = []

  Object.values(tokensData).forEach((token) => {
    if (typeof token?.coingeckoId !== 'undefined') {
      idsList.push(token.coingeckoId)
    }
  })

  const coingeckoPrices = await getTokensPrices(idsList)

  const connection = provider.connection

  const market = await Market.build(
    network,
    provider.wallet,
    connection,
    new PublicKey(getMarketAddress(network))
  )

  const allPools = await market.getAllPools()

  const poolsDict: Record<string, PoolStructure> = {}

  let poolsData: any[] = []

  for (let pool of allPools) {
    const pair = new Pair(pool.tokenX, pool.tokenY, {
      fee: pool.fee.v,
      tickSpacing: pool.tickSpacing,
    })
    const address = await pair.getAddress(market.program.programId)

    poolsDict[address.toString()] = pool

    let lastSnapshot: PoolSnapshot | undefined
    const tokenXData = tokensData?.[pool.tokenX.toString()] ?? {
      decimals: 0,
    }
    const tokenYData = tokensData?.[pool.tokenY.toString()] ?? {
      decimals: 0,
    }
    const tokenXPrice = tokenXData.coingeckoId ? coingeckoPrices[tokenXData.coingeckoId] ?? 0 : 0
    const tokenYPrice = tokenYData.coingeckoId ? coingeckoPrices[tokenYData.coingeckoId] ?? 0 : 0

    if (snaps?.[address.toString()]) {
      lastSnapshot =
        snaps[address.toString()].snapshots[snaps[address.toString()].snapshots.length - 1]
    }

    let volumeX, volumeY, liquidityX, liquidityY, feeX, feeY

    try {
      const volumes = await market.getVolume(pair)
      volumeX = volumes.volumeX
      volumeY = volumes.volumeY
    } catch {
      volumeX = new BN(lastSnapshot?.volumeX.tokenBNFromBeginning ?? '0')
      volumeY = new BN(lastSnapshot?.volumeY.tokenBNFromBeginning ?? '0')
    }

    try {
      const liq = await market.getPairLiquidityValues(pair)
      liquidityX = liq.liquidityX
      liquidityY = liq.liquidityY
    } catch {
      liquidityX = new BN('0')
      liquidityY = new BN('0')
    }

    try {
      const fees = await market.getGlobalFee(pair)
      feeX = fees.feeX
      feeY = fees.feeY
    } catch {
      feeX = new BN(lastSnapshot?.feeX.tokenBNFromBeginning ?? '0')
      feeY = new BN(lastSnapshot?.feeY.tokenBNFromBeginning ?? '0')
    }

    poolsData.push({
      address: address.toString(),
      stats: {
        volumeX: {
          tokenBNFromBeginning: volumeX.toString(),
          usdValue24: getUsdValue24(
            volumeX,
            tokenXData.decimals,
            tokenXPrice,
            typeof lastSnapshot !== 'undefined'
              ? new BN(lastSnapshot.volumeX.tokenBNFromBeginning)
              : new BN(0)
          ),
        },
        volumeY: {
          tokenBNFromBeginning: volumeY.toString(),
          usdValue24: getUsdValue24(
            volumeY,
            tokenYData.decimals,
            tokenYPrice,
            typeof lastSnapshot !== 'undefined'
              ? new BN(lastSnapshot.volumeY.tokenBNFromBeginning)
              : new BN(0)
          ),
        },
        liquidityX: {
          tokenBNFromBeginning: liquidityX.toString(),
          usdValue24: getUsdValue24(liquidityX, tokenXData.decimals, tokenXPrice, new BN(0)),
        },
        liquidityY: {
          tokenBNFromBeginning: liquidityY.toString(),
          usdValue24: getUsdValue24(liquidityY, tokenYData.decimals, tokenYPrice, new BN(0)),
        },
        feeX: {
          tokenBNFromBeginning: feeX.toString(),
          usdValue24: getUsdValue24(
            feeX,
            tokenXData.decimals,
            tokenXPrice,
            typeof lastSnapshot !== 'undefined'
              ? new BN(lastSnapshot.feeX.tokenBNFromBeginning)
              : new BN(0)
          ),
        },
        feeY: {
          tokenBNFromBeginning: feeY.toString(),
          usdValue24: getUsdValue24(
            feeY,
            tokenYData.decimals,
            tokenYPrice,
            typeof lastSnapshot !== 'undefined'
              ? new BN(lastSnapshot.feeY.tokenBNFromBeginning)
              : new BN(0)
          ),
        },
      },
    })
    await sleep(100)
  }
  const now = Date.now()
  const timestamp =
    Math.floor(now / (1000 * 60 * 60 * 24)) * (1000 * 60 * 60 * 24) + 1000 * 60 * 60 * 12

  poolsData.forEach(({ address, stats }) => {
    const xAddress = poolsDict[address].tokenX.toString()
    const yAddress = poolsDict[address].tokenY.toString()

    if (!snaps[address]) {
      snaps[address] = {
        snapshots: [],
        tokenX: {
          address: xAddress,
          decimals: tokensData?.[xAddress]?.decimals ?? 0,
        },
        tokenY: {
          address: yAddress,
          decimals: tokensData?.[yAddress]?.decimals ?? 0,
        },
      }
    }

    snaps[address].snapshots.push({
      timestamp,
      ...stats,
    })
  })

  fs.writeFile(fileName, JSON.stringify(snaps), (err) => {
    if (err) {
      throw err
    }
  })
}

createSnapshotForNetwork(Network.DEV).then(
  () => {
    console.log('Eclipse: Devnet snapshot done!')
  },
  (err) => {
    console.log(err)
  }
)
