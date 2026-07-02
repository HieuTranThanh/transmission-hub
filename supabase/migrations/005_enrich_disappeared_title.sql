-- ============================================================================
-- 005: Thêm neighbor_device_name vào title của OSPF_NEIGHBOR_DISAPPEARED
--
-- Title cũ:  CSG-DLBT52: OSPF neighbor 10.250.57.142 không còn trong batch mới
-- Title mới: CSG-DLBT52: OSPF neighbor 10.250.57.142 (R2-LAB) không còn trong batch mới
--
-- Trích neighbor_device_name từ cột detail (text) thay vì evidence (jsonb)
-- để tránh lỗi parse JSON với các row cũ.
-- Detail format: "neighbor_router_id=1.2.3.4, neighbor_device=R2-LAB, prev_state=Full"
-- ============================================================================

update audit_findings
set title =
  regexp_replace(title, ' không còn trong batch mới$', '') ||
  coalesce(
    ' (' || substring(detail from 'neighbor_device=([^,]+)') || ')',
    ''
  ) ||
  ' không còn trong batch mới'
where rule_code = 'OSPF_NEIGHBOR_DISAPPEARED'
  and title !~ '\(.*\) không còn trong batch mới'
  and detail ~ 'neighbor_device=[^,]+'
  and substring(detail from 'neighbor_device=([^,]+)') != '?'
  and substring(detail from 'neighbor_device=([^,]+)') != '';
