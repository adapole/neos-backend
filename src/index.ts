import algosdk from 'algosdk';
require('dotenv').config();

export enum ChainType {
	MainNet = 'mainnet',
	TestNet = 'testnet',
}
export interface IAssetData {
	id: number;
	amount: bigint | number;
	creator: string;
	frozen: boolean;
	decimals: number;
	name?: string;
	unitName?: string;
	url?: string;
}
const baseServer = 'https://testnet-algorand.api.purestake.io/ps2';
const baseServerIndexer = 'https://testnet-algorand.api.purestake.io/idx2';
const pport = '';
const token = {
	'X-API-Key': process.env.PURESTAKE_API ?? '',
};

const mainNetClient = new algosdk.Algodv2('', 'https://algoexplorerapi.io', '');
export const testNetClientalgod = new algosdk.Algodv2(token, baseServer, pport);
export const testNetClientindexer = new algosdk.Indexer(
	token,
	baseServerIndexer,
	pport
);
function clientForChain(chain: ChainType): algosdk.Algodv2 {
	switch (chain) {
		case ChainType.MainNet:
			return mainNetClient;
		case ChainType.TestNet:
			return testNetClientalgod;
		default:
			throw new Error(`Unknown chain type: ${chain}`);
	}
}

export async function apiGetAccountAssets(
	chain: ChainType,
	address: string
): Promise<IAssetData[]> {
	const client = clientForChain(chain);

	const accountInfo = await client
		.accountInformation(address)
		.setIntDecoding(algosdk.IntDecoding.BIGINT)
		.do();

	const algoBalance = accountInfo.amount as bigint;
	const assetsFromRes: Array<{
		'asset-id': bigint;
		amount: bigint;
		creator: string;
		frozen: boolean;
	}> = accountInfo.assets;

	const assets: IAssetData[] = assetsFromRes.map(
		({ 'asset-id': id, amount, creator, frozen }) => ({
			id: Number(id),
			amount,
			creator,
			frozen,
			decimals: 0,
		})
	);

	assets.sort((a, b) => a.id - b.id);

	await Promise.all(
		assets.map(async (asset) => {
			const { params } = await client.getAssetByID(asset.id).do();
			asset.name = params.name;
			asset.unitName = params['unit-name'];
			asset.url = params.url;
			asset.decimals = params.decimals;
		})
	);

	assets.unshift({
		id: 0,
		amount: algoBalance,
		creator: '',
		frozen: false,
		decimals: 6,
		name: 'Algo',
		unitName: 'Algo',
	});

	return assets;
}

export async function apiGetTxnParams(
	chain: ChainType
): Promise<algosdk.SuggestedParams> {
	const params = await clientForChain(chain).getTransactionParams().do();
	return params;
}

export async function apiSubmitTransactions(
	chain: ChainType,
	stxns: Uint8Array[]
): Promise<number> {
	const { txId } = await clientForChain(chain).sendRawTransaction(stxns).do();
	return await waitForTransaction(chain, txId);
}

async function waitForTransaction(
	chain: ChainType,
	txId: string
): Promise<number> {
	const client = clientForChain(chain);

	let lastStatus = await client.status().do();
	let lastRound = lastStatus['last-round'];
	while (true) {
		const status = await client.pendingTransactionInformation(txId).do();
		if (status['pool-error']) {
			throw new Error(`Transaction Pool Error: ${status['pool-error']}`);
		}
		if (status['confirmed-round']) {
			return status['confirmed-round'];
		}
		lastStatus = await client.statusAfterBlock(lastRound + 1).do();
		lastRound = lastStatus['last-round'];
	}
}
