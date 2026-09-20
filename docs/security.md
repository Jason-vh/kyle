# Access and delivery

## Deployment

The session migration requires everyone to sign in again. Old stateless JWTs are rejected.

Set `CHAT_USER_ID` to the Kyle user UUID whose permissions the HTTP/CLI client should use,
and configure the matching GitHub Actions secret. `CHAT_API_KEY` alone no longer grants
administrator access. Missing `CHAT_API_KEY` or `WEBHOOK_AUTH` disables that endpoint with
503; unauthenticated access is allowed only with `NODE_ENV=development` on localhost.

## Accounts

- Sessions live in `auth_sessions`. Logout revokes the current session; `revokeUserSessions`
  revokes all sessions for an account. A revoked session cannot refresh itself.
- Permissions and disabled status come from the current user row, not JWT claims.
- Accounts onboarded through Plex retain their original Plex access requirement even if
  they unlink Plex or add a passkey. Existing linked accounts are migrated to this policy.
- Plex access checks cache for five minutes. Removing a member through Kyle invalidates
  that cache immediately. An upstream outage fails closed after cached access expires.
- Slack and Discord users need an active, linked Kyle account. Members can browse and
  request; destructive and administrative tools require current administrator status.
  Tools recheck permission at execution, including ownership of subscription operations.
- Passkey challenges and Plex callbacks are single-use and bound to their initiating browser.
  Their temporary state remains process-local, so a restart requires restarting sign-in.

## Background delivery

Slack events are persisted before acknowledgement and deduplicated by event ID. A worker
recovers pending events after restarts and retries processing failures. Processing is
at-least-once: a crash during a turn can replay the event, including tool actions. Final replies
are persisted before delivery; delivery retries resend the saved text without rerunning the agent.
A handled agent error is completed only after its reply is delivered. A crash after Slack accepts
a reply but before completion is recorded can duplicate the reply.

Webhooks are acknowledged only after PostgreSQL accepts them. Series episodes are merged
into a ten-minute batch. The delivery worker runs every thirty seconds after the scheduler's
startup delay, with exponential retry backoff capped at one hour.

In-app notifications are unique per job and recipient. Chat replies are persisted before
sending, and completed recipients are skipped on retries. Delivery is at-least-once: a crash
between a platform accepting a reply and Kyle recording that acceptance can duplicate a
chat message. Inspect `webhook_jobs.last_error`, `attempts`, and `completed_at` for failures.

Conversation turns and media writes are serialized across processes with PostgreSQL advisory
locks. Each nesting depth has its own connection pool, so parent operations cannot exhaust
the connections their children need. External thread identifiers are unique; the migration
merges existing duplicates and preserves their messages, events, and subscriptions.
