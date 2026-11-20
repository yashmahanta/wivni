# BSc Math Exam Assistant — OmniRoute failover routing

The website sends every math request to the OmniRoute combo named `website-failover`. The combo tries its 10 configured models in priority order and moves to the next target after its configured 5-second target timeout. The website does not make a second, competing fallback loop.

## Update your existing Vercel project

1. Extract this ZIP and upload/commit its **contents**, not the ZIP file, to the root of the existing GitHub repository. Keep the `api/` and `components/` directories as directories. Commit to the same branch connected to Vercel.
2. In **Vercel → Project → Settings → Environment Variables**, configure the values from `.env.example`: `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY`, `SITE_ACCESS_CODE`, `AI_MODEL_PRIORITY=website-failover`, `AI_TARGET_TIMEOUT_MS=5000`, and `AI_TOTAL_TIMEOUT_MS=65000`. Apply them to Production and Preview if you use both.
3. Redeploy to apply environment variable changes and verify the deployment is **Ready**. If necessary, use **Deployments → latest deployment → Redeploy** after saving variables.
4. Open `https://YOUR-VERCEL-DOMAIN/api/generate`. It should respond with availability for `website-failover`. Use a small example image to test actual inference.

### Important gateway requirements

Your **OmniRoute API key** must be allowed to call `website-failover`, and OmniRoute must have active credentials for the targets in that combo. The `AI_TARGET_TIMEOUT_MS` value documents the 5-second gateway setting; the combo itself enforces the per-target timeout. The web server applies `AI_TOTAL_TIMEOUT_MS`, which must remain above the combo's 60-second timeout.

### Development

```bash
npm install
cp .env.example .env.local
# Set a real gateway API key in .env.local; never commit it.
npm run dev
```

The `vite.config.ts` dev handler and Vercel serverless endpoint use the same `api/generate.ts`. The server requires `AI_GATEWAY_URL` ending in `/v1` and `AI_GATEWAY_API_KEY`; the browser never receives the key. For a public deployment, use gateway request quotas and authorization to protect your account and usage. Images are sent to the selected remote model; only upload data you are authorized to process.

**Note:** This ZIP changes the model selection and mapping; it does not independently confirm live OmniRoute access, model availability, or math accuracy.
