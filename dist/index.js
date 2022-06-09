"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signATC = exports.apiSubmitTransactions = exports.apiGetTxnParams = exports.apiGetAccountAssets = exports.testNetClientindexer = exports.testNetClientalgod = exports.ChainType = void 0;
const algosdk_1 = __importDefault(require("algosdk"));
const client_1 = __importDefault(require("@walletconnect/client"));
const algorand_walletconnect_qrcode_modal_1 = __importDefault(require("algorand-walletconnect-qrcode-modal"));
const utils_1 = require("@json-rpc-tools/utils");
const fs = __importStar(require("fs"));
// Create connector
var ChainType;
(function (ChainType) {
    ChainType["MainNet"] = "mainnet";
    ChainType["TestNet"] = "testnet";
})(ChainType = exports.ChainType || (exports.ChainType = {}));
const baseServer = 'https://testnet-algorand.api.purestake.io/ps2';
const baseServerIndexer = 'https://testnet-algorand.api.purestake.io/idx2';
const pport = '';
const token = {
    'X-API-Key': '8YzdhUoWPD7yImg6aDJHr3THI9aA6D68tHYnL0wf',
};
const mainNetClient = new algosdk_1.default.Algodv2('', 'https://algoexplorerapi.io', '');
exports.testNetClientalgod = new algosdk_1.default.Algodv2(token, baseServer, pport);
exports.testNetClientindexer = new algosdk_1.default.Indexer(token, baseServerIndexer, pport);
function clientForChain(chain) {
    switch (chain) {
        case ChainType.MainNet:
            return mainNetClient;
        case ChainType.TestNet:
            return exports.testNetClientalgod;
        default:
            throw new Error(`Unknown chain type: ${chain}`);
    }
}
function apiGetAccountAssets(chain, address) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = clientForChain(chain);
        const accountInfo = yield client
            .accountInformation(address)
            .setIntDecoding(algosdk_1.default.IntDecoding.BIGINT)
            .do();
        const algoBalance = accountInfo.amount;
        const assetsFromRes = accountInfo.assets;
        const assets = assetsFromRes.map(({ 'asset-id': id, amount, creator, frozen }) => ({
            id: Number(id),
            amount,
            creator,
            frozen,
            decimals: 0,
        }));
        assets.sort((a, b) => a.id - b.id);
        yield Promise.all(assets.map((asset) => __awaiter(this, void 0, void 0, function* () {
            const { params } = yield client.getAssetByID(asset.id).do();
            asset.name = params.name;
            asset.unitName = params['unit-name'];
            asset.url = params.url;
            asset.decimals = params.decimals;
        })));
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
    });
}
exports.apiGetAccountAssets = apiGetAccountAssets;
function apiGetTxnParams(chain) {
    return __awaiter(this, void 0, void 0, function* () {
        const params = yield clientForChain(chain).getTransactionParams().do();
        return params;
    });
}
exports.apiGetTxnParams = apiGetTxnParams;
function apiSubmitTransactions(chain, stxns) {
    return __awaiter(this, void 0, void 0, function* () {
        const { txId } = yield clientForChain(chain).sendRawTransaction(stxns).do();
        return yield waitForTransaction(chain, txId);
    });
}
exports.apiSubmitTransactions = apiSubmitTransactions;
function waitForTransaction(chain, txId) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = clientForChain(chain);
        let lastStatus = yield client.status().do();
        let lastRound = lastStatus['last-round'];
        while (true) {
            const status = yield client.pendingTransactionInformation(txId).do();
            if (status['pool-error']) {
                throw new Error(`Transaction Pool Error: ${status['pool-error']}`);
            }
            if (status['confirmed-round']) {
                return status['confirmed-round'];
            }
            lastStatus = yield client.statusAfterBlock(lastRound + 1).do();
            lastRound = lastStatus['last-round'];
        }
    });
}
const walletConnectInit = () => __awaiter(void 0, void 0, void 0, function* () {
    // bridge url
    const bridge = 'https://bridge.walletconnect.org';
    // create new connector
    const connector = new client_1.default({
        bridge,
        qrcodeModal: algorand_walletconnect_qrcode_modal_1.default,
    });
    connector.on('session_update', (error, payload) => __awaiter(void 0, void 0, void 0, function* () {
        console.log(`connector.on("session_update")`);
        if (error) {
            throw error;
        }
        const { accounts } = payload.params[0];
        //this.onSessionUpdate(accounts);
        onSessionUpdate(accounts);
    }));
    connector.on('connect', (error, payload) => {
        console.log(`connector.on("connect")`);
        if (error) {
            throw error;
        }
        onConnect(payload);
    });
    connector.on('disconnect', (error, payload) => {
        console.log(`connector.on("disconnect")`);
        if (error) {
            throw error;
        }
        //onDisconnect();
        if (connector) {
            connector.killSession();
        }
    });
    if (connector.connected) {
        const { accounts } = connector;
        console.log(`connector.connected`);
        const address = accounts[0];
        onSessionUpdate(accounts);
    }
});
const onConnect = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { accounts } = payload.params[0];
    const address = accounts[0];
    console.log(`onConnect: ${address}`);
    getAccountAssets(address, ChainType.TestNet);
});
const onDisconnect = () => __awaiter(void 0, void 0, void 0, function* () { });
const onSessionUpdate = (accounts) => __awaiter(void 0, void 0, void 0, function* () {
    const address = accounts[0];
    //await this.setState({ accounts, address });
    console.log(`onSessionUpdate: ${address}`);
    //await this.getAccountAssets();
    getAccountAssets(address, ChainType.TestNet);
});
const getAccountAssets = (address, chain) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // get account balances
        const assets = yield apiGetAccountAssets(chain, address);
        //await this.setStateAsync({ fetching: false, address, assets });
        console.log(`getAccountAssets: ${assets}`);
    }
    catch (error) {
        console.error(error);
        //await this.setStateAsync({ fetching: false });
    }
});
function walletConnectSigner(txns, connector, address) {
    return __awaiter(this, void 0, void 0, function* () {
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
            const encodedTxn = Buffer.from(algosdk_1.default.encodeUnsignedTransaction(txn)).toString('base64');
            if (algosdk_1.default.encodeAddress(txn.from.publicKey) !== address)
                return { txn: encodedTxn, signers: [] };
            return { txn: encodedTxn };
        });
        // sign transaction
        const requestParams = [txnsToSign];
        /* return txns.map((txn) => {
            return {
                txID: txn.txID(),
                blob: new Uint8Array(),
            };
        }); */
        const request = (0, utils_1.formatJsonRpcRequest)('algo_signTxn', requestParams);
        //console.log('Request param:', request);
        const result = yield connector.sendCustomRequest(request);
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
    });
}
function getSignerWC(connector, address) {
    return (txnGroup, indexesToSign) => __awaiter(this, void 0, void 0, function* () {
        const txns = yield Promise.resolve(walletConnectSigner(txnGroup, connector, address));
        return txns.map((tx) => {
            return tx.blob;
        });
    });
}
function getContractAPI() {
    return __awaiter(this, void 0, void 0, function* () {
        //const resp = await fetch('/d4t.json');
        // Read in the local contract.json file
        const buff = fs.readFileSync('./d4t.json');
        //return new algosdk.ABIContract(await resp.json());
        return new algosdk_1.default.ABIContract(JSON.parse(buff.toString()));
    });
}
function signATC() {
    return __awaiter(this, void 0, void 0, function* () {
        const suggested = yield apiGetTxnParams(ChainType.TestNet);
        const contract = yield getContractAPI();
        console.log(contract);
        // Utility function to return an ABIMethod by its name
        function getMethodByName(name) {
            const m = contract.methods.find((mt) => {
                return mt.name == name;
            });
            if (m === undefined)
                throw Error('Method undefined: ' + name);
            return m;
        }
        const acct = algosdk_1.default.mnemonicToSecretKey('about delay bar pizza item art nerve purpose vivid system assume army basket vote spatial dutch term army top urge link student patient about spray');
        // We initialize the common parameters here, they'll be passed to all the transactions
        // since they happen to be the same
        const commonParams = {
            appID: contract.networks['default'].appID,
            sender: acct.addr,
            suggestedParams: suggested,
            signer: algosdk_1.default.makeBasicAccountTransactionSigner(acct),
        };
        const comp = new algosdk_1.default.AtomicTransactionComposer();
        // Simple ABI Calls with standard arguments, return type
        comp.addMethodCall(Object.assign({ method: getMethodByName('test'), methodArgs: ['ping'] }, commonParams));
        //const pay_txn = getPayTxn(suggested, sw.getDefaultAccount());
        //comp.addTransaction({ txn: pay_txn, signer: sw.getSigner() });
        // This is not necessary to call but it is helpful for debugging
        // to see what is being sent to the network
        const g = comp.buildGroup();
        console.log(g);
        for (const x in g) {
            console.log(g[x].txn.appArgs);
        }
        const result = yield comp.execute(exports.testNetClientalgod, 2);
        console.log(result);
        for (const idx in result.methodResults) {
            console.log(result.methodResults[idx]);
        }
        return result;
    });
}
exports.signATC = signATC;
