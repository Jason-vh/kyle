-- Delete duplicate webhook prompt user messages from the messages table.
-- These were saved by notifyRequester() alongside the webhookNotifications record,
-- causing duplicate display in the thread viewer and double-counting in agent context.
-- The webhookNotifications table is the single source of truth for these events.
DELETE FROM messages
WHERE role = 'user'
AND data->>'content' LIKE '[Webhook — %';
