import express, { Application, Request, Response, NextFunction } from 'express';
//import axios from 'axios';
import * as fs from 'fs';
import {
	apiGetAccountAssets,
	apiGetTxnParams,
	ChainType,
	signATC,
	testNetClientalgod,
} from '.';
require('dotenv').config();
import WebSocket from 'ws';
import NodeWalletConnect from '@walletconnect/node';
import { IInternalEvent } from '@walletconnect/types';
import algosdk, { Transaction, TransactionSigner } from 'algosdk';
import { SignTxnParams } from './types';
import { formatJsonRpcRequest } from '@json-rpc-tools/utils';

const PORT = process.env.PORT || 3000;

const app: Application = express();
(BigInt.prototype as any).toJSON = function () {
	return this.toString();
};
app.use(express.json());
app.use(express.static(__dirname + '/'));

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server: server });
const onConnect = async (payload: IInternalEvent) => {
	const { accounts } = payload.params[0];
	const address = accounts[0];

	console.log(`onConnect: ${address}`);
	getAccountAssets(address, ChainType.TestNet);
};

const onDisconnect = async () => {};

const onSessionUpdate = async (accounts: string[]) => {
	const address = accounts[0];
	//await this.setState({ accounts, address });
	console.log(`onSessionUpdate: ${address}`);
	//await this.getAccountAssets();
	getAccountAssets(address, ChainType.TestNet);
};

const getAccountAssets = async (address: string, chain: ChainType) => {
	try {
		// get account balances
		const assets = await apiGetAccountAssets(chain, address);
		//await this.setStateAsync({ fetching: false, address, assets });
		console.log(`getAccountAssets: ${assets}`);
	} catch (error) {
		console.error(error);
		//await this.setStateAsync({ fetching: false });
	}
};
async function walletConnectSigner(
	txns: Transaction[],
	connector: NodeWalletConnect | null,
	address: string
) {
	if (!connector) {
		console.log('No connector found!');
		return txns.map((tx) => {
			return {
				txID: tx.txID(),
				blob: new Uint8Array(),
			};
		});
	}
	const txnsToSign = txns.map((txn) => {
		const encodedTxn = Buffer.from(
			algosdk.encodeUnsignedTransaction(txn)
		).toString('base64');
		if (algosdk.encodeAddress(txn.from.publicKey) !== address)
			return { txn: encodedTxn, signers: [] };
		return { txn: encodedTxn };
	});
	// sign transaction
	const requestParams: SignTxnParams = [txnsToSign];

	/* return txns.map((txn) => {
		return {
			txID: txn.txID(),
			blob: new Uint8Array(),
		};
	}); */

	const request = formatJsonRpcRequest('algo_signTxn', requestParams);
	//console.log('Request param:', request);
	const result: Array<string | null> = await connector.sendCustomRequest(
		request
	);

	console.log('Raw response:', result);
	return result.map((element, idx) => {
		return element
			? {
					txID: txns[idx].txID(),
					blob: new Uint8Array(Buffer.from(element, 'base64')),
			  }
			: {
					txID: txns[idx].txID(),
					blob: new Uint8Array(),
			  };
	});
}
function getSignerWC(
	connector: NodeWalletConnect,
	address: string
): TransactionSigner {
	return async (txnGroup: Transaction[], indexesToSign: number[]) => {
		const txns = await Promise.resolve(
			walletConnectSigner(txnGroup, connector, address)
		);
		return txns.map((tx) => {
			return tx.blob;
		});
	};
}
async function getContractAPI(): Promise<algosdk.ABIContract> {
	//const resp = await fetch('/d4t.json');
	// Read in the local contract.json file
	const buff = fs.readFileSync('./d4t.json');
	//return new algosdk.ABIContract(await resp.json());
	return new algosdk.ABIContract(JSON.parse(buff.toString()));
}

async function wcsignATC(connector: NodeWalletConnect, address: string) {
	const suggested = await apiGetTxnParams(ChainType.TestNet);
	const contract = await getContractAPI();

	console.log(contract);
	// Utility function to return an ABIMethod by its name
	function getMethodByName(name: string): algosdk.ABIMethod {
		const m = contract.methods.find((mt: algosdk.ABIMethod) => {
			return mt.name == name;
		});
		if (m === undefined) throw Error('Method undefined: ' + name);
		return m;
	}

	// We initialize the common parameters here, they'll be passed to all the transactions
	// since they happen to be the same
	const commonParams = {
		appID: contract.networks['default'].appID,
		sender: address,
		suggestedParams: suggested,
		signer: getSignerWC(connector, address),
	};
	const comp = new algosdk.AtomicTransactionComposer();

	// Simple ABI Calls with standard arguments, return type
	comp.addMethodCall({
		method: getMethodByName('test'),
		methodArgs: ['ping'],
		...commonParams,
	});
	//const pay_txn = getPayTxn(suggested, sw.getDefaultAccount());

	//comp.addTransaction({ txn: pay_txn, signer: sw.getSigner() });

	// This is not necessary to call but it is helpful for debugging
	// to see what is being sent to the network
	const g = comp.buildGroup();
	console.log(g);
	for (const x in g) {
		console.log(g[x].txn.appArgs);
	}

	const result = await comp.execute(testNetClientalgod, 2);
	console.log(result);
	for (const idx in result.methodResults) {
		console.log(result.methodResults[idx]);
	}
	return result;
}

wss.on('connection', function connection(ws: WebSocket) {
	console.log('connected new client');
	//ws.send('Welcome new dude!');
	const walletConnector = new NodeWalletConnect(
		{
			bridge: 'https://bridge.walletconnect.org', // Required
		},
		{
			clientMeta: {
				description: 'WalletConnect from NodeJS Client',
				url: 'https://nodejs.org/en/',
				icons: ['https://nodejs.org/static/images/logo.svg'],
				name: 'DeFi4 NFT-Neos',
			},
		}
	);
	ws.on('message', async function incoming(message: string) {
		const msg = message.toString();
		if (msg === 'i') {
			//ws.send('');
		} else if (msg === 'wc') {
			try {
				// Check if connection is already established
				if (!walletConnector.connected) {
					// create new session
					walletConnector.createSession().then(() => {
						// get uri for QR Code modal
						const uri = walletConnector.uri;
						ws.send(uri);
						// encodeURIComponent
					});
				}
				// Subscribe to connection events
				walletConnector.on('connect', (error, payload) => {
					if (error) {
						throw error;
					}

					// Close QR Code Modal
					const { accounts } = payload.params[0];
					const address = accounts[0];
					console.log(`onConnect: ${address}`);
					ws.send(address);
				});

				walletConnector.on('session_update', (error, payload) => {
					if (error) {
						throw error;
					}

					// Get updated accounts
					const { accounts } = payload.params[0];
					onSessionUpdate(accounts);
				});

				walletConnector.on('disconnect', (error, payload) => {
					if (error) {
						throw error;
					}
					// Delete walletConnector
					if (walletConnector) {
						//walletConnector.killSession();
						walletConnector.off;
					}
					walletConnector.connected = false;
				});
			} catch (error) {
				console.error(error);
			}
		} else if (msg === 'sign') {
			if (walletConnector.connected) {
				try {
					await wcsignATC(walletConnector, walletConnector.accounts[0]);
				} catch (error) {}
			}
		}

		//console.log('recieved: %s', message);
		//ws.send('Got message: ' + message);
	});
	ws.on('close', function close() {
		console.log('disconnected');
	});
});

app.get('/', async (req: Request, res: Response, next: NextFunction) => {
	try {
		//const { data } = await axios.get(`https://api.chucknorris.io/jokes/random`);
		const assets = await apiGetAccountAssets(
			ChainType.TestNet,
			'BORRU26OCWXDSDEVY5I64L7HW7WXIAIOC4JPNRITTZWIUQKZDPGBXLGFT4'
		);

		res.status(200).send(assets);
	} catch (error) {
		next(error);
	}
});
app.get('/ping', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const pingRes = await signATC();

		res.status(200).send(pingRes);
	} catch (error) {
		next(error);
	}
});

app.post('/ping/:id', (req: Request, res: Response, next: NextFunction) => {
	const { id } = req.params;
	const { pong } = req.body;

	if (!pong) {
		res.status(418).send({ message: 'Need a PONG!' });
	}
	res.status(201).send({ pong: ` ${pong} and ID ${id}` });
});

server.listen(PORT, () => {
	console.log(`Server started on port ${PORT}`);
});
