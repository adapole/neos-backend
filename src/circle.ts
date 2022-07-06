import axios from 'axios';
export const baseUrl = 'https://defi4circle.herokuapp.com';
export const baseUrl2 = 'https://defi4nft.vercel.app';

export const checkStatus = async () => {
	try {
		const { data } = await axios.get(`${baseUrl}/api/status`);
		return data;
	} catch (error) {
		console.error(error);
	}
};
//check if algorand address has a circle-wallet, if it doesn't create circle-wallet
//if it does have a circle wallet, then generate an address

const createWallet = async (
	idempotencyKey: string,
	description: string,
	algorand: string
) => {
	try {
		const { data } = await axios.post(`${baseUrl}/api/wallet`, {});
	} catch (error) {}
};
export const getWallets = async (address: string) => {
	try {
		const headers = {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		};
		const response = await axios.get(`${baseUrl2}/api/getwalletids`, {
			headers,
			data: JSON.stringify({
				address,
			}),
		});
		console.log('walletid get req');
		console.log(response);
		return response.data;
	} catch (error) {
		console.error(error);
	}
};
const getAddress = async () => {
	const health = await checkStatus();
	if (!health.status) return { status: '404' };

	const walletid = 1000955534; //getWalletid(address)
	const response = await axios.get(`${baseUrl}/api/address/${walletid}`);
};
