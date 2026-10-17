-- User-requested naming update only. Source memberships and Discord admin
-- memberships remain necessary controls and are deliberately untouched.
begin;

-- Rename in place: row identity, revision, foreign keys, forced RLS, owner and
-- table grants remain attached to the same relation and composite-type OIDs.
alter table public.discord_guild_policies rename to discord_view_policies;

-- SQL and PL/pgSQL string bodies are not rewritten by ALTER TABLE RENAME.
-- Recreate the same functions in place from PostgreSQL's canonical definitions,
-- changing only the table token. This preserves signatures, return types,
-- security mode, volatility, configuration settings, ownership and existing ACLs.
do $$
declare routine record;
begin
 for routine in
  select p.oid,pg_get_functiondef(p.oid) definition
  from pg_proc p
  where p.pronamespace='public'::regnamespace and p.prokind='f'
   and position('discord_guild_policies' in p.prosrc)>0
  order by p.oid
 loop
  execute replace(routine.definition,'discord_guild_policies','discord_view_policies');
 end loop;
end $$;

-- Keep the owning table's generated constraint/index names consistent too.
-- Renaming a primary-key constraint also renames its supporting index.
do $$
declare constraint_row record;
begin
 for constraint_row in
  select conname from pg_constraint
  where conrelid='public.discord_view_policies'::regclass
   and conname like 'discord_guild_policies%'
 loop
  execute format('alter table public.discord_view_policies rename constraint %I to %I',
   constraint_row.conname,replace(constraint_row.conname,'discord_guild_policies','discord_view_policies'));
 end loop;
end $$;

notify pgrst,'reload schema';
commit;
