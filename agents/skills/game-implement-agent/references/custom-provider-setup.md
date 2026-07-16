# Custom OpenAI-Compatible Provider Setup

> How to configure a custom OpenAI-compatible API endpoint for both Hermes Agent and OpenCode Serve.

## Hermes Agent

### 1. Add API Key

```bash
echo 'export MY_PROVIDER_API_KEY="sk-..."' >> ~/.hermes/.env
```

### 2. Configure Provider

```bash
hermes config set providers.my-provider.base_url "https://api.example.com/v1"
hermes config set providers.my-provider.key_env MY_PROVIDER_API_KEY
hermes config set providers.my-provider.type openai
hermes config set providers.my-provider.default_model model-name
```

### 3. Switch to Provider

```bash
hermes config set model.provider "custom:my-provider"
hermes config set model.default "model-name"
```

### 4. Restart Gateway

```bash
systemctl --user restart hermes-gateway
```

### Config Result

```yaml
# ~/.hermes/config.yaml
providers:
  my-provider:
    base_url: https://api.example.com/v1
    key_env: MY_PROVIDER_API_KEY
    type: openai
    default_model: model-name

model:
  default: model-name
  provider: custom:my-provider
```

## OpenCode Serve

OpenCode uses `opencode.json` with explicit API key and base URL:

```json
{
  "model": "model-name",
  "apiKey": "sk-...",
  "baseUrl": "https://api.example.com",
  "permission": {
    "*": "allow"
  }
}
```

**Note:** `baseUrl` in OpenCode does NOT include `/v1` — that's appended automatically.

### Multiple Config Files

- `~/workspace/opencode.json` — main config (used by OpenCode CLI)
- `~/workspace/Opencode/opencode.json` — alternative path

Both must be updated when changing providers.

## Connection Testing

```bash
# List models
curl -s https://api.example.com/v1/models \
  -H "Authorization: Bearer $MY_PROVIDER_API_KEY"

# Test chat completion
curl -s -X POST https://api.example.com/v1/chat/completions \
  -H "Authorization: Bearer $MY_PROVIDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"model-name","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'
```

## Pitfalls

- **/v1 path:** Hermes providers append `/v1` to `base_url` automatically? No — the base_url should include `/v1`. OpenCode does NOT append `/v1` automatically.
- **Port in URL:** Custom ports must be in the URL (`https://host:1073/v1`), including the port number.
- **API key in .env:** `hermes config set key_env COCONUT_API_KEY` references the env var name, not the key value. The actual key goes in `~/.hermes/.env`.
- **RPi connectivity:** Some providers use IPs in restricted regions (e.g., China). Test connectivity before switching: `curl -v --connect-timeout 10 https://host:port/v1/models`.
- **Fallback:** Keep the old provider config. To switch back: `hermes config set model.provider deepseek && hermes config set model.default deepseek-v4-flash`.
