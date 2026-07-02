-- Transmission Hub — HW Alarm schema extension
-- Adds tables, views, and dashboard metrics for hardware alarm data
-- (Alarm_Summary, Alarm_Details, Errors from hw_alarm_*.xlsx).

-- ============================================================================
-- Extend import_batches with hw_alarm row counts
-- ============================================================================
alter table import_batches add column if not exists hw_alarm_summary_rows  int default 0;
alter table import_batches add column if not exists hw_alarm_detail_rows   int default 0;
alter table import_batches add column if not exists hw_alarm_error_rows    int default 0;

-- ============================================================================
-- hw_alarm_summary — one row per device, aggregated alarm counts + status
-- ============================================================================
create table if not exists hw_alarm_summary (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  device_name       text,
  device_ip         inet,
  vendor            text,
  critical          int default 0,
  major             int default 0,
  minor             int default 0,
  power_status      text,
  fan_status        text,
  max_temp          text,
  temp_threshold    text,
  overall_status    text,
  captured_at       timestamptz
);

create index if not exists idx_hw_alarm_summary_batch on hw_alarm_summary (import_batch_id);
create index if not exists idx_hw_alarm_summary_device_name on hw_alarm_summary (device_name);
create index if not exists idx_hw_alarm_summary_device_ip on hw_alarm_summary (device_ip);
create index if not exists idx_hw_alarm_summary_vendor on hw_alarm_summary (vendor);
create index if not exists idx_hw_alarm_summary_overall_status on hw_alarm_summary (overall_status);
create index if not exists idx_hw_alarm_summary_device_name_trgm on hw_alarm_summary using gin (device_name gin_trgm_ops);

-- ============================================================================
-- hw_alarm_details — individual alarm/environment entries per device
-- ============================================================================
create table if not exists hw_alarm_details (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  device_name       text,
  device_ip         inet,
  vendor            text,
  category          text,
  severity          text,
  component         text,
  status            text,
  detail            text,
  captured_at       timestamptz
);

create index if not exists idx_hw_alarm_details_batch on hw_alarm_details (import_batch_id);
create index if not exists idx_hw_alarm_details_device_name on hw_alarm_details (device_name);
create index if not exists idx_hw_alarm_details_device_ip on hw_alarm_details (device_ip);
create index if not exists idx_hw_alarm_details_vendor on hw_alarm_details (vendor);
create index if not exists idx_hw_alarm_details_category on hw_alarm_details (category);
create index if not exists idx_hw_alarm_details_severity on hw_alarm_details (severity);
create index if not exists idx_hw_alarm_details_status on hw_alarm_details (status);
create index if not exists idx_hw_alarm_details_device_name_trgm on hw_alarm_details using gin (device_name gin_trgm_ops);
-- Composite index for enriched view LATERAL JOIN (match key)
create index if not exists idx_hw_alarm_details_match on hw_alarm_details (import_batch_id, device_name, device_ip, category, component);

-- ============================================================================
-- hw_alarm_errors — devices that failed collection
-- ============================================================================
create table if not exists hw_alarm_errors (
  id                uuid primary key default gen_random_uuid(),
  import_batch_id   uuid references import_batches(id) on delete cascade,
  device_name       text,
  device_ip         inet,
  vendor            text,
  error             text
);

create index if not exists idx_hw_alarm_errors_batch on hw_alarm_errors (import_batch_id);
create index if not exists idx_hw_alarm_errors_device_name on hw_alarm_errors (device_name);

-- ============================================================================
-- RLS + Policies
-- ============================================================================
alter table hw_alarm_summary enable row level security;
alter table hw_alarm_details enable row level security;
alter table hw_alarm_errors  enable row level security;

drop policy if exists "Public read" on hw_alarm_summary;
drop policy if exists "Public read" on hw_alarm_details;
drop policy if exists "Public read" on hw_alarm_errors;

create policy "Public read" on hw_alarm_summary for select using (true);
create policy "Public read" on hw_alarm_details for select using (true);
create policy "Public read" on hw_alarm_errors  for select using (true);

-- ============================================================================
-- Latest views
-- ============================================================================
create or replace view latest_hw_alarm_summary with (security_invoker = true) as
select h.*
from hw_alarm_summary h
where h.import_batch_id = (select id from latest_import_batch);

create or replace view latest_hw_alarm_details with (security_invoker = true) as
select h.*
from hw_alarm_details h
where h.import_batch_id = (select id from latest_import_batch);

create or replace view latest_hw_alarm_errors with (security_invoker = true) as
select h.*
from hw_alarm_errors h
where h.import_batch_id = (select id from latest_import_batch);

-- ============================================================================
-- Enriched views — delta comparison with previous batch
-- ============================================================================
create or replace view latest_hw_alarm_summary_enriched with (security_invoker = true) as
select curr.*,
  prev.overall_status as prev_overall_status,
  prev.critical       as prev_critical,
  prev.major          as prev_major,
  prev.minor          as prev_minor,
  not exists (
    select 1 from hw_alarm_summary p
    where p.import_batch_id = (select id from previous_import_batch)
      and p.device_name is not distinct from curr.device_name
      and p.device_ip is not distinct from curr.device_ip
  ) as is_new
from hw_alarm_summary curr
left join lateral (
  select p.overall_status, p.critical, p.major, p.minor
  from hw_alarm_summary p
  where p.import_batch_id = (select id from previous_import_batch)
    and p.device_name is not distinct from curr.device_name
    and p.device_ip is not distinct from curr.device_ip
  limit 1
) prev on true
where curr.import_batch_id = (select id from latest_import_batch);

create or replace view latest_hw_alarm_details_enriched with (security_invoker = true) as
select curr.*,
  prev.severity as prev_severity,
  prev.status   as prev_status,
  not exists (
    select 1 from hw_alarm_details p
    where p.import_batch_id = (select id from previous_import_batch)
      and p.device_name is not distinct from curr.device_name
      and p.device_ip is not distinct from curr.device_ip
      and p.category is not distinct from curr.category
      and p.component is not distinct from curr.component
  ) as is_new
from hw_alarm_details curr
left join lateral (
  select p.severity, p.status
  from hw_alarm_details p
  where p.import_batch_id = (select id from previous_import_batch)
    and p.device_name is not distinct from curr.device_name
    and p.device_ip is not distinct from curr.device_ip
    and p.category is not distinct from curr.category
    and p.component is not distinct from curr.component
  limit 1
) prev on true
where curr.import_batch_id = (select id from latest_import_batch);

-- ============================================================================
-- Extend dashboard_summary — CREATE OR REPLACE (never DROP)
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
  ) as bgp_flap_total_increase,

  -- ---- HW Alarm metrics (current batch) ----
  (select count(*) from latest_hw_alarm_summary)                                      as hw_alarm_total_devices,
  (select count(*) from latest_hw_alarm_summary where overall_status = 'Critical')    as hw_alarm_critical,
  (select count(*) from latest_hw_alarm_summary where overall_status = 'Warning')     as hw_alarm_warning,
  (select count(*) from latest_hw_alarm_summary where overall_status = 'OK')          as hw_alarm_ok,
  (select coalesce(sum(critical), 0) from latest_hw_alarm_summary)                    as hw_alarm_detail_critical,
  (select coalesce(sum(major), 0) from latest_hw_alarm_summary)                       as hw_alarm_detail_major,
  (select coalesce(sum(minor), 0) from latest_hw_alarm_summary)                       as hw_alarm_detail_minor,
  (select count(*) from latest_hw_alarm_errors)                                       as hw_alarm_collection_errors,

  -- ---- HW Alarm metrics (previous batch) ----
  (select count(*) from hw_alarm_summary where import_batch_id = (select id from previous_import_batch))                                   as prev_hw_alarm_total_devices,
  (select count(*) from hw_alarm_summary where import_batch_id = (select id from previous_import_batch) and overall_status = 'Critical')   as prev_hw_alarm_critical,
  (select count(*) from hw_alarm_summary where import_batch_id = (select id from previous_import_batch) and overall_status = 'Warning')    as prev_hw_alarm_warning,
  (select count(*) from hw_alarm_summary where import_batch_id = (select id from previous_import_batch) and overall_status = 'OK')         as prev_hw_alarm_ok,
  (select coalesce(sum(critical), 0) from hw_alarm_summary where import_batch_id = (select id from previous_import_batch))                 as prev_hw_alarm_detail_critical,
  (select coalesce(sum(major), 0) from hw_alarm_summary where import_batch_id = (select id from previous_import_batch))                    as prev_hw_alarm_detail_major,
  (select coalesce(sum(minor), 0) from hw_alarm_summary where import_batch_id = (select id from previous_import_batch))                    as prev_hw_alarm_detail_minor,
  (select count(*) from hw_alarm_errors where import_batch_id = (select id from previous_import_batch))                                    as prev_hw_alarm_collection_errors;
