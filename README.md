# n8n-nodes-c0mpute

[n8n](https://n8n.io/) community nodes for [c0mpute](https://c0mpute.com), a decentralized peer-to-peer network of everyday computers that serve open-weight AI models through an OpenAI-compatible API.

This package gives you:

- **c0mpute Chat Model**: a language model sub-node you can plug into the **Basic LLM Chain**, **AI Agent**, **Question and Answer Chain**, **Summarization Chain** and other n8n AI root nodes.
- **c0mpute**: a regular action node that sends a prompt and returns the answer. It can also be attached to an AI Agent as a tool.
- **c0mpute API** credential.

No runtime dependencies: the chat model is built on n8n's own `@n8n/ai-node-sdk`, which n8n provides.

## Installation

In n8n, open **Settings > Community Nodes > Install** and enter:

```
n8n-nodes-c0mpute
```

Or, for a self-hosted instance from the command line (in your n8n custom nodes folder, usually `~/.n8n/nodes`):

```bash
npm install n8n-nodes-c0mpute
```

See the n8n [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for details. The chat model needs **n8n 2.46.1 or later** (it uses `@n8n/ai-node-sdk`).

## Credentials

1. Sign in at [c0mpute.com/chat](https://c0mpute.com/chat) with CoinPay (a CoinPay DID is required).
2. Open the **keys** tab and create an API key. Keys start with `c0k_`.
3. In n8n, create a **C0mpute API** credential and paste the key.

| Field | Default | Notes |
| --- | --- | --- |
| API Key | | Sent as `Authorization: Bearer c0k_...` |
| Base URL | `https://c0mpute.com/v1` | Only change this if you run your own gateway |

The credential test calls `GET /v1/models`. That endpoint is public, so a passing test confirms the base URL is reachable, not that the key is valid. A bad key shows up as HTTP 401 on the first chat request.

Usage is billed to your account's prepaid compute balance. With an empty balance the account falls back to a small free daily allowance. There is no rate card: each job is a sealed-bid auction among nodes under your cap, the lowest bid wins, and the market takes a 5% fee.

## Nodes

### c0mpute Chat Model

Connect it to the **Model** input of an AI root node.

- **Model**: loaded live from `/v1/models`. Defaults to `auto`, which lets the c0mpute router pick a concrete model per request. Other router aliases: `auto:fast`, `auto:standard`, `auto:high`, `auto:max`. You can also pick a concrete open model such as `qwen3:4b`, `qwen2.5-coder:7b`, `qwen3-coder:30b` or `devstral:24b`.
- **Options**: Maximum Number of Tokens (capped at 8192), Sampling Temperature (0 to 2), Timeout.
- Streaming is supported. Text often arrives in one or a few large chunks rather than token by token.

### c0mpute (action)

Operation **Message a Model**: sends your **Prompt** (plus an optional **System Message**) and returns:

```json
{ "text": "...", "model": "qwen3:4b", "finish_reason": "stop", "usage": { "prompt_tokens": 12, "completion_tokens": 3, "total_tokens": 15 } }
```

Turn off **Simplify Output** to get the raw OpenAI-style response.

## Limitations (read this)

- **Tool calling (AI Agent with tools) works** on `auto` and tool-capable models: `qwen3:4b`, `nemotron-3-nano:4b`, `qwen2.5-coder:7b`, `qwen3-coder:30b` and other qwen3 / qwen2.5-coder / devstral / llama3.1+ builds. Other models answer a tool request with an error that names the ones that work. The chat model asks for one tool call per turn (the agent loops for the next).
- **Text only.** Images and files are dropped; text content is sent as plain strings.
- **Variable speed and quality.** Models are open-weight (mostly 0.5B to 30B) and run on community nodes. Answers can take from seconds to a minute or more (auction plus queue), and quality varies by node and model. A listed model may have no live node at a given moment (`no live node serves model ...`) and busy periods can return `Network is busy. Run a node or wait.` Use `auto` for the best chance of an answer.
- **Limits:** up to 200 messages and 200,000 characters per request, `max_tokens` up to 8192. Context windows are not published per model, so keep prompts modest.
- `response_format` (JSON mode) is only a routing hint on c0mpute and is not sent by these nodes.

## Example workflow

1. **When chat message received** trigger.
2. **Basic LLM Chain** node.
3. Attach **c0mpute Chat Model** (model `auto`) to the chain's **Model** input.
4. Open the chat and send a message.

## Run a node

c0mpute is powered by people running nodes. Earn from your spare CPU or GPU:

```bash
curl -fsSL https://c0mpute.com/install.sh | sh
```

## Development

```bash
npm install
npm run lint
npm test          # unit tests
npm run build
C0MPUTE_API_KEY=c0k_... npm test   # also runs the live API tests
npm run dev       # starts n8n with this package loaded
```

## Resources

- [c0mpute](https://c0mpute.com) and its [API docs](https://c0mpute.com/docs)
- [c0mpute source](https://github.com/profullstack/c0mpute)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
