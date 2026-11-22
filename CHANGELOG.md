# Changelog

## 0.1.1

- `c0mpute Chat Model` supports tool calling: tools connected to an AI Agent are sent as OpenAI `tools`, and the model's tool calls (also when streaming) come back to the agent. Tool results go back as `tool` messages. Needs `auto` or a tool-capable model (qwen3:4b, nemotron-3-nano:4b, qwen2.5-coder:7b, ...); see https://c0mpute.com/docs#api.

## 0.1.0

- `c0mpute API` credential (API key, overridable base URL, test request against `GET /v1/models`).
- `c0mpute Chat Model` sub-node for the AI Agent, Basic LLM Chain and other AI root nodes, built on `@n8n/ai-node-sdk` (no runtime dependencies). Supports streaming. Sends string-only message content, as the c0mpute API requires.
- `c0mpute` action node: send a prompt (with an optional system message) and get a chat completion. Usable as an AI Agent tool.
- Model dropdowns are loaded live from `/v1/models` and default to `auto`.
