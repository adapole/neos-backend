"use strict";
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
const express_1 = __importDefault(require("express"));
const _1 = require(".");
require('dotenv').config();
const PORT = process.env.PORT || 3000;
const app = (0, express_1.default)();
app.use(express_1.default.json());
BigInt.prototype.toJSON = function () {
    return this.toString();
};
app.get('/', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        //const { data } = await axios.get(`https://api.chucknorris.io/jokes/random`);
        const assets = yield (0, _1.apiGetAccountAssets)(_1.ChainType.TestNet, 'BORRU26OCWXDSDEVY5I64L7HW7WXIAIOC4JPNRITTZWIUQKZDPGBXLGFT4');
        res.status(200).send(assets);
    }
    catch (error) {
        next(error);
    }
}));
app.get('/ping', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pingRes = yield (0, _1.signATC)();
        res.status(200).send(pingRes);
    }
    catch (error) {
        next(error);
    }
}));
app.post('/ping/:id', (req, res, next) => {
    const { id } = req.params;
    const { pong } = req.body;
    if (!pong) {
        res.status(418).send({ message: 'Need a PONG!' });
    }
    res.status(201).send({ pong: ` ${pong} and ID ${id}` });
});
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
