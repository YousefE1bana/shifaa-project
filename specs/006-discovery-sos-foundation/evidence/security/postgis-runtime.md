# PostGIS local/CI runtime evidence

**Date:** 2026-08-20  
**Boundary:** seeded-synthetic engineering only; this does not close `OPEN-TECH-001` or approve a production database image.

## Provenance and effective image

- Upstream: `postgis/postgis:17-3.5-alpine@sha256:fae81f3e8da88b8e684c58c8a8616aadda72e6fc1affcb050b490891ecb3db1c`
- Inspected linux/amd64 manifest: `sha256:966243672c7d98cb996f26854a790b3b76e3cb77455d6eeb19d72ff82d20e7af`
- Repository derivative: `infra/db/Dockerfile.postgis`
- Local final image ID: `sha256:2a60f970249f8b1ed79c2cd5ff5d82bf4805ecc98386a4b3bbac428e25901cd7`
- Effective size: 137,079,916 bytes; entrypoint `docker-entrypoint.sh`; command `postgres`; `PGDATA=/var/lib/postgresql/data`

The derivative retains only the required PostGIS vector/geography surface. It pins `su-exec=0.3-r0`, replaces and removes the statically linked `gosu` helper, removes `postgis_raster`, GDAL, RasterLite2, and GIF support, and copies the effective filesystem into a clean final layer so removed bytes are not present in the shipped SBOM.

## Vulnerability decision

The first upstream scan found 2 critical and 21 high findings in two surfaces not used by 006: the static Go standard library embedded in `gosu`, and GIF decoding reached only through the raster/GDAL extension. These were remediated rather than waived.

`docker scout cves --only-severity critical,high shifaa/postgis:17-3.5-006-local` indexed 83 packages and reported:

```text
vulnerabilities  0C  0H  0M  0L
No vulnerable packages detected
```

The machine-readable result is `postgis-scout.sarif`. Docker Scout emitted a Windows temporary-archive cleanup warning after successfully indexing and writing the report; it did not change the scan result.

## Runtime and compatibility probes

After a clean Compose start, PostgreSQL reported `17.11` and `PostGIS_Full_Version()` reported PostGIS `3.5.7`, GEOS `3.14.1`, PROJ `9.8.1` with network disabled, and topology support. A temporary `geography(Point,4326)` column and GiST index were created successfully. `postgis_raster` was absent.

A separate disposable named volume was initialized using the exact previous `postgres:17.5-alpine@sha256:6567bca8d7bc8c82c5922425a0baee57be8402df92bae5eacad5f01ae9544daa` image, populated with a marker table, stopped, and mounted into the derived PostgreSQL 17.11 image. The marker read successfully and `CREATE EXTENSION postgis` returned PostGIS `3.5`. The temporary containers and volume were then removed.

Commands exercised:

```powershell
docker buildx imagetools inspect postgis/postgis:17-3.5-alpine
docker compose build --no-cache postgres
docker scout cves --only-severity critical,high --format sarif --output specs/006-discovery-sos-foundation/evidence/security/postgis-scout.sarif shifaa/postgis:17-3.5-006-local
docker compose up -d --wait postgres
docker compose exec -T postgres psql -U shifaa_owner -d shifaa -c "select version(), postgis_full_version();"
```

## Remaining gate

This evidence approves the bounded local/CI engineering runtime only. Formal architecture/platform acceptance, repository-wide reproducibility policy, and any production Supabase/Postgres deployment choice remain blocked by `OPEN-TECH-001`.
