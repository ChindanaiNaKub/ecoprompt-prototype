create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 32),
  leaderboard_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.request_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  comparison_id uuid,
  request_mode text not null check (request_mode in ('single', 'dual')),
  model_id text not null,
  provider_model_id text not null,
  complexity_detected text not null check (complexity_detected in ('simple', 'moderate', 'complex')),
  complexity_selected text not null check (complexity_selected in ('simple', 'moderate', 'complex')),
  was_recommended boolean not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  total_tokens integer not null check (total_tokens >= 0),
  actual_carbon_g numeric(14, 8) not null check (actual_carbon_g >= 0),
  prompt_length integer not null check (prompt_length >= 0),
  prompt_text text,
  prompt_storage_consented boolean not null default false,
  context_cleared boolean not null default false,
  methodology_version text not null
);

create index request_events_user_created_idx on public.request_events(user_id, created_at desc);
create index request_events_comparison_idx on public.request_events(comparison_id) where comparison_id is not null;

create table public.quest_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id text not null,
  progress integer not null default 0 check (progress >= 0),
  target integer not null check (target > 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, quest_id)
);

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  unique(user_id, badge_id)
);

create table public.daily_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  normal_sends integer not null default 0 check (normal_sends >= 0),
  dual_runs integer not null default 0 check (dual_runs >= 0),
  primary key (user_id, usage_date)
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(split_part(new.email, '@', 1), 'Eco user'), 32)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.request_events enable row level security;
alter table public.quest_progress enable row level security;
alter table public.badges enable row level security;
alter table public.daily_usage enable row level security;

create policy "profiles are readable by their owner" on public.profiles for select using (auth.uid() = id);
create policy "profiles are insertable by their owner" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles are editable by their owner" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "request events are private" on public.request_events for select using (auth.uid() = user_id);
create policy "quest progress is private" on public.quest_progress for select using (auth.uid() = user_id);
create policy "badges are private" on public.badges for select using (auth.uid() = user_id);
create policy "usage is private" on public.daily_usage for select using (auth.uid() = user_id);

create or replace function public.consume_daily_allowance(p_user_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_consume boolean := false;
begin
  insert into daily_usage (user_id, usage_date, normal_sends, dual_runs)
  values (p_user_id, current_date, case when p_kind = 'single' then 1 else 0 end, case when p_kind = 'dual' then 1 else 0 end)
  on conflict (user_id, usage_date) do update
  set normal_sends = daily_usage.normal_sends + case when p_kind = 'single' then 1 else 0 end,
      dual_runs = daily_usage.dual_runs + case when p_kind = 'dual' then 1 else 0 end
  where (p_kind = 'single' and daily_usage.normal_sends < 20)
     or (p_kind = 'dual' and daily_usage.dual_runs < 3)
  returning true into did_consume;
  return coalesce(did_consume, false);
end;
$$;

create or replace function public.delete_saved_prompt(p_event_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update request_events
  set prompt_text = null, prompt_storage_consented = false
  where id = p_event_id and user_id = auth.uid();
$$;

create or replace function public.get_efficiency_leaderboard()
returns table(display_name text, completed_requests bigint, right_size_rate numeric)
language sql
security definer
set search_path = public
as $$
  select p.display_name,
         count(e.id) as completed_requests,
         round(100.0 * avg(case when e.was_recommended then 1 else 0 end), 1) as right_size_rate
  from profiles p
  join request_events e on e.user_id = p.id
  where p.leaderboard_opt_in
  group by p.id, p.display_name
  having count(e.id) >= 10
  order by right_size_rate desc, completed_requests desc
  limit 10;
$$;

revoke all on function public.consume_daily_allowance(uuid, text) from public;
grant execute on function public.delete_saved_prompt(uuid) to authenticated;
grant execute on function public.get_efficiency_leaderboard() to authenticated;
