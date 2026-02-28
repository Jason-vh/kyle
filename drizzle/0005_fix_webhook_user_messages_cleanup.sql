-- Re-run webhook user message cleanup with correct JSONB path.
-- Migration 0004 used data->>'content' which doesn't work because
-- pi-agent-core stores user content as an array: [{type: "text", text: "..."}].
DELETE FROM messages
WHERE role = 'user'
AND data->'content'->0->>'text' LIKE '[Webhook — %';
