# Railway Gmail and Drive connector

The assistant's Hono server calls Google's Gmail and Drive APIs through server-owned read tools. A cloud-hosted LLM never receives Google credentials. A local Codex/ChatGPT MCP connection does not automatically become available to a Railway process; these tools are the application's independent connector.

Implemented tools: `search_gmail`, `read_gmail`, `search_drive`, and `read_drive`. Gmail search hydrates subject/from/to/date/snippets, and reads extract bounded plaintext with inert HTML fallback, without attachments. Drive search returns names/descriptions/links; reads export Docs/Slides text, the **first sheet only** of Sheets as CSV, and small plaintext files. Unsupported binary files return metadata only. Search returns at most five results; reads are bounded and explicitly partial. No sending, modifications, Calendar or arbitrary URL fetching is exposed.

## One-time account setup

1. Choose a Google Cloud project and enable **Gmail API** and **Google Drive API**. Configure its OAuth consent screen for the intended account. A Workspace admin may need to approve access. External apps using Gmail/Drive restricted scopes can require Google verification; testing-mode refresh tokens may expire after seven days. See [Google's OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).
2. Create a **Web application OAuth client**, registering exactly `http://127.0.0.1:8765/oauth2callback` as an authorized redirect URI.
3. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_EXPECTED_ACCOUNT_EMAIL` in the ignored local `.env`. The expected email must be the actual account being authorized. `GOOGLE_REDIRECT_URI` may be omitted; if set, it must equal the registered URI above. An ordinary API key cannot authorize private Gmail or Drive access. Do not paste account passwords or tokens into chat.
4. Run `npm run google:connect` on this computer and open the displayed consent URL. Consent requests only `gmail.readonly` and `drive.readonly`, with offline access. The loopback callback uses PKCE and a random, expiring, single-use state. Before saving anything it verifies the granted scopes and Gmail account email.
5. Successful consent writes only ignored `.env.google` with mode `0600`. An existing file is preserved unless `--force` is explicitly supplied. Restart the local API so its environment includes this file.
6. In the Railway service's secret variables, securely set the five values saved in that file: client ID, client secret, expected account email, redirect URI and refresh token. Do not commit the file or paste its contents into chat. Restart the service after adding variables. The local callback is only for initial consent; Railway uses the refresh token without running a public OAuth endpoint.

No Google account, credentials, or live access were supplied during implementation. Installation/configuration does not mean OAuth has been verified.

## Access and runtime behavior

Only an authenticated server-owned principal explicitly granted `googleAccess: true` may invoke these tools. The root application may provide an explicit development-only operator switch; it must never grant all production members access to the club mailbox or Drive merely because the shared account can read it. Choose the member visibility policy before exposing this account through production chat.

`createGoogleClient().status()` reports `configured`, `oauthVerified`, and a sanitized status without network access. The first permitted tool request obtains or refreshes an access token, verifies both read-only scopes and the expected account, then reads the requested information. The official auth library refreshes expiring access tokens. Invalid/revoked grants return `reauthorization_required`; repeat consent and replace the Railway refresh-token secret. API denial, rate limits, unsupported files, oversized responses and partial content remain explicit. Original links are preserved; data is not copied to Supabase by this connector.

API reference: [Gmail message reads](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get), [Drive text exports](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export), and [Google auth library](https://docs.cloud.google.com/nodejs/docs/reference/google-auth-library/latest).
