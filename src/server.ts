import express, { Application, Request, Response, NextFunction } from 'express';
import sha512 from 'js-sha512';
import * as fs from 'fs';
import {
	apiGetAccountAssets,
	apiGetTxnParams,
	apiSubmitTransactions,
	ChainType,
	testNetClientalgod,
} from '.';
require('dotenv').config();
import WebSocket from 'ws';
import NodeWalletConnect from '@walletconnect/node';
import { IInternalEvent } from '@walletconnect/types';
import algosdk, {
	OnApplicationComplete,
	Transaction,
	TransactionSigner,
} from 'algosdk';
import { IWalletTransaction, SignTxnParams } from './types';
import { formatJsonRpcRequest } from '@json-rpc-tools/utils';
import { create } from 'ipfs-http-client';
const PORT = process.env.PORT || 3000;

const app: Application = express();
(BigInt.prototype as any).toJSON = function () {
	return this.toString();
};
app.use(express.json());
app.use(express.static(__dirname + '/'));

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server: server });
const ipfs = create({
	host: 'ipfs.infura.io',
	port: 5001,
	protocol: 'https',
});

/**
 * Returns Uint8array of LogicSig from ipfs, throw error
 * @param ipfsPath hash string of ipfs path
 */
const borrowGetLogic = async (ipfsPath: string): Promise<Uint8Array> => {
	const chunks = [];
	for await (const chunk of ipfs.cat(ipfsPath)) {
		chunks.push(chunk);
	}
	//console.log(chunks);
	//setBorrowLogicSig(chunks[0]);
	return chunks[0];
};

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

	const request = formatJsonRpcRequest('algo_signTxn', requestParams);
	//console.log('Request param:', request);
	const result: string[] = await connector.sendCustomRequest(request);

	//console.log('Raw response:', result);
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

async function wcborrow(
	connector: NodeWalletConnect,
	address: string,
	xid: number,
	loanamt: number,
	collateralamt: number
) {
	const suggested = await apiGetTxnParams(ChainType.TestNet);
	const suggestedParams = await apiGetTxnParams(ChainType.TestNet);
	const contract = await getContractAPI();

	//console.log(contract);
	// Utility function to return an ABIMethod by its name
	function getMethodByName(name: string): algosdk.ABIMethod {
		const m = contract.methods.find((mt: algosdk.ABIMethod) => {
			return mt.name == name;
		});
		if (m === undefined) throw Error('Method undefined: ' + name);
		return m;
	}
	const signer = getSignerWC(connector, address);
	suggested.flatFee = true;
	suggested.fee = 4000;
	// We initialize the common parameters here, they'll be passed to all the transactions
	// since they happen to be the same
	const commonParams = {
		appID: contract.networks['default'].appID,
		sender: address,
		suggestedParams: suggested,
		//onComplete: OnApplicationComplete.NoOpOC,
		signer: signer,
	};
	const comp = new algosdk.AtomicTransactionComposer();
	//'QmNU1gEgZKnMAL9gEWdWXAmuaDguUFhbGYqLw4p1iCGrSc' //'QmRY9HMe2fb6HAJhywnTTYQamLxQV9qJbjVeK7Wa314TeR' 'QmdvvuGptFDAoB6Vf9eJcPeQTKi2MjA3AnEv47syNPz6CS'
	const borrowLogic = await borrowGetLogic(
		'QmXJWc7jeSJ7F2Cc4cm6SSYdMnAiCG4M4gfaiQXvDbdAbL' //'QmWFR6jSCaqfxjVK9S3PNNyyCh35kYx5sGgwi7eZAogpD9' //'QmciTBaxmKRF9fHjJP7q83f9nvBPf757ocbyEvTnrMttyM' //'QmdHj2MHo6Evzjif3RhVCoMV2RMqkxvcZqLP946cN77ZEN' //'QmfWfsjuay1tJXJsNNzhZqgTqSj3CtnMGtu7NK3bVtdh6k' //'QmPubkotHM9iArEoRfntSB6VwbYBLz19c1uxmTp4FYJzbk' //'QmaDABqWt3iKso3YjxRRBCj4HJqqeerAvrBeLTMTTz7VzY' //'QmbbDFKzSAbBpbmhn9b31msyMz6vnZ3ZvKW9ebBuUDCyK9' //'QmYoFqC84dd7K5nCu5XGyWGyqDwEs7Aho8j46wqeGRfuJq' //'QmaGYNdQaj2cygMxxDQqJie3vfAJzCa1VBstReKY1ZuYjK'
	);
	//console.log(borrowLogic);
	const borrowLogicSig = borrowLogic;
	const addressLogicSig =
		'KLNYAXOWHKBHUKVDDWFOSXNHYDS45M3KJW4HYJ6GOQB4LGAH4LJF57QVZI';
	const amountborrowing = 1000000;
	const xids = [xid];
	const camt = [collateralamt];
	const lamt = [loanamt];
	const USDC = 10458941;
	const DUSD = 84436770;
	const MNG = 84436122;
	const LQT = 84436752;
	/* let lsiga = algosdk.logicSigFromByte(borrowLogicSig);
	console.log(lsiga);
	console.log(lsiga.toByte()); */

	console.log('Logic sig here');
	let lsig = algosdk.LogicSigAccount.fromByte(borrowLogicSig);
	console.log(lsig.verify());
	//console.log(lsig.toByte());
	suggestedParams.flatFee = true;
	suggestedParams.fee = 0;
	const ptxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		from: addressLogicSig, //Lender address
		to: address,
		amount: amountborrowing,
		assetIndex: USDC,
		suggestedParams,
	});

	// Construct TransactionWithSigner
	const tws = {
		txn: ptxn,
		signer: algosdk.makeLogicSigAccountTransactionSigner(lsig),
	};

	comp.addMethodCall({
		method: getMethodByName('borrow'),
		methodArgs: [
			tws,
			xids,
			camt,
			lamt,
			addressLogicSig,
			xids[0],
			DUSD,
			MNG,
			LQT,
		],
		...commonParams,
	});
	//const pay_txn = getPayTxn(suggested, sw.getDefaultAccount());

	//comp.addTransaction({ txn: pay_txn, signer: sw.getSigner() });

	// This is not necessary to call but it is helpful for debugging
	// to see what is being sent to the network
	const g = comp.buildGroup();
	console.log(g);
	for (const x in g) {
		//console.log(g[x].txn.appArgs);
	}

	const result = await comp.execute(testNetClientalgod, 2);
	console.log(result);
	for (const idx in result.methodResults) {
		//console.log(result.methodResults[idx]);
	}
	return result;
}

async function optinD4T(connector: NodeWalletConnect, address: string) {
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
	const signer = getSignerWC(connector, address);
	// We initialize the common parameters here, they'll be passed to all the transactions
	// since they happen to be the same
	const commonParams = {
		appID: contract.networks['default'].appID,
		sender: address,
		suggestedParams: suggested,
		onComplete: OnApplicationComplete.OptInOC,
		signer: signer,
	};
	const comp = new algosdk.AtomicTransactionComposer();

	const MNG = 84436122;

	comp.addMethodCall({
		method: getMethodByName('optin'),
		methodArgs: [MNG],
		...commonParams,
	});
	//const pay_txn = getPayTxn(suggested, sw.getDefaultAccount());

	//comp.addTransaction({ txn: pay_txn, signer: sw.getSigner() });

	// This is not necessary to call but it is helpful for debugging
	// to see what is being sent to the network
	const g = comp.buildGroup();
	console.log(g);

	const result = await comp.execute(testNetClientalgod, 2);
	console.log(result);

	return result;
}

async function borrowHack(
	address: string,
	xid: number,
	loanamt: number,
	collateralamt: number
) {
	const suggestedParams = await apiGetTxnParams(ChainType.TestNet);

	const addressLogicSig =
		'KLNYAXOWHKBHUKVDDWFOSXNHYDS45M3KJW4HYJ6GOQB4LGAH4LJF57QVZI';
	const amountborrowing = loanamt * 1000000;
	const assetID = algosdk.encodeUint64(xid);
	const camt = algosdk.encodeUint64(collateralamt);
	const lamt = algosdk.encodeUint64(amountborrowing);
	const APP_ID = 84436769;
	const USDC = 10458941;
	const DUSD = 84436770;
	const MNG = 84436122;
	const LQT = 84436752;
	const methodhash: Uint8Array = new Uint8Array(
		sha512.sha512_256
			.array(
				'borrow(uint64,uint64,uint64,account,asset,asset,application,application)void'
			)
			.slice(0, 4)
	);

	suggestedParams.flatFee = true;
	suggestedParams.fee = 0;
	const txn1 = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		from: addressLogicSig, //Lender address
		to: address,
		amount: amountborrowing,
		assetIndex: USDC,
		suggestedParams,
	});

	suggestedParams.fee = 4000;
	const txn2 = algosdk.makeApplicationNoOpTxnFromObject({
		from: address,
		appIndex: APP_ID,
		appArgs: [methodhash, assetID, camt, lamt],
		foreignApps: [MNG, LQT],
		foreignAssets: [xid, DUSD],
		accounts: [addressLogicSig], //Lender address
		suggestedParams,
	});
	const txnsToSign = [{ txn: txn1, signers: [] }, { txn: txn2 }];
	algosdk.assignGroupID(txnsToSign.map((toSign) => toSign.txn));

	return [txnsToSign];
}
const borrowAppCall: Scenario = async (
	address: string,
	xid: number,
	loanamt: number,
	collateralamt: number
): Promise<ScenarioReturnType> => {
	return await borrowHack(address, xid, loanamt, collateralamt);
};
const Borrowscenarios: Array<{ name: string; scenario1: Scenario }> = [
	{
		name: 'Borrow',
		scenario1: borrowAppCall,
	},
];
async function signTxnLogic(
	scenario1: Scenario,
	connector: NodeWalletConnect,
	address: string,
	xid: number,
	loanamt: number,
	collateralamt: number
) {
	try {
		const txnsToSign = await scenario1(address, xid, loanamt, collateralamt);
		const flatTxns = txnsToSign.reduce((acc, val) => acc.concat(val), []);

		const walletTxns: IWalletTransaction[] = flatTxns.map(
			({ txn, signers, authAddr, message }) => ({
				txn: Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString(
					'base64'
				),
				signers, // TODO: put auth addr in signers array
				authAddr,
				message,
			})
		);
		// sign transaction
		const requestParams: SignTxnParams = [walletTxns];
		const request = formatJsonRpcRequest('algo_signTxn', requestParams);
		//console.log('Request param:', request);
		const result: Array<string | null> = await connector.sendCustomRequest(
			request
		);
		const indexToGroup = (index: number) => {
			for (let group = 0; group < txnsToSign.length; group++) {
				const groupLength = txnsToSign[group].length;
				if (index < groupLength) {
					return [group, index];
				}

				index -= groupLength;
			}

			throw new Error(`Index too large for groups: ${index}`);
		};

		const signedPartialTxns: Array<Array<Uint8Array | null>> = txnsToSign.map(
			() => []
		);
		result.forEach((r, i) => {
			const [group, groupIndex] = indexToGroup(i);
			const toSign = txnsToSign[group][groupIndex];

			if (r == null) {
				if (toSign.signers !== undefined && toSign.signers?.length < 1) {
					signedPartialTxns[group].push(null);
					return;
				}
				throw new Error(
					`Transaction at index ${i}: was not signed when it should have been`
				);
			}

			if (toSign.signers !== undefined && toSign.signers?.length < 1) {
				throw new Error(
					`Transaction at index ${i} was signed when it should not have been`
				);
			}

			const rawSignedTxn = Buffer.from(r, 'base64');
			signedPartialTxns[group].push(new Uint8Array(rawSignedTxn));
		});

		const borrowLogic = await borrowGetLogic(
			'QmXJWc7jeSJ7F2Cc4cm6SSYdMnAiCG4M4gfaiQXvDbdAbL'
		);

		console.log('Logic sig here');
		let lsig = algosdk.LogicSigAccount.fromByte(borrowLogic);
		console.log(lsig.verify());

		const signTxnLogicSigWithTestAccount = (
			txn: algosdk.Transaction
		): Uint8Array => {
			let signedTxn = algosdk.signLogicSigTransactionObject(txn, lsig);
			//console.log(signedTxn.txID);
			return signedTxn.blob;
		};
		const signedTxns: Uint8Array[][] = signedPartialTxns.map(
			(signedPartialTxnsInternal, group) => {
				return signedPartialTxnsInternal.map((stxn, groupIndex) => {
					if (stxn) {
						return stxn;
					}

					return signTxnLogicSigWithTestAccount(
						txnsToSign[group][groupIndex].txn
					);
				});
			}
		);
		signedTxns.forEach(async (signedTxn, index) => {
			try {
				const confirmedRound = await apiSubmitTransactions(
					ChainType.TestNet,
					signedTxn
				);
				console.log(`Transaction confirmed at round ${confirmedRound}`);
			} catch (err) {
				console.error(`Error submitting transaction: `, err);
			}
		});
	} catch (error) {}
}
export interface IScenarioTxn {
	txn: algosdk.Transaction;
	signers?: string[];
	authAddr?: string;
	message?: string;
}

export type ScenarioReturnType = IScenarioTxn[][];
export type Scenario = (
	address: string,
	xid: number,
	loanamt: number,
	collateralamt: number
) => Promise<ScenarioReturnType>;

async function repay(
	connector: NodeWalletConnect,
	address: string,
	xid: number,
	repayamt: number
) {
	const suggested = await apiGetTxnParams(ChainType.TestNet);
	const suggestedParams = await apiGetTxnParams(ChainType.TestNet);
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
	const signer = getSignerWC(connector, address);
	suggested.flatFee = true;
	suggested.fee = 3000;
	// We initialize the common parameters here, they'll be passed to all the transactions
	// since they happen to be the same
	const commonParams = {
		appID: contract.networks['default'].appID,
		sender: address,
		suggestedParams: suggested,
		signer: signer,
	};
	const comp = new algosdk.AtomicTransactionComposer();

	const APP_ID = contract.networks['default'].appID;
	const xids = [xid];
	const ramt = [repayamt];
	const USDC = 10458941;
	const MNG = 84436122;
	const LQT = 84436752;
	suggestedParams.flatFee = true;
	suggestedParams.fee = 0;
	const ptxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		from: address,
		to: algosdk.getApplicationAddress(APP_ID),
		amount: ramt[0],
		assetIndex: USDC,
		suggestedParams,
	});
	const tws = {
		txn: ptxn,
		signer: signer,
	};

	comp.addMethodCall({
		method: getMethodByName('repay'),
		methodArgs: [tws, xids, ramt, xids[0], MNG, LQT],
		...commonParams,
	});
	//const pay_txn = getPayTxn(suggested, sw.getDefaultAccount());

	//comp.addTransaction({ txn: pay_txn, signer: sw.getSigner() });

	// This is not necessary to call but it is helpful for debugging
	// to see what is being sent to the network
	const g = comp.buildGroup();
	console.log(g);

	const result = await comp.execute(testNetClientalgod, 2);
	console.log(result);

	return result;
}

async function claim(
	connector: NodeWalletConnect,
	address: string,
	xid: number,
	claimamt: number
) {
	const suggested = await apiGetTxnParams(ChainType.TestNet);
	const suggestedParams = await apiGetTxnParams(ChainType.TestNet);
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
	const signer = getSignerWC(connector, address);
	suggested.flatFee = true;
	suggested.fee = 3000;
	// We initialize the common parameters here, they'll be passed to all the transactions
	// since they happen to be the same
	const commonParams = {
		appID: contract.networks['default'].appID,
		sender: address,
		suggestedParams: suggested,
		signer: signer,
	};
	const comp = new algosdk.AtomicTransactionComposer();

	const APP_ID = contract.networks['default'].appID;
	const xids = [xid];
	const claamt = [claimamt];
	const USDC = 10458941;
	const DUSD = 84436770;
	const MNG = 84436122;
	const LQT = 84436752;
	suggestedParams.flatFee = true;
	suggestedParams.fee = 0;
	const ptxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		from: address,
		to: algosdk.getApplicationAddress(APP_ID),
		amount: claamt[0],
		assetIndex: DUSD,
		suggestedParams,
	});
	const tws = {
		txn: ptxn,
		signer: signer,
	};

	comp.addMethodCall({
		method: getMethodByName('claim'),
		methodArgs: [tws, USDC, MNG],
		...commonParams,
	});
	//const pay_txn = getPayTxn(suggested, sw.getDefaultAccount());

	//comp.addTransaction({ txn: pay_txn, signer: sw.getSigner() });

	// This is not necessary to call but it is helpful for debugging
	// to see what is being sent to the network
	const g = comp.buildGroup();
	console.log(g);

	const result = await comp.execute(testNetClientalgod, 2);
	console.log(result);

	return result;
}
// create a json making function from a string input of the form:
// borrow,xid,lamt,camt
// the json will be {type: 'borrow', values:{ xid: xid, lamt: lamt, camt: camt}}
function makeJsonFromString(str: string) {
	const arr = str.split(',');
	if (arr.length < 1) return { type: str, values: {} };
	const type = arr[0];
	const xid = arr[1];
	const amt = arr[2];
	let camt = '';
	//if(arr.length > 3) {}
	if (type === 'borrow') {
		camt = arr[3];
	}

	return { type: type, values: { xid, amt, camt } };
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
				description: 'WalletConnect for DeFi4NFT; to Neos metaverse connection',
				url: 'https://defi4nft.herokuapp.com',
				icons: ['https://nodejs.org/static/images/logo.svg'],
				name: 'DeFi4NFT | Neos',
			},
		}
	);

	ws.on('message', async function incoming(message: string) {
		const msg = message.toString();
		if (msg === 'i') {
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
		} else if (msg === 'optin') {
			if (walletConnector.connected) {
				console.log('optin');
				try {
					await optinD4T(walletConnector, walletConnector.accounts[0]);
				} catch (error) {
					console.log(error);
				}
			}
		} else if (msg === 'close') {
			console.log('closing...');
			ws.close();
		}
		try {
			if (msg !== 'i' && msg !== 'wc') {
				const jformat = makeJsonFromString(msg);
				console.log(jformat);
				if (jformat.type === 'borrow') {
					if (walletConnector.connected) {
						console.log('borrow');
						try {
							//check if xid, amt and camt are present
							if (
								jformat.values.xid &&
								jformat.values.amt &&
								jformat.values.camt
							) {
								const xid: number = Number(jformat.values.xid); //97931298
								const loanamt: number = Number(jformat.values.amt);
								const collateralamt: number = Number(jformat.values.camt);
								/* await wcborrow(
									walletConnector,
									walletConnector.accounts[0],
									xid,
									loanamt,
									collateralamt
								); */
								Borrowscenarios.map(({ name, scenario1 }) =>
									signTxnLogic(
										scenario1,
										walletConnector,
										walletConnector.accounts[0],
										xid,
										loanamt,
										collateralamt
									)
								);
							}
						} catch (error) {
							console.log(error);
						}
					}
				} else if (jformat.type === 'repay') {
					if (walletConnector.connected) {
						console.log('repay');
						try {
							//check if xid, amt and camt are present
							if (
								jformat.values.xid &&
								jformat.values.amt //jformat.values.camt
							) {
								const xid: number = Number(jformat.values.xid);
								const repayamt: number = Number(jformat.values.amt) * 1000000;
								await repay(
									walletConnector,
									walletConnector.accounts[0],
									xid,
									repayamt
								);
							}
						} catch (error) {
							console.log(error);
						}
					}
				} else if (jformat.type === 'claim') {
					if (walletConnector.connected) {
						console.log('claim');
						try {
							if (jformat.values.xid) {
								const xid: number = Number(jformat.values.xid);
								const claimamt: number = Number(jformat.values.amt) * 1000000;
								await claim(
									walletConnector,
									walletConnector.accounts[0],
									xid,
									claimamt
								);
							}
						} catch (error) {
							console.log(error);
						}
					}
				}
			}
		} catch (error) {}
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
		//const pingRes = await signATC();

		res.status(200).send('pingRes');
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
