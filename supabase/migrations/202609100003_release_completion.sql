-- Append-only release migration. Existing migrations may already be deployed.

alter table public.request_events
  add column if not exists switched boolean not null default false,
  add column if not exists right_sized boolean not null default false,
  add column if not exists looks_batched boolean not null default false,
  add column if not exists carbon_saved_g numeric(14, 8) not null default 0 check (carbon_saved_g >= 0),
  add column if not exists tokens_saved integer not null default 0 check (tokens_saved >= 0),
  add column if not exists operation_id uuid not null default gen_random_uuid();

create unique index if not exists request_events_operation_model_idx
  on public.request_events(user_id, operation_id, model_id);

alter table public.study_sessions
  add column if not exists task_completed boolean not null default false,
  add column if not exists initial_model_id text,
  add column if not exists final_model_id text,
  add column if not exists recommendation_accepted boolean,
  add column if not exists privacy_clarity_rating smallint check (privacy_clarity_rating between 1 and 5),
  add column if not exists quota_understanding boolean;

alter table public.profiles
  add column if not exists right_size_streak integer not null default 0 check (right_size_streak >= 0);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, case when char_length(split_part(new.email, '@', 1)) between 2 and 32
    then split_part(new.email, '@', 1) else 'Eco user' end)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.delete_saved_prompt(p_event_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.request_events
  set prompt_text = null, prompt_storage_consented = false
  where id = p_event_id and user_id = auth.uid();
$$;

create or replace function public.record_request_outcome(
  p_user_id uuid,
  p_events jsonb,
  p_gamification jsonb default '{}'::jsonb,
  p_study_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  first_event jsonb;
  streak integer;
  inserted_count integer;
  v_quest_id text;
  v_quest_target integer;
  v_should_progress boolean;
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile not found';
  end if;
  if p_study_session_id is not null and not exists (
    select 1 from public.study_sessions
    where id = p_study_session_id and user_id = p_user_id and completed_at is null
  ) then
    raise exception 'Study session does not belong to this user';
  end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    raise exception 'At least one request event is required';
  end if;

  insert into public.request_events (
    user_id, comparison_id, request_mode, model_id, provider_model_id,
    complexity_detected, complexity_selected, was_recommended,
    input_tokens, output_tokens, total_tokens,
    modelled_carbon_low_g, modelled_carbon_central_g, modelled_carbon_high_g,
    prompt_length, prompt_text, prompt_storage_consented, context_cleared,
    methodology_version, initial_model_id, recommended_model_id, model_decision,
    study_session_id, switched, right_sized, looks_batched, carbon_saved_g, tokens_saved, operation_id
  )
  select p_user_id, e.comparison_id, e.request_mode, e.model_id, e.provider_model_id,
    e.complexity_detected, e.complexity_selected, e.was_recommended,
    e.input_tokens, e.output_tokens, e.total_tokens,
    e.modelled_carbon_low_g, e.modelled_carbon_central_g, e.modelled_carbon_high_g,
    e.prompt_length, case when e.prompt_storage_consented then e.prompt_text else null end,
    e.prompt_storage_consented, e.context_cleared, e.methodology_version,
    e.initial_model_id, e.recommended_model_id, e.model_decision,
    p_study_session_id, e.switched, e.right_sized, e.looks_batched,
    greatest(0, e.carbon_saved_g), greatest(0, e.tokens_saved), e.operation_id
  from jsonb_to_recordset(p_events) as e(
    comparison_id uuid, request_mode text, model_id text, provider_model_id text,
    complexity_detected text, complexity_selected text, was_recommended boolean,
    input_tokens integer, output_tokens integer, total_tokens integer,
    modelled_carbon_low_g numeric, modelled_carbon_central_g numeric,
    modelled_carbon_high_g numeric, prompt_length integer, prompt_text text,
    prompt_storage_consented boolean, context_cleared boolean, methodology_version text,
    initial_model_id text, recommended_model_id text, model_decision text,
    switched boolean, right_sized boolean, looks_batched boolean,
    carbon_saved_g numeric, tokens_saved integer, operation_id uuid
  )
  on conflict (user_id, operation_id, model_id) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return jsonb_build_object(
      'quests', (select coalesce(jsonb_agg(to_jsonb(q) order by q.quest_id), '[]'::jsonb)
        from public.quest_progress q where q.user_id = p_user_id),
      'badges', (select coalesce(jsonb_agg(to_jsonb(b) order by b.earned_at), '[]'::jsonb)
        from public.badges b where b.user_id = p_user_id),
      'rightSizeStreak', coalesce((select progress from public.quest_progress
        where user_id = p_user_id and quest_id = 'right-size-streak'), 0)
    );
  end if;

  first_event := p_events -> 0;
  streak := case when coalesce((p_gamification ->> 'right_sized')::boolean, false)
    then least(5, coalesce((select qp.progress from public.quest_progress qp
      where qp.user_id = p_user_id and qp.quest_id = 'right-size-streak'), 0) + 1)
    else 0 end;
  update public.profiles set right_size_streak = streak, updated_at = now() where id = p_user_id;

  -- Keep the streak in quest progress; completed quests remain completed once earned.
  insert into public.quest_progress (user_id, quest_id, progress, target, completed_at)
  values (p_user_id, 'right-size-streak', least(streak, 5), 5,
    case when streak >= 5 then now() end)
  on conflict (user_id, quest_id) do update set
    progress = case when quest_progress.completed_at is null then excluded.progress else quest_progress.progress end,
    completed_at = coalesce(quest_progress.completed_at, excluded.completed_at),
    updated_at = now();

  -- Other quest triggers are each evaluated once per successful request operation.
  for v_quest_id, v_quest_target, v_should_progress in
    select * from (values
      ('prompt-trim', 3, (coalesce((first_event ->> 'prompt_length')::integer, 0) between 1 and 199)),
      ('batch-once', 1, coalesce((p_gamification ->> 'looks_batched')::boolean, false)),
      ('compare-models', 1, jsonb_array_length(p_events) > 1),
      ('context-clear', 1, coalesce((p_gamification ->> 'context_cleared')::boolean, false))
    ) as triggers(id, target, is_triggered)
  loop
    insert into public.quest_progress (user_id, quest_id, progress, target, completed_at)
    values (p_user_id, v_quest_id, case when v_should_progress then 1 else 0 end, v_quest_target,
      case when v_should_progress then now() end)
    on conflict (user_id, quest_id) do update set
      progress = case when quest_progress.completed_at is null and v_should_progress
        then least(quest_progress.progress + 1, quest_progress.target)
        else quest_progress.progress end,
      completed_at = coalesce(quest_progress.completed_at,
        case when v_should_progress and quest_progress.progress + 1 >= quest_progress.target then now() end),
      updated_at = now();
  end loop;

  for v_quest_id, v_quest_target in select * from (values
    ('right-size-streak', 5), ('prompt-trim', 3), ('batch-once', 1),
    ('compare-models', 1), ('context-clear', 1)
  ) as quests(id, target)
  loop
    if exists (select 1 from public.quest_progress qp where qp.user_id = p_user_id and qp.quest_id = v_quest_id and qp.completed_at is not null) then
      insert into public.badges (user_id, badge_id)
      values (p_user_id, v_quest_id)
      on conflict (user_id, badge_id) do nothing;
    end if;
  end loop;

  if p_study_session_id is not null then
    update public.study_sessions
    set task_completed = true,
        initial_model_id = coalesce(initial_model_id, first_event ->> 'initial_model_id'),
        final_model_id = first_event ->> 'model_id',
        recommendation_accepted = case first_event ->> 'model_decision'
          when 'switch' then true when 'keep' then false else null end
    where id = p_study_session_id and user_id = p_user_id and completed_at is null;
  end if;

  return jsonb_build_object(
    'quests', (select coalesce(jsonb_agg(to_jsonb(q) order by q.quest_id), '[]'::jsonb)
      from public.quest_progress q where q.user_id = p_user_id),
    'badges', (select coalesce(jsonb_agg(to_jsonb(b) order by b.earned_at), '[]'::jsonb)
      from public.badges b where b.user_id = p_user_id),
    'rightSizeStreak', streak
  );
end;
$$;

create or replace function public.complete_study_session(
  p_session_id uuid,
  p_post_score smallint,
  p_privacy_clarity smallint,
  p_quota_understanding boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_post_score is null or p_post_score not between 0 and 3
     or p_privacy_clarity is null or p_privacy_clarity not between 1 and 5
     or p_quota_understanding is null then
    raise exception 'Study answers are invalid';
  end if;
  if not exists (
    select 1 from public.study_sessions s
    join public.request_events e on e.study_session_id = s.id
    where s.id = p_session_id and s.user_id = auth.uid() and s.task_completed and s.completed_at is null
  ) then
    raise exception 'Complete the study task before submitting follow-up answers';
  end if;
  update public.study_sessions
  set post_score = p_post_score,
      privacy_clarity_rating = p_privacy_clarity,
      quota_understanding = p_quota_understanding,
      completed_at = now()
  where id = p_session_id and user_id = auth.uid();
end;
$$;

create or replace function public.get_efficiency_leaderboard()
returns table(display_name text, completed_requests bigint, right_size_rate numeric)
language sql
security definer
set search_path = public
as $$
  select p.display_name,
         count(e.id) as completed_requests,
         round(100.0 * avg(case when e.right_sized then 1 else 0 end), 1) as right_size_rate
  from public.profiles p
  join public.request_events e on e.user_id = p.id
  where p.leaderboard_opt_in
  group by p.id, p.display_name
  having count(e.id) >= 10
     and avg(case when e.right_sized then 1 else 0 end) > 0
  order by right_size_rate desc, completed_requests desc
  limit 10;
$$;

revoke all on function public.record_request_outcome(uuid, jsonb, jsonb, uuid) from public;
grant execute on function public.record_request_outcome(uuid, jsonb, jsonb, uuid) to service_role;
grant execute on function public.complete_study_session(uuid, smallint, smallint, boolean) to authenticated;
revoke all on function public.get_efficiency_leaderboard() from public;
grant execute on function public.get_efficiency_leaderboard() to authenticated;
