# Database migrations

ClaimTrace uses Alembic for explicit schema evolution.

The first migration, `0001_claimtrace_baseline`, mirrors the current SQLAlchemy schema and uses check-first creation so it can be applied to a fresh database or an existing pilot database without dropping tables.

For a new deployment:

```bash
cd backend
alembic upgrade head
```

For an existing pilot database that already matches the current schema, run the same command. The baseline migration is idempotent; Alembic then records the migration revision.

Future schema changes should add a new file under `alembic/versions/` with explicit `upgrade()` and `downgrade()` operations. Do not replace existing migrations or use destructive baseline downgrades.
