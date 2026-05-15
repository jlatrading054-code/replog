-- RepLog Database Schema
-- Run this in Supabase SQL Editor

-- ── PROFILES ──────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text,
  full_name text,
  age int,
  weight_lbs numeric,
  height_inches numeric,
  fitness_level text, -- beginner / intermediate / advanced
  goals text,
  equipment text[],
  injuries text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- ── PROGRAMS ──────────────────────────────────────────────────────
create table if not exists programs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  name text not null,
  description text,
  duration_weeks int default 12,
  days_per_week int default 5,
  is_active boolean default false,
  is_public boolean default false,
  created_by_ai boolean default false,
  ai_context text, -- what the user told Coach Rep
  created_at timestamptz default now()
);

alter table programs enable row level security;
create policy "Users can manage own programs" on programs for all using (auth.uid() = user_id);
create policy "Anyone can view public programs" on programs for select using (is_public = true);

-- ── WORKOUT DAYS ──────────────────────────────────────────────────
create table if not exists workout_days (
  id uuid default gen_random_uuid() primary key,
  program_id uuid references programs(id) on delete cascade,
  day_of_week int not null, -- 0=Sun 1=Mon ... 6=Sat
  name text not null,
  type text not null, -- strength / kb / z2 / rest
  notes text,
  order_index int default 0
);

alter table workout_days enable row level security;
create policy "Users can manage own workout days" on workout_days for all
  using (exists (select 1 from programs where programs.id = workout_days.program_id and programs.user_id = auth.uid()));

-- ── EXERCISES ─────────────────────────────────────────────────────
create table if not exists exercises (
  id uuid default gen_random_uuid() primary key,
  workout_day_id uuid references workout_days(id) on delete cascade,
  name text not null,
  notes text,
  unit text default 'reps', -- reps / secs / mins / bw
  is_core boolean default false,
  is_timed boolean default false,
  order_index int default 0,
  default_sets int default 3,
  default_reps int,
  default_weight numeric
);

alter table exercises enable row level security;
create policy "Users can manage own exercises" on exercises for all
  using (exists (
    select 1 from workout_days wd
    join programs p on p.id = wd.program_id
    where wd.id = exercises.workout_day_id and p.user_id = auth.uid()
  ));

-- ── SESSION LOGS ──────────────────────────────────────────────────
create table if not exists session_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  program_id uuid references programs(id),
  workout_day_id uuid references workout_days(id),
  logged_date date not null default current_date,
  status text default 'in_progress', -- in_progress / complete
  notes text,
  duration_mins int,
  completed_at timestamptz,
  created_at timestamptz default now()
);

alter table session_logs enable row level security;
create policy "Users can manage own session logs" on session_logs for all using (auth.uid() = user_id);

-- ── SET LOGS ──────────────────────────────────────────────────────
create table if not exists set_logs (
  id uuid default gen_random_uuid() primary key,
  session_log_id uuid references session_logs(id) on delete cascade,
  exercise_id uuid references exercises(id),
  exercise_name text not null, -- denormalized for easy history
  set_number int not null,
  reps numeric,
  weight_lbs numeric,
  duration_secs int,
  completed boolean default false,
  created_at timestamptz default now()
);

alter table set_logs enable row level security;
create policy "Users can manage own set logs" on set_logs for all
  using (exists (select 1 from session_logs where session_logs.id = set_logs.session_log_id and session_logs.user_id = auth.uid()));

-- ── COACH REP CONVERSATIONS ────────────────────────────────────────
create table if not exists coach_conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  role text not null, -- user / assistant
  content text not null,
  created_at timestamptz default now()
);

alter table coach_conversations enable row level security;
create policy "Users can manage own conversations" on coach_conversations for all using (auth.uid() = user_id);

-- ── PERSONAL RECORDS VIEW ─────────────────────────────────────────
create or replace view personal_records as
  select
    sl.user_id,
    slog.exercise_name,
    max(slog.weight_lbs) as best_weight,
    max(slog.reps) filter (where slog.weight_lbs = max(slog.weight_lbs) over (partition by sl.user_id, slog.exercise_name)) as reps_at_best,
    max(sl.logged_date) as last_logged
  from set_logs slog
  join session_logs sl on sl.id = slog.session_log_id
  where slog.completed = true and slog.weight_lbs > 0
  group by sl.user_id, slog.exercise_name;

-- ── TRIGGER: auto-update profiles.updated_at ──────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();

-- ── TRIGGER: auto-create profile on signup ────────────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
