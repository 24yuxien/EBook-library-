# BookVault 藏簡書房

Personal library tracking reading assets and highlights across digital and physical books.

## Setup

Requires Node.js 22+, npm, and PostgreSQL 16+ (or Supabase).

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and set:
   - `DATABASE_URL`: Supabase pooled Postgres URL; use `?pgbouncer=true` for transaction pooling.
   - `DIRECT_URL`: direct/session Postgres URL used by Prisma migrations (not the transaction pooler).
   - `TEST_DATABASE_URL`: **dedicated, disposable** Postgres database, never your application database.
3. Run `npm run db:generate`, then `npm run db:migrate`.
4. Run `npm run dev` and open http://localhost:3000.

For a local test database:

```sh
docker run --name bookvault-postgres -e POSTGRES_PASSWORD=bookvault \
  -e POSTGRES_DB=bookvault_test -p 5432:5432 -d postgres:16
export TEST_DATABASE_URL=postgresql://postgres:bookvault@localhost:5432/bookvault_test
npm test
```

The full test suite requires a real Postgres connection and fails rather than silently skipping DB tests.
Its global setup resets **all data** in TEST_DATABASE_URL and applies the committed migrations.
It overrides DATABASE_URL and DIRECT_URL for test workers so application databases are never used by tests.
When running outside CI, export TEST_DATABASE_URL in your shell; Vitest does not load `.env` automatically.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` | Production Next.js build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript without emitting |
| `npm test` | Parser and real-Postgres integration tests |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Create/apply development migrations |

For deployment use `npx prisma migrate deploy`. CI deploys migrations to a Postgres service, then runs the full suite and build.

## Design

- Prisma models User, Book, Highlight, and ReadingProgress; deleting a user/book cascades to its children.
  Platforms include Kindle, Kobo, Readmoo, BookWalker and physical books. Only Kindle parsing/importing is implemented.
- `lib/parsers/kindle.ts` is a pure parser. It retains notes, empty highlights and bookmarks; imports persist only nonempty highlights/notes.
  Malformed blocks are skipped; invalid dates are omitted. Kindle timestamps have no timezone, so dates are interpreted in the server's local timezone.
  English US/UK and Simplified Chinese headers are supported.
- Book source keys hash a JSON tuple of normalized title and author (NFKC, collapsed whitespace, lowercase).
  A unique (user, platform, sourceKey) constraint plus createMany/skipDuplicates makes concurrent and repeated imports safe.
  First-import display metadata is retained.
- Highlight identity uses (bookId, non-null location, SHA-256 normalized content), avoiding NULL uniqueness gaps and long-text btree limits.
  Notes and highlights with identical location/content share identity. Missing locations become an empty string.
  Import results count inserted books/highlights and duplicate nonempty highlights; bookmarks and empty content are ignored, not counted as skipped duplicates.
- `lib/db/tenant.ts` keeps the raw Prisma client private. Application code uses `forUser(userId)`:
  every book lookup includes userId, child reads filter through book ownership, child writes verify ownership.
  No generic/unscoped ORM client is exported. User provisioning/authentication is out of scope; future route handlers must derive userId from trusted authentication, never a request-supplied identity.
  This is application-level isolation, not Supabase RLS; do not expose the database credentials to browsers.
- `importKindleClippings` in `lib/import/kindle.ts` groups books and uses database uniqueness to deduplicate within/across files and concurrent imports.
  Imports are not all-or-nothing: retrying after a failure safely completes remaining rows.
- `upsertProgress` in `lib/progress.ts` accepts percentages from 0–100.
  One SQL INSERT ... SELECT with an ownership predicate and ON CONFLICT conditional update atomically applies only strictly newer timestamps, including concurrent initial creation.
  Equal and older timestamps return false; unauthorized writes throw "Book not found".

The home page is a placeholder. Authentication, import UI, Kobo parsing and other platform importers are outside this task.
