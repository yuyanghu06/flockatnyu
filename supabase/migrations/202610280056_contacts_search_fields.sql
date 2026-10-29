-- Fetch only bounded directory fields across the network. The existing search
-- still owns filtering, ranking and limit-plus-one paging inside the database.
-- No contact, raw provider object, lookup email or timestamp is rewritten.
begin;

create function public.contacts_search_fields(
 p_query text default '', p_limit integer default 5, p_offset integer default 0,
 p_name text default '', p_workplace text default '',
 p_email_presence text default 'any', p_phone_presence text default 'any',
 p_sort text default 'auto'
) returns table(id uuid, created_at timestamptz, updated_at timestamptz, fields jsonb)
language sql stable security invoker set search_path='' as $$
 select c.id,c.created_at,c.updated_at,
  public.contact_fields(c.raw_input,c.lookup_email) as fields
 from public.contacts_search(
  p_query,p_limit,p_offset,p_name,p_workplace,p_email_presence,p_phone_presence,p_sort
 ) with ordinality as c
 order by c.ordinality;
$$;

revoke all on function public.contacts_search_fields(text,integer,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.contacts_search_fields(text,integer,integer,text,text,text,text,text) to service_role;
comment on function public.contacts_search_fields(text,integer,integer,text,text,text,text,text) is 'Service-only read-only Contacts directory search. Returns only ID, timestamps and six bounded display fields, preserving existing search order and limit+1 coverage. Full native profiles stay unchanged in contacts.';

notify pgrst, 'reload schema';
commit;
