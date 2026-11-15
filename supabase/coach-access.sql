-- Athletes who also coach (e.g. Cole coaches Landon).
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
--
-- The head coach picks, in the app, which teammates an athlete may coach.
-- That athlete keeps their own login and workouts, and can also see and change
-- only those teammates: their athlete record (maxes), programs assigned to
-- them, their workouts and their form videos. They can make their own programs
-- and exercises and change those, but never the head coach's (changing one
-- for an athlete makes that athlete a copy). Everyone else stays hidden.

-- Who may coach whom. Only the head coach can change it.
create table if not exists coach_access (
  team_id uuid not null references teams on delete cascade,
  coach_athlete_id text not null,          -- the athlete who gets coaching rights
  athlete_ids text[] not null default '{}', -- the athletes they may coach
  updated_at timestamptz not null default now(),
  primary key (team_id, coach_athlete_id)
);
alter table coach_access enable row level security;

drop policy if exists coach_access_read on coach_access;
create policy coach_access_read on coach_access for select
  using (is_coach(team_id) or coach_athlete_id = my_athlete_id(team_id));
drop policy if exists coach_access_write on coach_access;
create policy coach_access_write on coach_access for all
  using (is_coach(team_id)) with check (is_coach(team_id));

-- The athletes the signed-in athlete may coach in team t ({} for everyone else).
create or replace function coached_ids(t uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((
    select array_remove(c.athlete_ids, m.athlete_id)
    from members m join coach_access c on c.team_id = m.team_id and c.coach_athlete_id = m.athlete_id
    where m.team_id = t and m.user_id = auth.uid() and m.role = 'athlete'
  ), '{}');
$$;
grant execute on function coached_ids(uuid) to authenticated;

-- Reading: as before, plus the coached athletes' records, programs and logs.
drop policy if exists records_read on records;
create policy records_read on records for select using (
  is_coach(team_id)
  or (is_member(team_id) and (
    kind in ('exercises', 'blocks')
    or (kind = 'athletes' and (id = my_athlete_id(team_id) or id = any(coached_ids(team_id))))
    or (kind in ('logs', 'assignments') and (data->>'athleteId' = my_athlete_id(team_id) or data->>'athleteId' = any(coached_ids(team_id))))
  ))
);

-- Writing: as before, plus for a helper coach: the coached athletes' record,
-- assignments and logs, and programs/exercises they made themselves (the app
-- stamps those with createdBy = their login id; a row that exists already
-- must carry their id too, so the head coach's can't be changed).
drop policy if exists records_write on records;
create policy records_write on records for all
  using (
    is_coach(team_id)
    or (kind = 'logs' and data->>'athleteId' = my_athlete_id(team_id))
    or (kind = 'athletes' and id = my_athlete_id(team_id))
    or (kind = 'athletes' and id = any(coached_ids(team_id)))
    or (kind in ('logs', 'assignments') and data->>'athleteId' = any(coached_ids(team_id)))
    or (kind in ('blocks', 'exercises') and data->>'createdBy' = auth.uid()::text and cardinality(coached_ids(team_id)) > 0)
  )
  with check (
    is_coach(team_id)
    or (kind = 'logs' and data->>'athleteId' = my_athlete_id(team_id))
    or (kind = 'athletes' and id = my_athlete_id(team_id))
    or (kind = 'athletes' and id = any(coached_ids(team_id)))
    or (kind in ('logs', 'assignments') and data->>'athleteId' = any(coached_ids(team_id)))
    or (kind in ('blocks', 'exercises') and data->>'createdBy' = auth.uid()::text and cardinality(coached_ids(team_id)) > 0)
  );

-- Form videos: a helper coach can watch (and add) clips of athletes they coach.
create or replace function can_use_video(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(path, '/'); t uuid;
begin
  begin t := parts[1]::uuid; exception when others then return false; end;
  return is_coach(t) or (parts[2] is not null and (parts[2] = my_athlete_id(t) or parts[2] = any(coached_ids(t))));
end $$;
grant execute on function can_use_video(text) to authenticated;

-- Removing an athlete from the team also removes their coaching rights, and
-- them from anyone else's list.
create or replace function remove_athlete(t uuid, aid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_coach(t) then raise exception 'Only the coach can remove athletes'; end if;
  delete from members where team_id = t and athlete_id = aid and role = 'athlete';
  delete from coach_access where team_id = t and coach_athlete_id = aid;
  update coach_access set athlete_ids = array_remove(athlete_ids, aid) where team_id = t and aid = any(athlete_ids);
end $$;
grant execute on function remove_athlete(uuid, text) to authenticated;
