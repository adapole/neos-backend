import express, { Application, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { apiGetAccountAssets, ChainType, signATC } from '.';
require('dotenv').config();
const PORT = process.env.PORT || 3000;

const app: Application = express();

app.use(express.json());
(BigInt.prototype as any).toJSON = function () {
	return this.toString();
};
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

app.listen(PORT, () => {
	console.log(`Server started on port ${PORT}`);
});
