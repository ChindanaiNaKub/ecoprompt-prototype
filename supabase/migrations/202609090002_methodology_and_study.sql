alter table public.request_events
  rename column actual_carbon_g to modelled_carbon_central_g;

alter table public.request_events
  add column modelled_carbon_low_g numeric(14, 8) not null default 0 check (modelled_carbon_low_g >= 0),
  add column modelled_carbon_high_g numeric(14, 8) not null default 0 check (modelled_carbon_high_g >= 0),
  add column initial_model_id text,
  add column recommended_model_id text,
  add column model_decision text not null default 'keep' check (model_decision in ('keep', 'switch', 'override'));

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consented_at timestamptz not null default now(),
  pre_score smallint check (pre_score between 0 and 3),
  post_score smallint check (post_score between 0 and 3),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.request_events
  add column study_session_id uuid references public.study_sessions(id) on delete set null;

create index request_events_study_session_idx on public.request_events(study_session_id)
  where study_session_id is not null;

alter table public.study_sessions enable row level security;
create policy "study sessions are private" on public.study_sessions
  for select using (auth.uid() = user_id);
create policy "study sessions are insertable by their owner" on public.study_sessions
  for insert with check (auth.uid() = user_id);
create policy "study sessions are editable by their owner" on public.study_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
