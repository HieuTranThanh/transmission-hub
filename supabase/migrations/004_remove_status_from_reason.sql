-- Remove status-related lines from resource_candidates.reason
-- These duplicate candidate_type / current_status columns and pollute the "Lý do" filter.
-- Process each pattern separately to avoid overlapping-newline issues.

update resource_candidates
set reason = nullif(
  trim(both E'\n' from
    regexp_replace(
      regexp_replace(
        regexp_replace(reason,
          'Trạng thái vận hành \(oper_state\): Down\n?', '', 'g'),
        'Trạng thái: [^\n]+\n?', '', 'g'),
      '\n{2,}', E'\n', 'g')
  ),
  ''
)
where reason like '%Trạng thái%';
