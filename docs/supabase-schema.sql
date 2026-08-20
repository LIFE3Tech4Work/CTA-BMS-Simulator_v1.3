-- ════════════════════════════════════════════════════════════════════════════
-- CTA BMS Simulator — Supabase schema
--
-- Run this once in the Supabase SQL Editor (paste the whole file, hit Run).
--
-- Model:
--   • Students create their own accounts (email + password, self-signup).
--   • Instructors create CLASSES and share a join code.
--   • Students join a class with that code.
--   • Exercises are assigned to a class, not to individual named seats.
--   • Attempts record who started what, when they passed, and what they changed.
--
-- Security stance: the publishable key ships in the browser and is readable by
-- anyone, so every table below is protected by Row Level Security. The policies
-- are the security model — not the key.
--
-- The one escalation risk in a self-signup system is a student making themselves
-- an instructor. Two things prevent it: new profiles are created by a trigger
-- that always writes role='student', and UPDATE on profiles is granted only on
-- the display_name column, so the role column cannot be written from the client
-- at all. Promoting an instructor is done by hand in the Table Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'student'
                 check (role in ('student', 'instructor')),
  created_at   timestamptz not null default now()
);

-- A profile row is created automatically on signup. security definer is required
-- so the trigger can write to profiles regardless of the caller's own policies.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'student'   -- always: role is never taken from client-supplied signup data
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Used by policies below. security definer avoids the infinite recursion you get
-- when a policy on profiles has to read profiles to decide access.
create or replace function public.is_instructor()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'instructor'
  );
$$;

-- ─── Classes and enrolment ───────────────────────────────────────────────────
create table if not exists public.classes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  join_code     text not null unique,
  instructor_id uuid not null references auth.users on delete cascade,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.enrollments (
  class_id   uuid not null references public.classes on delete cascade,
  student_id uuid not null references auth.users on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- Joining by code, as a function rather than a policy: a student must be able to
-- act on a code they were given WITHOUT being able to read the classes table and
-- enumerate every code in the system.
create or replace function public.join_class(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  select id into target
  from public.classes
  where upper(trim(join_code)) = upper(trim(code)) and archived = false;

  if target is null then
    raise exception 'No open class with that join code';
  end if;

  insert into public.enrollments (class_id, student_id)
  values (target, auth.uid())
  on conflict do nothing;

  return target;
end;
$$;

-- ─── Exercises ───────────────────────────────────────────────────────────────
create table if not exists public.exercises (
  id           text primary key,
  title        text not null,
  unit_id      text not null,
  instructions text,
  setup        jsonb not null default '{}',   -- point key -> value to apply
  weather      jsonb,                         -- null = leave live weather alone
  goal         jsonb not null,                -- {key, label, unit, comparator, target, tolerance}
  class_id     uuid references public.classes on delete cascade,
  published    boolean not null default false,
  created_by   uuid references auth.users,
  created_at   timestamptz not null default now()
);

create index if not exists exercises_class_idx on public.exercises (class_id);

-- ─── Attempts ────────────────────────────────────────────────────────────────
create table if not exists public.attempts (
  id          bigserial primary key,
  exercise_id text not null references public.exercises on delete cascade,
  student_id  uuid not null references auth.users on delete cascade,
  started_at  timestamptz not null default now(),
  passed_at   timestamptz,
  actions     jsonb not null default '[]',    -- [{at, unit, key, from, to}]
  unique (exercise_id, student_id)
);

-- The student's written answer, and the diagram state they left behind. Added after
-- the diagnosis scenarios landed: those ask a student to explain what the evidence
-- shows, so the reasoning is the graded artifact and storing only passed/not-passed
-- would throw the work away.
alter table public.attempts add column if not exists diagnosis text;
alter table public.attempts add column if not exists progress jsonb not null default '{}';

create index if not exists attempts_exercise_idx on public.attempts (exercise_id);

-- ─── Groups (teams within a class) ────────────────────────────────────────
-- Team projects: an instructor assigns one exercise to Team A rather than ticking
-- its three members individually on every exercise, and the results table can then
-- report per team instead of as unrelated rows.
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups on delete cascade,
  student_id uuid not null references auth.users on delete cascade,
  primary key (group_id, student_id)
);

create index if not exists group_members_student_idx on public.group_members (student_id);
create index if not exists groups_class_idx on public.groups (class_id);

-- ─── Assignments ────────────────────────────────────────────────────────
-- An exercise is targeted at a whole class, at specific groups, or at individual
-- students. Modelled as its own table rather than columns on exercises, because one
-- exercise can go to two teams and a lone student at once, and because a targeting
-- column would have to be rewritten every time the shape of "who gets this" grew.
--
-- Exactly one of class_id / group_id / student_id is set per row; the check keeps a
-- half-filled row out of the table rather than trusting every caller to be careful.
create table if not exists public.assignments (
  id          bigserial primary key,
  exercise_id text not null references public.exercises on delete cascade,
  class_id    uuid references public.classes on delete cascade,
  group_id    uuid references public.groups  on delete cascade,
  student_id  uuid references auth.users     on delete cascade,
  created_at  timestamptz not null default now(),
  constraint assignments_one_target check (
    (class_id is not null)::int + (group_id is not null)::int + (student_id is not null)::int = 1
  )
);

create index if not exists assignments_exercise_idx on public.assignments (exercise_id);
create index if not exists assignments_student_idx  on public.assignments (student_id);
create index if not exists assignments_group_idx    on public.assignments (group_id);

-- Does this exercise reach me? Answers the class / group / individual cases in one
-- place, so the read policy below stays readable and the app never reimplements it.
create or replace function public.is_assigned_to_me(ex_id text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a
    where a.exercise_id = ex_id
      and (
        a.student_id = auth.uid()
        or exists (select 1 from public.group_members gm
                   where gm.group_id = a.group_id and gm.student_id = auth.uid())
        or exists (select 1 from public.enrollments e
                   where e.class_id = a.class_id and e.student_id = auth.uid())
      )
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════════════
alter table public.profiles      enable row level security;
alter table public.classes       enable row level security;
alter table public.enrollments   enable row level security;
alter table public.exercises     enable row level security;
alter table public.attempts      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.assignments   enable row level security;
alter table public.review_flags  enable row level security;

-- Profiles ───────────────────────────────────────────────────────────────────
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (id = auth.uid() or public.is_instructor());

drop policy if exists "update own display name" on public.profiles;
create policy "update own display name" on public.profiles
  for update using (id = auth.uid());

-- Column-level grant is what actually makes role unwritable from the client.
-- A policy alone would still permit a student to set role = 'instructor'.
revoke update on public.profiles from authenticated;
grant  update (display_name) on public.profiles to authenticated;

-- Classes ────────────────────────────────────────────────────────────────────
drop policy if exists "instructors manage own classes" on public.classes;
create policy "instructors manage own classes" on public.classes
  for all using (instructor_id = auth.uid() and public.is_instructor())
  with check (instructor_id = auth.uid() and public.is_instructor());

drop policy if exists "students read enrolled classes" on public.classes;
create policy "students read enrolled classes" on public.classes
  for select using (exists (
    select 1 from public.enrollments e
    where e.class_id = id and e.student_id = auth.uid()
  ));

-- Enrolments ─────────────────────────────────────────────────────────────────
drop policy if exists "read own enrollment" on public.enrollments;
create policy "read own enrollment" on public.enrollments
  for select using (
    student_id = auth.uid()
    or exists (select 1 from public.classes c
               where c.id = class_id and c.instructor_id = auth.uid())
  );

-- Instructors can remove a student from their own class.
drop policy if exists "instructors manage own roster" on public.enrollments;
create policy "instructors manage own roster" on public.enrollments
  for delete using (exists (
    select 1 from public.classes c
    where c.id = class_id and c.instructor_id = auth.uid()
  ));

-- Groups ─────────────────────────────────────────────────────────────────
drop policy if exists "instructors manage groups in own classes" on public.groups;
create policy "instructors manage groups in own classes" on public.groups
  for all using (exists (
    select 1 from public.classes c
    where c.id = class_id and c.instructor_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.classes c
    where c.id = class_id and c.instructor_id = auth.uid()
  ));

-- A student can see the teams in a class they are enrolled in — they need to know
-- who they are working with.
drop policy if exists "students read groups in own classes" on public.groups;
create policy "students read groups in own classes" on public.groups
  for select using (exists (
    select 1 from public.enrollments e
    where e.class_id = class_id and e.student_id = auth.uid()
  ));

drop policy if exists "instructors manage group members" on public.group_members;
create policy "instructors manage group members" on public.group_members
  for all using (exists (
    select 1 from public.groups g join public.classes c on c.id = g.class_id
    where g.id = group_id and c.instructor_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.groups g join public.classes c on c.id = g.class_id
    where g.id = group_id and c.instructor_id = auth.uid()
  ));

drop policy if exists "students read own group membership" on public.group_members;
create policy "students read own group membership" on public.group_members
  for select using (exists (
    select 1 from public.group_members mine
    where mine.group_id = group_id and mine.student_id = auth.uid()
  ));

-- Assignments ───────────────────────────────────────────────────────────
drop policy if exists "instructors manage own assignments" on public.assignments;
create policy "instructors manage own assignments" on public.assignments
  for all using (exists (
    select 1 from public.exercises x
    where x.id = exercise_id and x.created_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.exercises x
    where x.id = exercise_id and x.created_by = auth.uid()
  ));

drop policy if exists "students read assignments that reach them" on public.assignments;
create policy "students read assignments that reach them" on public.assignments
  for select using (
    student_id = auth.uid()
    or exists (select 1 from public.group_members gm
               where gm.group_id = group_id and gm.student_id = auth.uid())
    or exists (select 1 from public.enrollments e
               where e.class_id = class_id and e.student_id = auth.uid())
  );

-- Exercises ──────────────────────────────────────────────────────────────────
drop policy if exists "instructors manage own exercises" on public.exercises;
create policy "instructors manage own exercises" on public.exercises
  for all using (created_by = auth.uid() and public.is_instructor())
  with check (created_by = auth.uid() and public.is_instructor());

-- A student sees a published exercise when an assignment reaches them — directly,
-- through a group, or through their class. Unpublished drafts stay invisible, so an
-- instructor can build in the open.
drop policy if exists "students read published class exercises" on public.exercises;
drop policy if exists "students read assigned exercises" on public.exercises;
create policy "students read assigned exercises" on public.exercises
  for select using (published = true and public.is_assigned_to_me(id));

-- Review flags ───────────────────────────────────────────────────────────────
-- Any instructor may read and resolve any flag: this is a shared QA queue, and one
-- instructor being unable to see what another raised defeats the point. Students have
-- no access at all — a list of "things that look broken" is not theirs to read.
drop policy if exists "instructors manage review flags" on public.review_flags;
create policy "instructors manage review flags" on public.review_flags
  for all using (public.is_instructor())
  with check (public.is_instructor());

-- Attempts ───────────────────────────────────────────────────────────────────
drop policy if exists "students own attempts" on public.attempts;
create policy "students own attempts" on public.attempts
  for all using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists "instructors read class attempts" on public.attempts;
create policy "instructors read class attempts" on public.attempts
  for select using (exists (
    select 1 from public.exercises x
    where x.id = exercise_id and x.created_by = auth.uid()
  ));

-- ════════════════════════════════════════════════════════════════════════════
-- Table privileges
--
-- REQUIRED when the project was created with "Automatically expose new tables"
-- switched off (Project Settings → API → Data API), which is the safer setting and
-- the one this project uses.
--
-- These are a different thing from the RLS policies above and both are needed:
-- a grant decides whether the API role may touch the table at all, RLS decides
-- which rows it then sees. Without the grant every query fails or returns nothing
-- no matter how correct the policies are — and it fails as an empty result rather
-- than an error, which is the hardest kind of problem to spot.
-- ════════════════════════════════════════════════════════════════════════════
grant select, insert, update, delete on public.exercises     to authenticated;
grant select, insert, update, delete on public.attempts      to authenticated;
grant select, insert, update, delete on public.classes       to authenticated;
grant select, insert, update, delete on public.enrollments   to authenticated;
grant select, insert, update, delete on public.groups        to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.assignments   to authenticated;
grant select, insert, update, delete on public.review_flags  to authenticated;
grant select                          on public.profiles   to authenticated;
grant usage, select on sequence public.attempts_id_seq to authenticated;
grant usage, select on sequence public.assignments_id_seq to authenticated;

-- Column-scoped on purpose: this is what keeps `role` unwritable from a browser.
grant update (display_name) on public.profiles to authenticated;

-- Nothing here is readable before signing in.
revoke all on public.exercises, public.attempts, public.classes,
              public.enrollments, public.profiles, public.groups,
              public.group_members, public.assignments, public.review_flags from anon;

-- ─── Join codes generate themselves ──────────────────────────────────────────
-- Six uppercase characters: unique, and readable aloud to a room.
alter table public.classes
  alter column join_code set default upper(substr(md5(random()::text), 1, 6));

-- ─── Let an instructor clear an attempt so a student can retry ───────────────
-- attempts are unique per (exercise, student), so without this a second try is
-- impossible — and "try it again" is the most ordinary classroom action there is.
drop policy if exists "instructors reset class attempts" on public.attempts;
create policy "instructors reset class attempts" on public.attempts
  for delete using (exists (
    select 1 from public.exercises x
    where x.id = exercise_id and x.created_by = auth.uid()
  ));

-- ─── Indexes for the paths the app actually queries ──────────────────────────
-- "my classes" and "my attempts" both filter on the student and had no index.
create index if not exists enrollments_student_idx on public.enrollments (student_id);
create index if not exists attempts_student_idx    on public.attempts (student_id);
create index if not exists exercises_creator_idx   on public.exercises (created_by);

-- ════════════════════════════════════════════════════════════════════════════
-- After running this
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Sign up through the app (or Auth → Users → Add user) with your own email.
-- 2. Promote yourself, using YOUR address:
--
--      update public.profiles set role = 'instructor'
--      where email = 'you@example.com';
--
--    This is deliberately a manual step. Anything the client could call to grant
--    instructor rights is a door a student can walk through.
-- 3. Create a class in the app; share its join code with students.
--
-- 4. Confirm the grants landed. Missing privileges fail as an empty result rather
--    than an error, so this is worth checking rather than assuming:
--
--      select table_name,
--             string_agg(privilege_type, ', ' order by privilege_type) as privs
--      from information_schema.role_table_grants
--      where grantee = 'authenticated' and table_schema = 'public'
--      group by table_name order by table_name;
--
--    Expect attempts / classes / enrollments / exercises with DELETE, INSERT,
--    SELECT, UPDATE, and profiles with SELECT, UPDATE.
--
-- This whole file is re-runnable: every statement uses "if not exists", "or
-- replace", or drops before creating. If you are ever unsure whether something
-- landed, run it again.
-- ════════════════════════════════════════════════════════════════════════════
