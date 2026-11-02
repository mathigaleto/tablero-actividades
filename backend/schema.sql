create table public.tablero_members (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null, name text not null,
 admin boolean not null default false, active boolean not null default true
);
create table public.tablero_state (
 id integer primary key check(id=1), revision integer not null default 0,
 data jsonb not null default '{"tasks":[],"people":[],"companies":[],"auditHistory":[]}'::jsonb
);
create table public.tablero_audit (
 id bigint generated always as identity primary key,
 actor uuid references auth.users(id), username text not null,
 changed_at timestamptz not null default now(), revision integer not null
);
create index tablero_audit_actor_idx on public.tablero_audit(actor);
alter table public.tablero_members enable row level security;
alter table public.tablero_state enable row level security;
alter table public.tablero_audit enable row level security;
create policy backend_only on public.tablero_members for all to anon,authenticated using(false) with check(false);
create policy backend_only on public.tablero_state for all to anon,authenticated using(false) with check(false);
create policy backend_only on public.tablero_audit for all to anon,authenticated using(false) with check(false);
revoke all on public.tablero_members,public.tablero_state,public.tablero_audit from anon,authenticated;
grant all on public.tablero_members,public.tablero_state,public.tablero_audit to service_role;
grant usage,select on sequence public.tablero_audit_id_seq to service_role;
create function public.tablero_save(expected integer,payload jsonb,actor_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare next_revision integer; actor_name text;
begin
 select username into actor_name from public.tablero_members where id=actor_id and active=true;
 if actor_name is null then raise exception 'not_authorized'; end if;
 update public.tablero_state set data=payload,revision=revision+1 where id=1 and revision=expected returning revision into next_revision;
 if next_revision is null then raise exception 'revision_conflict'; end if;
 insert into public.tablero_audit(actor,username,revision) values(actor_id,actor_name,next_revision);
 return next_revision;
end;
$$;
revoke all on function public.tablero_save(integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.tablero_save(integer,jsonb,uuid) to service_role;
