import { VercelRequest, VercelResponse } from '@vercel/node'
import DEVNET_DATA from '../../data/total_reward_devnet.json'
import MAINNET_DATA from '../../data/total_reward_mainnet.json'

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

  const { net, address, reward }  = req.query

  if (typeof address === 'string' && typeof reward === 'string') {
    if (net === 'devnet') {
      DEVNET_DATA[address] = reward
      res.json({
        data: DEVNET_DATA
      })
    } else if (net === 'mainnet') {
      MAINNET_DATA[address] = reward
      res.json({
        data: MAINNET_DATA
      })
    } else {
      res.status(400).send('INVALID NETWORK')
      return
    }
  } else {
    res.status(400).send('INVALID TYPES')
  }
}
