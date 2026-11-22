import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export const C0MPUTE_DEFAULT_BASE_URL = 'https://c0mpute.com/v1';

export class C0mputeApi implements ICredentialType {
	name = 'c0mputeApi';

	displayName = 'C0mpute API';

	icon: Icon = { light: 'file:../icons/c0mpute.svg', dark: 'file:../icons/c0mpute.dark.svg' };

	documentationUrl = 'https://github.com/profullstack/n8n-nodes-c0mpute#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'c0k_...',
			description:
				'Your c0mpute API key (starts with c0k_). Create one in the keys tab of https://c0mpute.com/chat.',
		},
		{
			displayName: 'Base URL',
			name: 'url',
			type: 'string',
			default: C0MPUTE_DEFAULT_BASE_URL,
			description:
				'OpenAI-compatible base URL of the c0mpute API. Only change this if you run your own gateway.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials?.url || "https://c0mpute.com/v1"}}',
			url: '/models',
			method: 'GET',
		},
	};
}
