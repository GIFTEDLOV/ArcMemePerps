# Gate 4G — Arc Testnet V2 live evidence

This directory contains sanitized public evidence for the Arc Testnet V2 Gate 4G run.
It contains no private keys, keystore passwords, RPC credentials, or signature material.

- Network: Arc Testnet, chain ID `5042002`
- RPC: `https://rpc.testnet.arc.io`
- Canonical USDC interface: `0x3600000000000000000000000000000000000000`
- Starting canonical head: `692abd3cb9a4d4d034ef6dcfc807e9dea6f454b6`
- Contract source SHA: `0xaf772928c7dff9735b777f5d612a4a64bf2210d72d90c0a51f786e84702f1c7b`
- Backend source SHA: `0xf40a605f189e660163dbe46dfb45349bb90e7d3cbdf2ea679680f6422dbaf52f`

The deployed suite was resumed from existing canonical on-chain addresses. No blind
redeployment was performed after the deployment RPC simulation failure; runtime code was
read and matched against the frozen artifacts before continuing.
