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

-- Only these emails can create a team (and so get the coach view). Everyone
-- else can only join a team as an athlete. Add yours after running this file:
--   insert into coach_emails (email) values ('you@example.com');
create table if not exists coach_emails (
  email text primary key
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

-- A finished workout is never overwritten by an unfinished copy from another
-- device (e.g. a coach's phone that hadn't caught up yet). Deleting it still works.
create or replace function keep_finished_log() returns trigger
language plpgsql as $$
begin
  if old.kind = 'logs' and not old.deleted and coalesce((old.data->>'finished')::boolean, false)
     and not new.deleted and not coalesce((new.data->>'finished')::boolean, false) then
    -- Keep the finished version. records_stamp (which runs after this) gives it a
    -- new updated_at, so the device that sent the stale copy pulls it back.
    return old;
  end if;
  return new;
end $$;

drop trigger if exists records_keep_finished on records;
create trigger records_keep_finished before update on records
  for each row execute function keep_finished_log();

alter table teams enable row level security;
alter table members enable row level security;
alter table records enable row level security;
-- No policies on coach_emails: the list is only read inside can_coach().
alter table coach_emails enable row level security;

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

create or replace function can_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from coach_emails where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

drop policy if exists members_read on members;
create policy members_read on members for select using (user_id = auth.uid() or is_coach(team_id));

-- Coaches read everything in their team. Athletes read the shared library and
-- programs, plus only their own athlete record, assignments and logs.
drop policy if exists records_read on records;
create policy records_read on records for select using (
  is_coach(team_id)
  or (is_member(team_id) and (
    kind in ('exercises', 'blocks')
    or (kind = 'athletes' and id = my_athlete_id(team_id))
    or (kind in ('logs', 'assignments') and data->>'athleteId' = my_athlete_id(team_id))
  ))
);

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
  if not can_coach() then raise exception 'Only an approved coach email can create a team. Ask your coach for the team code.'; end if;
  insert into teams (name) values (team_name) returning id into t;
  insert into members (user_id, team_id, role) values (auth.uid(), t, 'coach');
  return t;
end $$;

-- Lets the sign-up screen check a team code before emailing anyone.
-- Returns the team's name, or null when no team has that code.
create or replace function team_for_code(code text) returns text
language sql stable security definer set search_path = public as $$
  select name from teams where join_code = upper(trim(code));
$$;

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

-- A coach removes an athlete: their login loses access to the team. The app
-- deletes the athlete's records itself (coaches can write any team record).
create or replace function remove_athlete(t uuid, aid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_coach(t) then raise exception 'Only the coach can remove athletes'; end if;
  delete from members where team_id = t and athlete_id = aid and role = 'athlete';
end $$;

grant execute on function create_team(text) to authenticated;
grant execute on function remove_athlete(uuid, text) to authenticated;
grant execute on function can_coach() to authenticated;
grant execute on function team_for_code(text) to anon, authenticated;
grant execute on function join_team(text, text, text) to authenticated;

-- Form-check videos: a private Storage bucket. Files sit under
-- <team id>/<athlete id>/. The coach sees every clip in the team; an athlete
-- uploads, watches and deletes only their own. The app keeps clips 14 days.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-videos', 'form-videos', false, 52428800, array['video/*'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function can_use_video(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(path, '/'); t uuid;
begin
  begin t := parts[1]::uuid; exception when others then return false; end;
  return is_coach(t) or (parts[2] is not null and parts[2] = my_athlete_id(t));
end $$;
grant execute on function can_use_video(text) to authenticated;

drop policy if exists form_videos_read on storage.objects;
create policy form_videos_read on storage.objects for select to authenticated
  using (bucket_id = 'form-videos' and public.can_use_video(name));
drop policy if exists form_videos_add on storage.objects;
create policy form_videos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'form-videos' and public.can_use_video(name));
drop policy if exists form_videos_delete on storage.objects;
create policy form_videos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'form-videos' and public.can_use_video(name));
