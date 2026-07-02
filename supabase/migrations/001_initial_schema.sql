-- Transmission Hub — initial schema
-- Safe to run multiple times in the Supabase SQL editor (idempotent guards via
-- IF NOT EXISTS / DROP ... IF EXISTS where it matters).

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ============================================================================
-- import_batches
-- ============================================================================
create table if not exists import_batches (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz default now(),
  source_label        text,
  source_files        jsonb default '[]'::jsonb,
  status              text not null default 'running'
                        check (status in ('running', 'completed', 'failed')),
  inventory_rows           int default 0,
  ospf_interface_rows      int default 0,
  ospf_neighbor_rows       int default 0,
  ospf_error_rows          int default 0,
  bgp_summary_rows         int default 0,
  bgp_neighbor_rows        int default 0,
  bgp_error_rows           int default 0,
  audit_finding_rows       int default 0,
  resource_candidate_rows  int default 0,
  notes               text,
  completed_at        timestamptz
);

create index if not exists idx_import_batches_status on import_batches (status);

-- ============================================================================
-- devices — normalized device list per batch
-- ============================================================================
create table if not exists devices (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  device_name       text,
  device_ip         inet,
  vendor            text,
  loopback_ip       inet,
  router_id         inet,
  local_as          bigint,
  source            text,
  unique (import_batch_id, device_name, device_ip)
);

create index if not exists idx_devices_batch on devices (import_batch_id);
create index if not exists idx_devices_name on devices (device_name);
create index if not exists idx_devices_ip on devices (device_ip);
create index if not exists idx_devices_name_trgm on devices using gin (device_name gin_trgm_ops);

-- ============================================================================
-- ip_assignments — from "IP VLAN Inventory" sheet
-- ============================================================================
create table if not exists ip_assignments (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  device_name       text,
  device_ip         inet,
  vendor            text,
  loopback_ip       inet,
  interface_name    text,
  vlan_id           int,
  vlan_description  text,
  vrf_instance      text,
  ip_address        inet,
  prefix_length     int,
  network           cidr generated always as (
                      case
                        when ip_address is not null
                          and prefix_length is not null
                          and prefix_length between 0 and 32
                        then cidr(set_masklen(ip_address, prefix_length))
                        else null
                      end
                    ) stored,
  gateway           inet,
  physical_port     text,
  port_description  text,
  service_type      text,
  admin_state       text,
  oper_state        text,
  static_routes     text,
  notes             text,
  status            text
);

create index if not exists idx_ip_assignments_batch on ip_assignments (import_batch_id);
create index if not exists idx_ip_assignments_ip on ip_assignments (ip_address);
create index if not exists idx_ip_assignments_network on ip_assignments (network);
create index if not exists idx_ip_assignments_device_name on ip_assignments (device_name);
create index if not exists idx_ip_assignments_device_ip on ip_assignments (device_ip);
create index if not exists idx_ip_assignments_interface on ip_assignments (interface_name);
create index if not exists idx_ip_assignments_vrf on ip_assignments (vrf_instance);
create index if not exists idx_ip_assignments_status on ip_assignments (status);
create index if not exists idx_ip_assignments_vlan on ip_assignments (vlan_id);
create index if not exists idx_ip_assignments_device_name_trgm on ip_assignments using gin (device_name gin_trgm_ops);
create index if not exists idx_ip_assignments_interface_trgm on ip_assignments using gin (interface_name gin_trgm_ops);

-- ============================================================================
-- ospf_interfaces — from OSPF baseline "Interfaces" sheet
-- ============================================================================
create table if not exists ospf_interfaces (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  device_name       text,
  device_ip         inet,
  vendor            text,
  router_id         inet,
  ospf_admin        text,
  if_ip             inet,
  if_name           text,
  area              text,
  if_admin          text,
  if_state          text,
  cost              int,
  mtu               int,
  data_source       text,
  captured_at       timestamptz
);

create index if not exists idx_ospf_interfaces_batch on ospf_interfaces (import_batch_id);
create index if not exists idx_ospf_interfaces_if_ip on ospf_interfaces (if_ip);
create index if not exists idx_ospf_interfaces_device_name on ospf_interfaces (device_name);
create index if not exists idx_ospf_interfaces_router_id on ospf_interfaces (router_id);
create index if not exists idx_ospf_interfaces_device_name_trgm on ospf_interfaces using gin (device_name gin_trgm_ops);

-- ============================================================================
-- ospf_neighbors — from OSPF baseline "Neighbors" sheet
-- ============================================================================
create table if not exists ospf_neighbors (
  id                    uuid primary key default gen_random_uuid(),
  import_batch_id       uuid references import_batches(id) on delete cascade,
  device_name           text,
  device_ip             inet,
  vendor                text,
  router_id             inet,
  ospf_admin            text,
  neighbor_ip           inet,
  neighbor_router_id    inet,
  neighbor_device_name  text,
  name_source           text,
  neighbor_state        text,
  captured_at           timestamptz
);

-- Additive columns for already-deployed databases (the create table above is
-- skipped when the table already exists).
alter table ospf_neighbors add column if not exists name_source text;

create index if not exists idx_ospf_neighbors_batch on ospf_neighbors (import_batch_id);
create index if not exists idx_ospf_neighbors_neighbor_ip on ospf_neighbors (neighbor_ip);
create index if not exists idx_ospf_neighbors_neighbor_rid on ospf_neighbors (neighbor_router_id);
create index if not exists idx_ospf_neighbors_device_name on ospf_neighbors (device_name);
create index if not exists idx_ospf_neighbors_state on ospf_neighbors (neighbor_state);
create index if not exists idx_ospf_neighbors_device_name_trgm on ospf_neighbors using gin (device_name gin_trgm_ops);

-- ============================================================================
-- ospf_errors — from OSPF baseline "Errors" sheet
-- ============================================================================
create table if not exists ospf_errors (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  device_name       text,
  device_ip         inet,
  vendor            text,
  error_type        text,
  error_detail      text,
  captured_at       timestamptz
);

create index if not exists idx_ospf_errors_batch on ospf_errors (import_batch_id);
create index if not exists idx_ospf_errors_device_name on ospf_errors (device_name);

-- ============================================================================
-- bgp_summary — from BGP audit "BGP_Summary" sheet
-- ============================================================================
create table if not exists bgp_summary (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  device_name       text,
  device_ip         inet,
  vendor            text,
  router_id         inet,
  local_as          bigint,
  bgp_admin_state   text,
  bgp_oper_state    text,
  total_peers       int,
  established       int,
  not_established   int,
  vpnv4_rcvd        int,
  vpnv4_active      int,
  status            text,
  captured_at       timestamptz
);

create index if not exists idx_bgp_summary_batch on bgp_summary (import_batch_id);
create index if not exists idx_bgp_summary_router_id on bgp_summary (router_id);
create index if not exists idx_bgp_summary_device_name on bgp_summary (device_name);
create index if not exists idx_bgp_summary_status on bgp_summary (status);

-- ============================================================================
-- bgp_neighbors — from BGP audit "BGP_Neighbors" sheet
-- ============================================================================
create table if not exists bgp_neighbors (
  id                    uuid primary key default gen_random_uuid(),
  import_batch_id       uuid references import_batches(id) on delete cascade,
  device_name           text,
  device_ip             inet,
  vendor                text,
  router_id             inet,
  local_as              bigint,
  neighbor_ip           inet,
  neighbor_device_name  text,
  name_source           text,
  remote_as             bigint,
  description           text,
  bgp_group             text,
  bgp_state             text,
  up_down               text,
  flaps                 bigint,
  last_error            text,
  hold_time             int,
  vpnv4_rcvd            int,
  vpnv4_active          int,
  anomaly               text,
  captured_at           timestamptz
);

-- Additive columns for already-deployed databases (the create table above is
-- skipped when the table already exists).
alter table bgp_neighbors add column if not exists neighbor_device_name text;
alter table bgp_neighbors add column if not exists name_source text;

create index if not exists idx_bgp_neighbors_batch on bgp_neighbors (import_batch_id);
create index if not exists idx_bgp_neighbors_neighbor_ip on bgp_neighbors (neighbor_ip);
create index if not exists idx_bgp_neighbors_device_name on bgp_neighbors (device_name);
create index if not exists idx_bgp_neighbors_state on bgp_neighbors (bgp_state);
create index if not exists idx_bgp_neighbors_device_name_trgm on bgp_neighbors using gin (device_name gin_trgm_ops);

-- ============================================================================
-- bgp_errors — from BGP audit "Errors" sheet
-- ============================================================================
create table if not exists bgp_errors (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  device_name       text,
  device_ip         inet,
  vendor            text,
  error             text
);

create index if not exists idx_bgp_errors_batch on bgp_errors (import_batch_id);
create index if not exists idx_bgp_errors_device_name on bgp_errors (device_name);

-- ============================================================================
-- audit_findings — rule engine output
-- ============================================================================
create table if not exists audit_findings (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  severity          text not null check (severity in ('Critical', 'High', 'Medium', 'Low', 'Info')),
  category          text not null,
  rule_code         text not null,
  title             text not null,
  detail            text,
  device_name       text,
  device_ip         inet,
  ip_address        inet,
  network           cidr,
  interface_name    text,
  service_type      text,
  vrf_instance      text,
  intf_status       text,
  status            text default 'New',
  confidence        int,
  priority_score    int default 0,
  evidence          jsonb default '{}'::jsonb,
  created_at        timestamptz default now()
);

-- Additive columns for already-deployed databases (the create table above is
-- skipped when the table already exists).
alter table audit_findings add column if not exists vrf_instance text;
alter table audit_findings add column if not exists intf_status  text;

create index if not exists idx_audit_findings_batch on audit_findings (import_batch_id);
create index if not exists idx_audit_findings_service_type on audit_findings (service_type);
create index if not exists idx_audit_findings_vrf on audit_findings (vrf_instance);
create index if not exists idx_audit_findings_intf_status on audit_findings (intf_status);
create index if not exists idx_audit_findings_severity on audit_findings (severity);
create index if not exists idx_audit_findings_category on audit_findings (category);
create index if not exists idx_audit_findings_rule_code on audit_findings (rule_code);
create index if not exists idx_audit_findings_device_name on audit_findings (device_name);
create index if not exists idx_audit_findings_ip on audit_findings (ip_address);
create index if not exists idx_audit_findings_network on audit_findings (network);
create index if not exists idx_audit_findings_status on audit_findings (status);
create index if not exists idx_audit_findings_priority on audit_findings (priority_score desc);

-- ============================================================================
-- resource_candidates — reclaim suggestions
-- ============================================================================
create table if not exists resource_candidates (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  candidate_type    text not null,
  score             int not null default 0,
  priority_score    int default 0,
  confidence        text check (confidence in ('High', 'Medium', 'Low')),
  reason            text,
  device_name       text,
  device_ip         inet,
  ip_address        inet,
  network           cidr,
  interface_name    text,
  service_type      text,
  current_status    text,
  evidence          jsonb default '{}'::jsonb,
  created_at        timestamptz default now()
);

create index if not exists idx_resource_candidates_batch on resource_candidates (import_batch_id);
create index if not exists idx_resource_candidates_confidence on resource_candidates (confidence);
create index if not exists idx_resource_candidates_device_name on resource_candidates (device_name);
create index if not exists idx_resource_candidates_ip on resource_candidates (ip_address);
create index if not exists idx_resource_candidates_priority on resource_candidates (priority_score desc);

-- ============================================================================
-- audit_exceptions — whitelist of confirmed-OK findings
-- ============================================================================
create table if not exists audit_exceptions (
  id            uuid primary key default gen_random_uuid(),
  rule_code     text,
  device_name   text,
  ip_address    inet,
  network       cidr,
  reason        text,
  created_by    text,
  expires_at    timestamptz,
  created_at    timestamptz default now()
);

create index if not exists idx_audit_exceptions_rule_code on audit_exceptions (rule_code);

-- ============================================================================
-- Row Level Security — anon (frontend) gets read-only access to everything.
-- Inserts/updates/deletes are performed only by scripts using the service
-- role key, which bypasses RLS entirely.
-- ============================================================================
alter table import_batches      enable row level security;
alter table devices             enable row level security;
alter table ip_assignments      enable row level security;
alter table ospf_interfaces     enable row level security;
alter table ospf_neighbors      enable row level security;
alter table ospf_errors         enable row level security;
alter table bgp_summary         enable row level security;
alter table bgp_neighbors       enable row level security;
alter table bgp_errors          enable row level security;
alter table audit_findings      enable row level security;
alter table resource_candidates enable row level security;
alter table audit_exceptions    enable row level security;

drop policy if exists "Public read" on import_batches;
drop policy if exists "Public read" on devices;
drop policy if exists "Public read" on ip_assignments;
drop policy if exists "Public read" on ospf_interfaces;
drop policy if exists "Public read" on ospf_neighbors;
drop policy if exists "Public read" on ospf_errors;
drop policy if exists "Public read" on bgp_summary;
drop policy if exists "Public read" on bgp_neighbors;
drop policy if exists "Public read" on bgp_errors;
drop policy if exists "Public read" on audit_findings;
drop policy if exists "Public read" on resource_candidates;
drop policy if exists "Public read" on audit_exceptions;

create policy "Public read" on import_batches      for select using (true);
create policy "Public read" on devices             for select using (true);
create policy "Public read" on ip_assignments      for select using (true);
create policy "Public read" on ospf_interfaces     for select using (true);
create policy "Public read" on ospf_neighbors      for select using (true);
create policy "Public read" on ospf_errors         for select using (true);
create policy "Public read" on bgp_summary         for select using (true);
create policy "Public read" on bgp_neighbors       for select using (true);
create policy "Public read" on bgp_errors          for select using (true);
create policy "Public read" on audit_findings      for select using (true);
create policy "Public read" on resource_candidates for select using (true);
create policy "Public read" on audit_exceptions    for select using (true);

-- ============================================================================
-- Views — "latest" = the most recently completed import batch.
-- security_invoker ensures these views are subject to the querying role's
-- RLS policies (i.e. the anon "Public read" policies above), not the view
-- owner's privileges.
-- ============================================================================
create or replace view latest_import_batch with (security_invoker = true) as
select *
from import_batches
where status = 'completed'
order by coalesce(completed_at, created_at) desc
limit 1;

create or replace view previous_import_batch with (security_invoker = true) as
select *
from import_batches
where status = 'completed'
order by coalesce(completed_at, created_at) desc
limit 1
offset 1;

create or replace view latest_devices with (security_invoker = true) as
select d.*
from devices d
where d.import_batch_id = (select id from latest_import_batch);

create or replace view latest_ip_assignments with (security_invoker = true) as
select a.*
from ip_assignments a
where a.import_batch_id = (select id from latest_import_batch);

create or replace view latest_ospf_interfaces with (security_invoker = true) as
select o.*
from ospf_interfaces o
where o.import_batch_id = (select id from latest_import_batch);

-- create or replace (not drop+create): dashboard_summary depends on this
-- view, so a plain drop fails on re-run. `create or replace` lets `select *`
-- pick up newly-added columns (e.g. name_source) by appending them to the
-- view's column list, without touching dashboard_summary.
create or replace view latest_ospf_neighbors with (security_invoker = true) as
select o.*
from ospf_neighbors o
where o.import_batch_id = (select id from latest_import_batch);

create or replace view latest_ospf_errors with (security_invoker = true) as
select o.*
from ospf_errors o
where o.import_batch_id = (select id from latest_import_batch);

create or replace view latest_bgp_summary with (security_invoker = true) as
select b.*
from bgp_summary b
where b.import_batch_id = (select id from latest_import_batch);

-- create or replace: see latest_ospf_neighbors above (dashboard_summary
-- dependency + picking up newly-added columns like neighbor_device_name,
-- name_source).
create or replace view latest_bgp_neighbors with (security_invoker = true) as
select b.*
from bgp_neighbors b
where b.import_batch_id = (select id from latest_import_batch);

create or replace view latest_bgp_errors with (security_invoker = true) as
select b.*
from bgp_errors b
where b.import_batch_id = (select id from latest_import_batch);

create or replace view latest_audit_findings with (security_invoker = true) as
select f.*
from audit_findings f
where f.import_batch_id = (select id from latest_import_batch);

create or replace view latest_resource_candidates with (security_invoker = true) as
select r.*
from resource_candidates r
where r.import_batch_id = (select id from latest_import_batch);

-- ============================================================================
-- Enriched views — extend latest_* with comparison data from previous batch.
-- Used by list pages (IP Audit, Routing, Reclaim) for inline delta display.
-- The base latest_* views stay unchanged for search, detail drawer, etc.
-- ============================================================================

create or replace view latest_audit_findings_enriched with (security_invoker = true) as
select f.*,
  not exists (
    select 1 from audit_findings prev
    where prev.import_batch_id = (select id from previous_import_batch)
      and prev.rule_code = f.rule_code
      and prev.device_name is not distinct from f.device_name
      and prev.ip_address is not distinct from f.ip_address
      and prev.network is not distinct from f.network
  ) as is_new
from audit_findings f
where f.import_batch_id = (select id from latest_import_batch);

create or replace view latest_bgp_neighbors_enriched with (security_invoker = true) as
select curr.*,
  prev.flaps         as prev_flaps,
  case when prev.flaps is not null and curr.flaps is not null
       then curr.flaps - prev.flaps else null end as flap_delta,
  prev.bgp_state     as prev_bgp_state
from bgp_neighbors curr
left join lateral (
  select p.flaps, p.bgp_state
  from bgp_neighbors p
  where p.import_batch_id = (select id from previous_import_batch)
    and p.device_name is not distinct from curr.device_name
    and p.neighbor_ip is not distinct from curr.neighbor_ip
  limit 1
) prev on true
where curr.import_batch_id = (select id from latest_import_batch);

create or replace view latest_ospf_neighbors_enriched with (security_invoker = true) as
select curr.*,
  prev.neighbor_state as prev_neighbor_state
from ospf_neighbors curr
left join lateral (
  select p.neighbor_state
  from ospf_neighbors p
  where p.import_batch_id = (select id from previous_import_batch)
    and p.device_name is not distinct from curr.device_name
    and p.neighbor_ip is not distinct from curr.neighbor_ip
  limit 1
) prev on true
where curr.import_batch_id = (select id from latest_import_batch);

create or replace view latest_resource_candidates_enriched with (security_invoker = true) as
select r.*,
  not exists (
    select 1 from resource_candidates prev
    where prev.import_batch_id = (select id from previous_import_batch)
      and prev.candidate_type = r.candidate_type
      and prev.device_name is not distinct from r.device_name
      and prev.ip_address is not distinct from r.ip_address
  ) as is_new
from resource_candidates r
where r.import_batch_id = (select id from latest_import_batch);

-- ============================================================================
-- dashboard_summary — one-row summary for the Dashboard page
-- ============================================================================
create or replace view dashboard_summary with (security_invoker = true) as
select
  (select id from latest_import_batch)         as latest_batch_id,
  (select created_at from latest_import_batch) as latest_batch_created_at,
  (select source_label from latest_import_batch) as latest_batch_source_label,

  (select count(*) from latest_devices)        as total_devices,
  (select count(*) from latest_ip_assignments) as total_ip_assignments,

  (select count(*) from latest_ip_assignments where status = 'Active')      as status_active,
  (select count(*) from latest_ip_assignments where status = 'Admin-Down')  as status_admin_down,
  (select count(*) from latest_ip_assignments where status = 'Link-Down')  as status_link_down,
  (select count(*) from latest_ip_assignments where status = 'Up/No-Peer') as status_up_no_peer,
  (select count(*) from latest_ip_assignments where status = 'Failed')     as status_failed,

  (select count(distinct ip_address)
     from (
       select ip_address
       from latest_ip_assignments
       where ip_address is not null
       group by ip_address
       having count(*) > 1
     ) dup)                                     as duplicate_ip_count,

  (select count(*) from latest_audit_findings where severity = 'Critical') as findings_critical,
  (select count(*) from latest_audit_findings where severity = 'High')     as findings_high,
  (select count(*) from latest_audit_findings where severity = 'Medium')   as findings_medium,
  (select count(*) from latest_audit_findings where severity = 'Low')      as findings_low,
  (select count(*) from latest_audit_findings where severity = 'Info')     as findings_info,
  (select count(*) from latest_audit_findings)                             as findings_total,

  (select count(*) from latest_bgp_summary where status = 'OK')      as bgp_status_ok,
  (select count(*) from latest_bgp_summary where status = 'WARNING') as bgp_status_warning,
  (select count(*) from latest_bgp_summary where status = 'ERROR')   as bgp_status_error,
  (select count(*) from latest_bgp_neighbors where bgp_state is distinct from 'Established') as bgp_peers_not_established,
  (select count(*) from latest_bgp_errors)                                     as bgp_collection_errors,

  (select count(*) from latest_ospf_neighbors where neighbor_state is null or lower(neighbor_state) <> 'full') as ospf_neighbors_not_full,
  (select count(*) from latest_ospf_errors)                                          as ospf_collection_errors,

  (select count(*) from latest_resource_candidates)                           as reclaim_total,
  (select count(*) from latest_resource_candidates where confidence = 'High') as reclaim_high,
  (select count(*) from latest_resource_candidates where confidence = 'Medium') as reclaim_medium,
  (select count(*) from latest_resource_candidates where confidence = 'Low')    as reclaim_low,

  -- ---- Previous batch (for delta comparison on Dashboard) ----
  (select id from previous_import_batch)           as prev_batch_id,
  (select created_at from previous_import_batch)   as prev_batch_created_at,
  (select source_label from previous_import_batch) as prev_batch_source_label,

  (select count(*) from devices where import_batch_id = (select id from previous_import_batch))        as prev_total_devices,
  (select count(*) from ip_assignments where import_batch_id = (select id from previous_import_batch)) as prev_total_ip_assignments,

  (select count(*) from ip_assignments where import_batch_id = (select id from previous_import_batch) and status = 'Active')      as prev_status_active,
  (select count(*) from ip_assignments where import_batch_id = (select id from previous_import_batch) and status = 'Admin-Down')  as prev_status_admin_down,
  (select count(*) from ip_assignments where import_batch_id = (select id from previous_import_batch) and status = 'Link-Down')   as prev_status_link_down,
  (select count(*) from ip_assignments where import_batch_id = (select id from previous_import_batch) and status = 'Up/No-Peer')  as prev_status_up_no_peer,
  (select count(*) from ip_assignments where import_batch_id = (select id from previous_import_batch) and status = 'Failed')      as prev_status_failed,

  (select count(distinct ip_address)
     from (
       select ip_address
       from ip_assignments
       where import_batch_id = (select id from previous_import_batch)
         and ip_address is not null
       group by ip_address
       having count(*) > 1
     ) dup2)                                       as prev_duplicate_ip_count,

  (select count(*) from audit_findings where import_batch_id = (select id from previous_import_batch) and severity = 'Critical') as prev_findings_critical,
  (select count(*) from audit_findings where import_batch_id = (select id from previous_import_batch) and severity = 'High')     as prev_findings_high,
  (select count(*) from audit_findings where import_batch_id = (select id from previous_import_batch) and severity = 'Medium')   as prev_findings_medium,
  (select count(*) from audit_findings where import_batch_id = (select id from previous_import_batch) and severity = 'Low')      as prev_findings_low,
  (select count(*) from audit_findings where import_batch_id = (select id from previous_import_batch) and severity = 'Info')     as prev_findings_info,
  (select count(*) from audit_findings where import_batch_id = (select id from previous_import_batch))                           as prev_findings_total,

  (select count(*) from bgp_summary where import_batch_id = (select id from previous_import_batch) and status = 'OK')      as prev_bgp_status_ok,
  (select count(*) from bgp_summary where import_batch_id = (select id from previous_import_batch) and status = 'WARNING') as prev_bgp_status_warning,
  (select count(*) from bgp_summary where import_batch_id = (select id from previous_import_batch) and status = 'ERROR')   as prev_bgp_status_error,
  (select count(*) from bgp_neighbors where import_batch_id = (select id from previous_import_batch) and bgp_state is distinct from 'Established') as prev_bgp_peers_not_established,
  (select count(*) from bgp_errors where import_batch_id = (select id from previous_import_batch))                         as prev_bgp_collection_errors,

  (select count(*) from ospf_neighbors where import_batch_id = (select id from previous_import_batch) and (neighbor_state is null or lower(neighbor_state) <> 'full')) as prev_ospf_neighbors_not_full,
  (select count(*) from ospf_errors where import_batch_id = (select id from previous_import_batch))                        as prev_ospf_collection_errors,

  (select count(*) from resource_candidates where import_batch_id = (select id from previous_import_batch))                           as prev_reclaim_total,
  (select count(*) from resource_candidates where import_batch_id = (select id from previous_import_batch) and confidence = 'High')   as prev_reclaim_high,
  (select count(*) from resource_candidates where import_batch_id = (select id from previous_import_batch) and confidence = 'Medium') as prev_reclaim_medium,
  (select count(*) from resource_candidates where import_batch_id = (select id from previous_import_batch) and confidence = 'Low')    as prev_reclaim_low,

  -- New findings (in current but not in previous)
  (select count(*) from audit_findings curr
   where curr.import_batch_id = (select id from latest_import_batch)
     and not exists (
       select 1 from audit_findings prev
       where prev.import_batch_id = (select id from previous_import_batch)
         and prev.rule_code = curr.rule_code
         and prev.device_name is not distinct from curr.device_name
         and prev.ip_address is not distinct from curr.ip_address
         and prev.network is not distinct from curr.network
     )
  ) as findings_new,

  -- Resolved findings (in previous but not in current)
  (select count(*) from audit_findings prev
   where prev.import_batch_id = (select id from previous_import_batch)
     and not exists (
       select 1 from audit_findings curr
       where curr.import_batch_id = (select id from latest_import_batch)
         and curr.rule_code = prev.rule_code
         and curr.device_name is not distinct from prev.device_name
         and curr.ip_address is not distinct from prev.ip_address
         and curr.network is not distinct from prev.network
     )
  ) as findings_resolved,

  -- BGP flap delta: peers whose flap count increased between the two batches
  -- (matched by device_name + neighbor_ip). Signals network instability trend.
  (select count(*) from bgp_neighbors curr
   where curr.import_batch_id = (select id from latest_import_batch)
     and curr.flaps is not null
     and exists (
       select 1 from bgp_neighbors prev
       where prev.import_batch_id = (select id from previous_import_batch)
         and prev.device_name is not distinct from curr.device_name
         and prev.neighbor_ip is not distinct from curr.neighbor_ip
         and prev.flaps is not null
         and curr.flaps > prev.flaps
     )
  ) as bgp_flap_increased,

  -- Total flap increase across all matched peers (sum of curr.flaps - prev.flaps
  -- where curr > prev). Gives magnitude, not just count.
  (select coalesce(sum(curr.flaps - prev.flaps), 0)
   from bgp_neighbors curr
   join bgp_neighbors prev
     on prev.import_batch_id = (select id from previous_import_batch)
    and prev.device_name is not distinct from curr.device_name
    and prev.neighbor_ip is not distinct from curr.neighbor_ip
    and prev.flaps is not null
   where curr.import_batch_id = (select id from latest_import_batch)
     and curr.flaps is not null
     and curr.flaps > prev.flaps
  ) as bgp_flap_total_increase;

-- ============================================================================
-- bgp_flap_changes — detail view for peers whose flap count changed between
-- the latest and previous completed batch. Used by the Dashboard to show
-- exactly which peers became more/less stable.
-- ============================================================================
create or replace view bgp_flap_changes with (security_invoker = true) as
select
  curr.device_name,
  curr.device_ip,
  curr.neighbor_ip,
  curr.neighbor_device_name,
  curr.remote_as,
  curr.bgp_state,
  curr.bgp_group,
  curr.description,
  prev.flaps       as prev_flaps,
  curr.flaps       as curr_flaps,
  curr.flaps - prev.flaps as flap_delta
from bgp_neighbors curr
join bgp_neighbors prev
  on prev.import_batch_id = (select id from previous_import_batch)
 and prev.device_name is not distinct from curr.device_name
 and prev.neighbor_ip is not distinct from curr.neighbor_ip
 and prev.flaps is not null
where curr.import_batch_id = (select id from latest_import_batch)
  and curr.flaps is not null
  and curr.flaps <> prev.flaps
order by abs(curr.flaps - prev.flaps) desc;

-- ============================================================================
-- RPC — subnet search
-- PostgREST has no "contained by" filter operator for inet/cidr columns, so
-- subnet search (e.g. "10.250.60.136/30") is exposed as an RPC. SECURITY
-- INVOKER (the default) keeps this subject to the "Public read" RLS policies
-- above.
-- ============================================================================
drop function if exists search_ip_assignments_by_subnet(cidr);
create function search_ip_assignments_by_subnet(p_subnet cidr)
returns setof ip_assignments
language sql
stable
as $$
  select a.*
  from ip_assignments a
  where a.import_batch_id = (select id from latest_import_batch)
    and a.ip_address is not null
    and a.ip_address <<= p_subnet
  order by a.ip_address;
$$;

grant execute on function search_ip_assignments_by_subnet(cidr) to anon, authenticated;

-- ============================================================================
-- RPC — find allocated networks containing a given IP
-- Symmetric to search_ip_assignments_by_subnet above: given a single IP,
-- return ip_assignments rows whose allocated `network` (subnet) contains
-- that IP — e.g. searching "10.250.60.138" finds the row assigned as
-- 10.250.60.137/30 (network 10.250.60.136/30). Excludes exact ip_address
-- matches since those are already surfaced by the plain IP search.
-- ============================================================================
drop function if exists search_ip_assignments_containing_ip(inet);
create function search_ip_assignments_containing_ip(p_ip inet)
returns setof ip_assignments
language sql
stable
as $$
  select a.*
  from ip_assignments a
  where a.import_batch_id = (select id from latest_import_batch)
    and a.network is not null
    and a.ip_address <> p_ip
    and p_ip <<= a.network
  order by a.network;
$$;

grant execute on function search_ip_assignments_containing_ip(inet) to anon, authenticated;
