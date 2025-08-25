# SusuChain

A blockchain-based tontine (susu) smart contract built on the Stacks blockchain using Clarity.

## Overview

SusuChain implements a traditional rotating savings and credit association (ROSCA) system on the blockchain. Participants contribute a fixed amount weekly, and each week one randomly selected participant receives the entire pool. This continues until every participant has received a payout once.

## Features

- **Weekly Contribution System**: Participants contribute a fixed amount each week
- **Random Winner Selection**: Uses pseudo-random selection based on block height
- **Transparent Operations**: All transactions and selections are recorded on-chain
- **Flexible Configuration**: Contract owner can adjust contribution amounts and participant limits
- **Multiple Rounds**: Support for running multiple concurrent rounds
- **Participant Tracking**: Comprehensive tracking of contributions and payouts

## Smart Contract Functions

### Public Functions

- `create-round()` - Create a new susu round (owner only)
- `join-round(round-id)` - Join an active round
- `contribute(round-id)` - Make weekly contribution to a round
- `select-winner(round-id)` - Select weekly winner (owner only)
- `end-round(round-id)` - End a round (owner only)
- `set-contribution-amount(amount)` - Set contribution amount (owner only)
- `set-max-participants(max)` - Set maximum participants (owner only)

### Read-Only Functions

- `get-round(round-id)` - Get round information
- `get-participant-status(round-id, participant)` - Get participant details
- `get-eligible-participants(round-id)` - Get list of eligible winners
- `get-current-week(round-id)` - Get current week of a round
- `is-participant(round-id, participant)` - Check if address is participant

## Project Structure

```
susu_chain/
├── contracts/
│   └── susu-chain.clar          # Main smart contract
├── settings/
│   ├── Devnet.toml              # Development network settings
│   ├── Testnet.toml             # Testnet settings
│   └── Mainnet.toml             # Mainnet settings
├── tests/
│   └── susu-chain.test.ts       # Unit tests
├── Clarinet.toml                # Clarinet configuration
├── package.json                 # Dependencies and scripts
└── vitest.config.js             # Test configuration
```

## Getting Started

### Prerequisites

- [Clarinet](https://docs.hiro.so/stacks/clarinet) - Stacks development toolkit
- Node.js (for running tests)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Travisigho/SusuChain.git
   cd SusuChain/susu_chain
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Development

1. Check contract syntax:
   ```bash
   clarinet check
   ```

2. Run tests:
   ```bash
   npm test
   ```

3. Run tests with coverage:
   ```bash
   npm run test:report
   ```

4. Watch mode for continuous testing:
   ```bash
   npm run test:watch
   ```

### Deployment

Deploy to different networks using Clarinet:

```bash
# Deploy to devnet
clarinet deploy --devnet

# Deploy to testnet
clarinet deploy --testnet
```

## Contract Parameters

- **Default Contribution**: 1 STX (1,000,000 micro-STX)
- **Round Duration**: ~1 week (1,008 blocks)
- **Max Participants**: 52 (allows for yearly cycles)

## How It Works

1. **Round Creation**: Contract owner creates a new round
2. **Joining**: Participants join the round before it starts
3. **Weekly Contributions**: Each week, participants contribute the set amount
4. **Winner Selection**: Contract owner triggers random winner selection
5. **Payout**: Winner receives the total pool for that week
6. **Continuation**: Process repeats until all participants have won once

## Security Features

- Only contract owner can create rounds and select winners
- Participants cannot contribute multiple times per round
- Winners cannot be selected again in the same round
- All operations are transparent and verifiable on-chain

## Testing

The project includes comprehensive unit tests covering:
- Round creation and management
- Participant joining and contribution
- Winner selection logic
- Error handling and edge cases

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Disclaimer

This smart contract is for educational and demonstration purposes. Please conduct thorough testing and security audits before using in production environments.