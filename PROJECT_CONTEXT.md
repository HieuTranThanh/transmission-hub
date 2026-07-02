# Transmission Hub — Project Context (AI Bootstrap)

## What
Web app tra cứu dữ liệu mạng truyền dẫn MobiFone: audit IP/routing, phát hiện lỗi, gợi ý thu hồi tài nguyên.

## Stack
React 18 + TypeScript + Tailwind CSS + Vite 8 | Supabase (PostgreSQL + PostgREST) | Vitest + jsdom

## Architecture
- **Import flow**: Excel (3 files) → `import_data.py` hoặc `npm run import:samples` → Supabase (batch-versioned, không ghi đè)
- **Rule engine**: audit-rules.ts + reclaim-rules.ts (duplicated in import_data.py — sync khi sửa)
- **Frontend**: React SPA, đọc views `latest_*` (batch completed mới nhất), anon key read-only
- **Topology**: iframe load từ Supabase Storage bucket `topology`

## DB Tables
`import_batches, devices, ip_assignments, ospf_interfaces, ospf_neighbors, ospf_errors, bgp_summary, bgp_neighbors, bgp_errors, audit_findings, resource_candidates, audit_exceptions`
Views: `latest_*`, `dashboard_summary` | RPC: `search_ip_assignments_by_subnet(cidr)`

## Pages
`/` Dashboard | `/search` Search Center (luồng chính) | `/ip-audit` Audit IP | `/routing` BGP/OSPF | `/reclaim` Reclaim | `/topology` Topology | `/imports` Import History

## Critical Rules
- Supabase hard-cap 1000 rows → `fetchAllRows` phân trang
- SQL: KHÔNG `DROP VIEW` → `CREATE OR REPLACE VIEW`
- npm: KHÔNG `npm audit fix --force` (break exceljs export)
- UI text: tiếng Việt, thuật ngữ kỹ thuật giữ English
- Tables: sort A-Z/Z-A qua header (trừ Topology)
- Filters: >=2 filter phải cascade; gate fetch bằng `filtersReady`
- Admin/oper state: case-insensitive compare (Cisco lowercase, Nokia capitalized)
- Failed rows (3): IP fields null → skip trong rules
- Two-batch delta: giữ 2 batch để so sánh, Dashboard badges + enriched columns

## Commands
```
npm run lint && npm run test && npm run build   # PHẢI pass sau mỗi sửa code
npm run dev                                      # Dev server port 5174
```

## Key Files
- Schema: `supabase/migrations/001_initial_schema.sql`
- Rules: `scripts/lib/audit-rules.ts`, `scripts/lib/reclaim-rules.ts`
- Python import: `import_data.py` (production, xóa+insert, archive files)
- Types: `src/types.ts` | Data: `src/data/*.ts` | Components: `src/components/*.tsx`
- Glossary (UI labels/colors): `src/lib/glossary.ts`
- Design tokens: `docs/design-tokens.md` | Excel format: `docs/excel-format.md`
- Spec reference: `claude-task/SPEC.md` (audit rules, scoring, schema design)
- Data profile: `docs/data-profile.md` (Excel column stats & quirks)

## Env
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (frontend) | `SUPABASE_SERVICE_ROLE_KEY` (import only)
