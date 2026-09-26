# Submission verification — 26 September 2026

The final local submission check used the application code at `bf37a61`.

- Production build: passed for API and web.
- TypeScript checks: passed for both workspaces.
- API integration suite: 33 of 33 passed against the isolated test database.
- Chromium browser regression suite: 14 of 14 passed. An initial run lost its local test web server; the complete rerun in a persistent terminal passed in 1.1 minutes.
- Live API health: HTTP 200. Frontend and API remained available on ports 5173 and 3001.
- Both owner-requested local account password restorations were verified by successful sign-in. Password changes are local database state, not repository changes.
- The manually recorded steel scenario completed: receive 100 kg, transfer 100 kg from Main Stock to Production Rack, deliver 20 kg through pick and pack, and reconcile 3 kg of damage. Final stock was 77 kg, with zero reserved and five matching ledger entries.

The real user-flow recording is a local submission artifact: 1920×1080, approximately 10 minutes 49 seconds, without audio or subtitles. It is not committed to Git.

These checks do not mean that every manual scenario or production environment has been tested. The separate manual catalog still records 93 passed, 24 partially covered, 32 not run, and 2 blocked. Automated coverage is separate. Physical printing, assistive technology, deployment/backup operations, and other outstanding manual cases are not certified by this check. Physical-count adjustments currently require a manager; staff can receive, deliver, and transfer.

Local credentials, environment configuration, databases, recordings, generated reports, and private analysis are excluded from this submission commit. See the README for clean setup and the existing quality review for scope boundaries.
