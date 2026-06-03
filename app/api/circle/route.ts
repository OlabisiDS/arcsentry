import { NextRequest, NextResponse } from 'next/server';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID!;

export async function POST(req: NextRequest) {
  try {
    const { action, ...params } = await req.json();

    if (action === 'create_wallet') {
      const res = await client.createWallets({
        walletSetId: WALLET_SET_ID,
        blockchains: ['ARC-TESTNET'],
        count: 1,
        accountType: 'EOA',
      });
      const wallet = res.data?.wallets?.[0];
      if (!wallet) throw new Error('Wallet creation failed');
      return NextResponse.json({ walletId: wallet.id, address: wallet.address });
    }

    if (action === 'execute') {
      const { walletId, contractAddress, abiFunctionSignature, abiParameters } = params;
      const res = await client.createContractExecutionTransaction({
        walletId,
        contractAddress,
        abiFunctionSignature,
        abiParameters,
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
      });

      // Circle returns tx directly at res.data, not nested under res.data.transaction
      const txId = res.data?.id;
      if (!txId) throw new Error('Transaction submission failed');

      // Return immediately — don't wait for confirmation
      // The frontend polls loadVaults every 3s and will pick up the state change
      return NextResponse.json({ success: true, txHash: txId, state: 'INITIATED' });
    }

    if (action === 'balance') {
      const { address } = params;
      const res = await fetch('https://rpc.drpc.testnet.arc.network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'eth_call',
          params: [{
            to: '0x3600000000000000000000000000000000000000',
            data: '0x70a08231000000000000000000000000' + address.slice(2).padStart(64, '0'),
          }, 'latest'],
          id: 1,
        }),
      });
      const data = await res.json();
      const hex = data?.result || '0x0';
      const balance = (parseInt(hex, 16) / 1e6).toFixed(2);
      return NextResponse.json({ balance });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (e: any) {
    console.error('Circle API error:', e);
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}