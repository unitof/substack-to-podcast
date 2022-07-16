const axios = require('axios')

const response = function({substackEmail, substackPassword}={}) {
	axios.post(
		'https://substack.com/api/v1/login',
		{
		  "email": substackEmail,
		  "for_pub": "",
		  "redirect": "\/",
		  "password": substackPassword,
		  "captcha_response": null
		},
		{
			headers: {
				'Host': 'substack.com',
				'Content-Type': 'application/json',
				'Origin': 'https://substack.com',
				'Accept-Encoding': 'gzip, deflate, br',
				'Connection': 'keep-alive',
				'Accept': '*/*',
				'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15',
				'Referer': 'https://substack.com/sign-in?redirect=%2F',
				'Accept-Language': 'en-US,en;q=0.9'
			}
		}
	)
}

export default response
