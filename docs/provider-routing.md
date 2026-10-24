# Model provider order and fallback

`LLM_PROVIDERS_JSON` is a private server environment variable containing an ordered JSON array. Chat and the autonomous planner use this same router. The first entry is tried first, followed by the second and third when an earlier provider cannot accept the request.

```json
[
  {
    "provider": "openai-compatible",
    "model": "your-primary-model",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "REPLACE_PRIMARY_KEY"
  },
  {
    "provider": "openai-compatible",
    "model": "your-backup-model",
    "baseUrl": "https://backup.example/v1",
    "apiKey": "REPLACE_BACKUP_KEY"
  }
]
```

Store this as one JSON value in private hosting variables or one quoted line in the ignored `.env`. Real keys never belong in committed files or browser variables. An entry needs an API **base URL**, such as a URL ending in `/v1`, rather than a complete `/chat/completions` or `/messages` endpoint. Use the provider's supported model name.

There may be one through eight entries. Each needs `baseUrl` and `apiKey`. Omitted `provider` and `model` inherit `LLM_PROVIDER` and `LLM_MODEL`. Supported protocols are `openai-compatible` and `anthropic`. A blank or absent list uses the existing `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL` and `LLM_API_KEY` settings. Invalid nonblank JSON or any invalid entry makes model configuration unavailable; a bad list is never silently ignored.

Credit/quota exhaustion and HTTP 401, 402, 403 or 404 move directly to the next entry. Temporary HTTP 408/429, supported server errors and recognized transport failures keep their bounded retries before moving on if time remains. All entries share the original operation timeout. A slow first provider can consume it; listing more providers does not extend it.

Fallback stops once any provider returns HTTP success. A later malformed response, invalid model tool call or broken answer stream fails that operation, including when no answer text has appeared yet. Local validation failures, caller cancellation and required audit-start failures also stop routing. Business tools remain under the existing runner and are never replayed by this router.

Each actual HTTP attempt records the provider, model and hostname used, with its own audit call ID and the same run/operation context. Credentials and raw rejected response bodies are excluded; every configured list key participates in audit redaction. See [private model audits](model-audit.md).

Set the private variable on each service that runs the shared model adapter, including the web service and update worker, and restart/deploy those services after changing it. Existing tool, stage, round and output limits stay unchanged. When every configured provider fails, the existing runner failure behavior still applies. Persistent provider outage pauses, recovery of quarantined messages and saved-task history limits are separate work.

Implementation, independent verification and actual release status are recorded in the [current milestone](../milestones/milestone.md). Sample URLs and keys above are placeholders; they do not create a working backup account.
