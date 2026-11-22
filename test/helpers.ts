import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';

export function executeContext(opts: {
	params: Record<string, unknown>;
	items?: number;
	request: (options: IHttpRequestOptions) => Promise<unknown>;
	continueOnFail?: boolean;
	url?: string;
}): IExecuteFunctions {
	const node = { name: 'c0mpute', type: 'n8n-nodes-c0mpute.c0mpute', typeVersion: 1, parameters: {} };
	return {
		getInputData: () => Array.from({ length: opts.items ?? 1 }, () => ({ json: {} })),
		getCredentials: async () => ({ apiKey: 'test', url: opts.url ?? 'https://c0mpute.com/v1/' }),
		getNodeParameter: (name: string, _i: number, fallback?: unknown) =>
			name in opts.params ? opts.params[name] : fallback,
		getNode: () => node,
		continueOnFail: () => opts.continueOnFail ?? false,
		helpers: {
			httpRequestWithAuthentication: async (_cred: string, options: IHttpRequestOptions) =>
				opts.request(options),
		},
	} as unknown as IExecuteFunctions;
}
