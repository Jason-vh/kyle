UPDATE messages
SET data = jsonb_set(
  data,
  '{content,0,text}',
  to_jsonb(regexp_replace(data->'content'->0->>'text', '^\[\d{1,2}:\d{2}\s[AP]M\s[A-Z]{1,5}\]\s*', ''))
)
WHERE role = 'user'
AND data->'content'->0->>'text' ~ '^\[\d{1,2}:\d{2}\s[AP]M\s[A-Z]{1,5}\]';
