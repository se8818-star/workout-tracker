-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- Every app record (exercise, athlete, block, assignment, log) is one row in
-- `records`, keyed by team + kind + id, with the record itself in `data`.

create extension if not exists pgcrypto;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

create table if not exists members (
  user_id uuid not null references auth.users on delete cascade,
  team_id uuid not null references teams on delete cascade,
  role text not null check (role in ('coach', 'athlete')),
  athlete_id text,            -- the athlete record this login owns (athletes only)
  primary key (user_id, team_id)
);

create table if not exists records (
  team_id uuid not null references teams on delete cascade,
  kind text not null check (kind in ('exercises', 'athletes', 'blocks', 'assignments', 'logs')),
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (team_id, kind, id)
);
create index if not exists records_updated on records (team_id, updated_at);

-- The server stamps every write, so devices with wrong clocks still sync in order.
create or replace function stamp_record() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists records_stamp on records;
create trigger records_stamp before insert or update on records
  for each row execute function stamp_record();

alter table teams enable row level security;
alter table members enable row level security;
alter table records enable row level security;

-- Helpers (security definer so policies can look at members without recursion).
create or replace function is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where team_id = t and user_id = auth.uid());
$$;

create or replace function is_coach(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where team_id = t and user_id = auth.uid() and role = 'coach');
$$;

create or replace function my_athlete_id(t uuid) returns text
language sql stable security definer set search_path = public as $$
  select athlete_id from members where team_id = t and user_id = auth.uid();
$$;

drop policy if exists teams_read on teams;
create policy teams_read on teams for select using (is_member(id));

drop policy if exists members_read on members;
create policy members_read on members for select using (is_member(team_id));

drop policy if exists records_read on records;
create policy records_read on records for select using (is_member(team_id));

-- Coaches can write anything in their team. Athletes can write only their own
-- logs and their own athlete record (so new maxes from PRs are saved).
drop policy if exists records_write on records;
create policy records_write on records for all
  using (
    is_coach(team_id)
    or (kind = 'logs' and data->>'athleteId' = my_athlete_id(team_id))
    or (kind = 'athletes' and id = my_athlete_id(team_id))
  )
  with check (
    is_coach(team_id)
    or (kind = 'logs' and data->>'athleteId' = my_athlete_id(team_id))
    or (kind = 'athletes' and id = my_athlete_id(team_id))
  );

-- A coach creates a team; returns its id. The join code is in `teams`.
create or replace function create_team(team_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  insert into teams (name) values (team_name) returning id into t;
  insert into members (user_id, team_id, role) values (auth.uid(), t, 'coach');
  return t;
end $$;

-- An athlete joins with the coach's code; creates their athlete record.
create or replace function join_team(code text, athlete_name text, athlete_group text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; aid text;
begin
  select id into t from teams where join_code = upper(trim(code));
  if t is null then raise exception 'No team with that code'; end if;
  if exists (select 1 from members where team_id = t and user_id = auth.uid()) then return t; end if;
  aid := 'ath-' || substr(md5(random()::text), 1, 10);
  insert into members (user_id, team_id, role, athlete_id) values (auth.uid(), t, 'athlete', aid);
  insert into records (team_id, kind, id, data)
    values (t, 'athletes', aid, jsonb_build_object('id', aid, 'name', athlete_name, 'group', athlete_group, 'maxes', '{}'::jsonb));
  return t;
end $$;

grant execute on function create_team(text) to authenticated;
grant execute on function join_team(text, text, text) to authenticated;
