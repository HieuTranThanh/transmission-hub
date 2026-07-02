-- ============================================================================
-- 003: Add ospf_neighbors_disappeared to dashboard_summary
--
-- Detects OSPF neighbor links that existed in the previous batch but are
-- completely absent in the current batch — may indicate lost connectivity
-- or data collection gap.
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
  (select count(*) from hw_alarm_errors where import_batch_id = (select id from previous_import_batch))                                    as prev_hw_alarm_collection_errors,

  -- OSPF neighbors that existed in previous batch but are missing in current batch
  (select count(*) from ospf_neighbors prev
   where prev.import_batch_id = (select id from previous_import_batch)
     and not exists (
       select 1 from ospf_neighbors curr
       where curr.import_batch_id = (select id from latest_import_batch)
         and curr.device_name is not distinct from prev.device_name
         and curr.neighbor_ip is not distinct from prev.neighbor_ip
     )
  ) as ospf_neighbors_disappeared;
