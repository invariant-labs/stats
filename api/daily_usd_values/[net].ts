import { VercelRequest, VercelResponse } from '@vercel/node'
import DEVNET_DATA from '../../data/devnet.json'
import MAINNET_DATA from '../../data/mainnet.json'
import { PoolStatsData } from '../../src/utils'

export default function (req: VercelRequest, res: VercelResponse) {
  // @ts-expect-error
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  // res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  let snaps: Record<string, PoolStatsData>

  const { net, limit = '10', skip = '0' } = req.query
  if (net === 'devnet') {
    snaps = DEVNET_DATA
  } else if (net === 'mainnet') {
    snaps = MAINNET_DATA
  } else {
    res.status(400).send('INVALID NETWORK')
    return
  }

  const data: Array<{
    timestamp: number
    volumeUSD: number
    tvlUSD: number
    feeUSD: number
  }> = Array(+limit).fill({
    timestamp: 0,
    volumeUSD: 0,
    tvlUSD: 0,
    feeUSD: 0,
  })

  Object.values(snaps).forEach(({ snapshots }) => {
    for (let i = 0; i < +limit; i++) {
      if (snapshots.length - 1 - i - +skip < 0) {
        break
      }

      const snap = snapshots[snapshots.length - 1 - i - +skip]

      data[+limit - 1 - i].timestamp = snap.timestamp
      data[+limit - 1 - i].volumeUSD += snap.volumeX.usdValue24 + snap.volumeY.usdValue24
      data[+limit - 1 - i].tvlUSD += snap.liquidityX.usdValue24 + snap.liquidityY.usdValue24
      data[+limit - 1 - i].feeUSD += snap.feeX.usdValue24 + snap.feeY.usdValue24
    }
  })

  res.json(data)
}
