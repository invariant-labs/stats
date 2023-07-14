# invariantStats

### Querying archive data

There is an API that allows querying historical data for specific pools
```bash
https://stats.invariant.app/pool_daily_data/[NETWORK]/aggregated/[POOL_ADDRESS]?{limit=N}
```

Below is an example of a query:
```bash
https://stats.invariant.app/pool_daily_data/mainnet/aggregated/BRt1iVYDNoohkL1upEb8UfHE8yji6gEDAmuN9Y4yekyc?limit=10