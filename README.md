# Historical data

The historical data is available inside the `/data` directory. The content of these files is described below:

Pool data is stored in the files below, depending on the network's location:
- Solana: `mainnet.json`
- Solana devnet: `devnet.json`
- Eclipse devnet: `eclipse/devnet.json`

All of this data has the same JSON structure:

```Typescript
 {
    [address: string]: {
        snapshots: [
            {
               timestamp: number, // ASC
               volumeX: TokenAmount,
               volumeY: TokenAmount,
               liquidityX: TokenAmount,
               liquidityY: TokenAmount,
               feeX: TokenAmount,
               feeY: TokenAmount,
            }
        ]
        tokenX: TokenInfo
        tokenY: TokenInfo
    } 
}

interface TokenInfo {
    address: string,
    decimals: number

}

interface TokenAmount {
    tokenBNFromBeginning: string, // token amount (program format)
    usdValue24: number
}
```

# Generated data

List of snapshot files:
- data/devnet.json
- data/input_mainnet_pool_apy.json
- data/mainnet.json
- data/pool_apy_archive_devnet.json
- data/pool_apy_archive_mainnet.json
- data/pool_apy_devnet.json
- data/pool_apy_mainnet.json
- data/ticks
    - devnet
        - [tick_address.json]
        - ...
    - mainnet
        - [tick_address.json]
        - ...


# Querying archive data

There is an API that allows querying historical data for specific pools
```bash
https://stats.invariant.app/pool_daily_data/[NETWORK]/aggregated/[POOL_ADDRESS]?{limit=N}
```

Below is an example of a query:
```bash
https://stats.invariant.app/pool_daily_data/mainnet/aggregated/BRt1iVYDNoohkL1upEb8UfHE8yji6gEDAmuN9Y4yekyc?limit=10
```

# Most popular pool addresses

| Token X                                          | Token Y                                          | Fee      | Address                                                                                                     |
|--------------------------------------------------|--------------------------------------------------|----------|-------------------------------------------------------------------------------------------------------------|
| [USDC](https://solscan.io/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)         | [USDT](https://solscan.io/token/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB)         | 0.001%  | [BRt1iVYDNoohkL1upEb8UfHE8yji6gEDAmuN9Y4yekyc](https://solscan.io/account/BRt1iVYDNoohkL1upEb8UfHE8yji6gEDAmuN9Y4yekyc) |
| [stSOL](https://solscan.io/token/7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj)        | [mSOL](https://solscan.io/token/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So)         | 0.01%    | [HbMbeaDH8xtB1a8WpwjNqcXBBGraKJjJ2xFkXEdAy1rY](https://solscan.io/account/HbMbeaDH8xtB1a8WpwjNqcXBBGraKJjJ2xFkXEdAy1rY)  |
| [SNY](https://solscan.io/token/4dmKkXNHdgYsXqBHCuMikNQWwVomZURhYvkkX5c4pQ7y)          | [USDC](https://solscan.io/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)         | 0.3%     | [AvNeVrKZy1FaEG9suboRXNPgmnMwomiU5EvkF6jGxGrX](https://solscan.io/account/AvNeVrKZy1FaEG9suboRXNPgmnMwomiU5EvkF6jGxGrX) |