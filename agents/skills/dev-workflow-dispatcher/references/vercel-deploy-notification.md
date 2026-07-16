# Vercel Deploy Notification

## The Problem

After an implement PR is merged to master, `deploy.yml` runs and deploys to Vercel. The user wants to receive the deployment URL in the workflow notification ("🚀 https://xxx.vercel.app").

## Current Architecture

1. `deploy.yml` on push to master checks if the commit came from a PR with `workflow/implement` label
2. If yes, runs `amondnet/vercel-action@v42` to deploy with `--prod`
3. The action outputs the deployment URL via `steps.deploy.outputs.url`
4. The workflow should then make this URL visible to the user

## Issues Found

### 1. `amondnet/vercel-action@v42` outputs.empty URL

The action's `url` output is empty even when deployment succeeds. The actual deployment URL is visible in the action log:

```
╶ https://perfect-dev-agent-workflow.vercel.app
╶ https://perfect-dev-agent-workflow-devvi-9232-apaw.vercel.app
```

But `steps.deploy.outputs.url` is empty string, so the Comment step gets `deployUrl = ''`.

### 2. GITHUB_TOKEN lacks comment permission

Even if the URL were captured, the Comment step fails with:
```
RequestError [HttpError]: Resource not accessible by integration
```

The `GITHUB_TOKEN` in the deploy workflow doesn't have permission to comment on issues in the repo.

## FIX needed

Two approaches:

### A. Hardcode the production URL (quick fix)

The production URL is stable: `https://perfect-dev-agent-workflow.vercel.app`
Replace the Comment step with a simple notification that includes this URL.

### B. Use `vercel` CLI directly (better)

Replace `amondnet/vercel-action@v42` with direct CLI calls:

```yaml
- name: Deploy to Vercel
  run: |
    npx vercel --prod --token ${{ secrets.VERCEL_TOKEN }} \
      --yes 2>&1 | tee deploy.log
    DEPLOY_URL=$(grep -oP 'https://[a-zA-Z0-9.-]+\.vercel\.app' deploy.log | head -1)
    echo "url=$DEPLOY_URL" >> $GITHUB_OUTPUT
```

This captures the URL from the CLI output.

## Known Vercel URLs

- Production: `https://perfect-dev-agent-workflow.vercel.app`
- Preview (per-branch): `https://perfect-dev-agent-workflow-{hash}-{user}.vercel.app`
