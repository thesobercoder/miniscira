# PRD: Invite-only signup

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-invite-only-signup)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved

## Goal

Disable public signup. Allow new accounts only through an invite link sent by an authorized user.

The product keeps email and password sign-in for existing users. New users join only when they open a valid single-use invite link and complete signup. Expired or used links fail with a clear message.

## User stories

- As an owner, I can create an invite link and send it to one person.
- As an invited person, I can open the link and create exactly one account.
- As an existing user, I keep signing in with no change.
- As a visitor without an invite, I cannot create an account.

## Scope

1. Gate email and password signup behind a valid invite token.
2. Gate OAuth signup behind the same invite rule where better-auth allows it.
3. Add an invite store with token hash, expiry, single use, creator, and status.
4. Add authorized invite create, list, and revoke routes and a minimal management UI.
5. Add signup with invite token validation, atomic consume, and rate limits.
6. Hide public signup UI when invite-only mode is on. Keep sign-in visible.
7. Seed the first owner without an invite through a bootstrap token.
8. Keep Lookout delivery tied to the owner's signup email.

## Non-goals

- No email sending or verification mail in this PRD.
- No multi-role permissions beyond owner and member.
- No bulk invites, invite quotas, or paid seats.
- No change to Eve auth chain order in `agent/channels/eve.ts`.
- No change to compaction, models, Railway setup, or gateway routing.

## Functional requirements

1. `INVITE_ONLY=true` turns on invite-only mode. Unset keeps current behavior for local development.
2. Public signup without a valid token fails with an authorization error and creates no user.
3. Each invite link contains one opaque token. The server stores only its hash.
4. Each token expires after a bounded time and allows exactly one account.
5. Revoked tokens fail immediately.
6. Invite creation, listing, and revocation require owner authorization. Members cannot manage invites.
7. The signup screen accepts `?invite=TOKEN`, validates it before showing the form, and consumes it atomically on success.
8. Failed signup does not consume the token.
9. Existing sessions and passwords keep working after the change.
10. Social signup without a bound invite fails closed when invite-only mode is on.

## Technical requirements

### Auth design

- Keep better-auth with the Drizzle Postgres adapter in `lib/auth.ts`.
- Keep `emailAndPassword.enabled: true` for sign-in. Add a database gate before user creation.
- Add an `invite` table: token hash, expiry, used status, creator user ID, created date, revoked status.
- Validate invite in one atomic database statement to stop double use.
- Rate-limit invite validation and signup attempts per IP and per token.
- Do not log tokens, hashes, passwords, or emails beyond operational minimums.
- Follow `docs/ENGINEERING_INVARIANTS.md` for auth. Do not reorder the Eve `auth:` chain.

### Bootstrap

- Support one first-owner bootstrap through `INITIAL_OWNER_EMAIL` or a one-time setup token.
- Bootstrap values live in environment only. They never enter the database or client bundle.
- After the first owner exists, disable bootstrap reuse.

### Test plan

- Unit tests cover token validation, expiry, single use, revoke, replay, and bootstrap.
- Integration tests cover unauthorized invite management, public signup rejection, valid invite signup, token reuse rejection, and existing-user sign-in.
- Browser tests cover invite link signup, invalid link message, used link message, and hidden public signup.
- `bun run typecheck`, `bun run lint`, `bun test`, production build, `python3 scripts/check-task-docs.py`, and `git diff --check` pass.
- Migration test proves fresh install and existing-database upgrade both work.

### Eval plan

- Evals do not apply. This changes auth routing only. It does not change agent behavior, prompts, tools, retrieval, memory, or model routing.

## Acceptance criteria

- [ ] `INVITE_ONLY=true` blocks public email signup without a valid token.
- [ ] A valid invite link creates exactly one account and then expires.
- [ ] An expired, revoked, or reused link shows a clear error and creates no account.
- [ ] Members cannot create, list, or revoke invites.
- [ ] Existing users sign in with no reset or data loss.
- [ ] The public signup form is hidden in invite-only mode.
- [ ] The first owner bootstrap works once and then closes.
- [ ] Unit, integration, browser, migration, rollback, and production checks pass.
- [ ] No token, hash, password, or secret appears in logs, responses, diffs, or docs.

## Deployment

1. Add the `invite` table through a committed migration in `lib/db/migrations/`.
2. Set `INVITE_ONLY=true` on Railway test and production projects after the first owner exists.
3. Set the bootstrap value once, create the owner, then remove or invalidate the bootstrap value.
4. Verify public signup rejection, valid invite signup, token reuse rejection, and existing-user sign-in on the deployed URL.

## Observability

- Log invite creation, use, expiry, revocation, and failed signup attempts without tokens or hashes.
- Expose invite counts by status and failed signup rate for operators.
- Alert on repeated invite validation failures from one source.

## Rollback

1. Keep the pre-change image and database snapshot.
2. Roll back code by redeploying the previous image.
3. Roll back data by restoring the snapshot only when the migration cannot roll forward.
4. Verify existing-user sign-in and public signup behavior match the target state.
5. Revoke active invite links created by the rolled-back version when they cannot be honored safely.

## Open questions

- Should the first owner use an email allowlist or a one-time setup token?
- How long should an invite link stay valid?
- Should invites bind to one email address or stay open to whoever holds the link?
- Should OAuth accounts require the same invite token at link time?
