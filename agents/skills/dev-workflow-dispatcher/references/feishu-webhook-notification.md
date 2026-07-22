# Feishu Webhook Notification Configuration

## Webhook URL

```
https://open.feishu.cn/open-apis/bot/v2/hook/76101281-b359-49ab-ae2f-fc486bf65958
```

## When to POST

All workflow lifecycle notifications go through this webhook:

| Event | Sender | Format |
|-------|--------|--------|
| Research phase started | cron job (operator spawn) | `📋 #N → research` |
| Plan phase started | cron job (operator spawn) | `📋 #N → plan` |
| Implement phase started | cron job (operator spawn) | `📋 #N → implement` |
| Deploy success | `deploy.yml` (GitHub Action) | `✅ #N → 🚀 <url>` |
| Error / blocked | cron job (operator spawn) | `❌ #N → error: <reason>` |

## Verifed Working

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"msg_type":"text","content":{"text":"✅ test: workflow notification channel"}}' \
  https://open.feishu.cn/open-apis/bot/v2/hook/76101281-b359-49ab-ae2f-fc486bf65958
# Response: {"StatusCode":0,"StatusMessage":"success"}
```

## Rules

- One line per notification. No explanations, no formatting.
- Deploy URL always includes `/gameboy.html` suffix.
- Empty/silent when nothing to report — do NOT send "no events" messages.
