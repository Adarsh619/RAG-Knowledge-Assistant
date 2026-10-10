-- Phase 12 only. No document, chunk, Storage or Auth data is changed.
begin;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) between 1 and 120),
  -- Snapshot of the last selected scope; deliberately no document FK.
  document_id uuid,
  next_turn_index integer not null default 0 check (next_turn_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  request_id uuid not null,
  turn_index integer not null check (turn_index >= 0),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  status text not null check (status in ('pending', 'completed', 'failed')),
  attempt_id uuid,
  document_id uuid,
  mode text check (mode in ('mock', 'local')),
  sources jsonb not null default '[]'::jsonb check (
    jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 5
    and octet_length(sources::text) <= 16000),
  rag jsonb check (rag is null or (jsonb_typeof(rag) = 'object' and octet_length(rag::text) <= 1000)),
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (conversation_id, request_id, role),
  unique (conversation_id, turn_index, role),
  constraint message_role_shape check (
    (role = 'user' and attempt_id is not null and mode is null and rag is null
      and sources = '[]'::jsonb and char_length(content) <= 4000)
    or (role = 'assistant' and status = 'completed' and attempt_id is null and mode is not null)
  )
);

create index conversations_owner_recent on public.conversations (owner_id, updated_at desc, id desc);
-- The message unique keys index the conversation FK and ordered history.
create unique index messages_one_pending_turn on public.messages (conversation_id)
  where role = 'user' and status = 'pending';

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy conversations_read_own on public.conversations for select to authenticated
  using (owner_id = (select auth.uid()));
create policy conversations_insert_own on public.conversations for insert to authenticated
  with check (owner_id = (select auth.uid()) and (document_id is null or exists (
    select 1 from public.documents d where d.id = conversations.document_id
      and d.owner_id = (select auth.uid()) and d.ingestion_status = 'ready')));
create policy conversations_update_own on public.conversations for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy conversations_delete_own on public.conversations for delete to authenticated
  using (owner_id = (select auth.uid()));
create policy messages_read_own on public.messages for select to authenticated
  using (conversation_id in (select id from public.conversations where owner_id = (select auth.uid())));
create policy messages_insert_own on public.messages for insert to authenticated
  with check (conversation_id in (select id from public.conversations where owner_id = (select auth.uid())));
create policy messages_update_own on public.messages for update to authenticated
  using (conversation_id in (select id from public.conversations where owner_id = (select auth.uid())))
  with check (conversation_id in (select id from public.conversations where owner_id = (select auth.uid())));

revoke all on public.conversations, public.messages from public, anon, authenticated;
grant select, insert, delete on public.conversations to authenticated;
grant update (title, document_id, next_turn_index, updated_at) on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant update (status, started_at, attempt_id) on public.messages to authenticated;

create function public.begin_conversation_turn(
  p_conversation_id uuid, p_request_id uuid, p_content text, p_document_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_conversation public.conversations%rowtype;
  v_user public.messages%rowtype;
  v_assistant public.messages%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null or p_content is null or char_length(btrim(p_content)) not between 1 and 4000
  then raise exception 'Invalid question' using errcode = '22023'; end if;
  select * into v_conversation from public.conversations
    where id = p_conversation_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Conversation unavailable' using errcode = 'P0002'; end if;
  select * into v_user from public.messages
    where conversation_id = p_conversation_id and request_id = p_request_id and role = 'user';
  if found then
    if v_user.content <> p_content or v_user.document_id is distinct from p_document_id
    then raise exception 'Request ID already used for another question' using errcode = '22023'; end if;
    if v_user.status = 'completed' then
      select * into strict v_assistant from public.messages
        where conversation_id = p_conversation_id and request_id = p_request_id and role = 'assistant';
      return jsonb_build_object('conversation', to_jsonb(v_conversation),
        'user_message', to_jsonb(v_user), 'assistant_message', to_jsonb(v_assistant));
    end if;
    if v_user.status = 'pending' and v_user.started_at > v_now - interval '5 minutes'
    then raise exception 'Reply already in progress' using errcode = '55000'; end if;
  end if;
  if p_document_id is not null and not exists (
    select 1 from public.documents where id = p_document_id and owner_id = auth.uid() and ingestion_status = 'ready'
  ) then raise exception 'Selected document unavailable' using errcode = '22023'; end if;
  if exists (select 1 from public.messages where conversation_id = p_conversation_id
    and role = 'user' and status = 'pending' and started_at > v_now - interval '5 minutes')
  then raise exception 'Reply already in progress' using errcode = '55000'; end if;

  -- UPDATE 1: only expired pending questions in this owned conversation.
  update public.messages set status = 'failed'
    where conversation_id = p_conversation_id and role = 'user' and status = 'pending'
      and started_at <= v_now - interval '5 minutes';
  if v_user.id is null then
    insert into public.messages (conversation_id, request_id, turn_index, role, content, status, attempt_id, document_id)
      values (p_conversation_id, p_request_id, v_conversation.next_turn_index, 'user', p_content,
        'pending', gen_random_uuid(), p_document_id) returning * into v_user;
    -- UPDATE 2: advance the counter and derive the first-question title for this owner only.
    update public.conversations set next_turn_index = next_turn_index + 1,
      title = case when next_turn_index = 0 then left(regexp_replace(btrim(p_content), '\s+', ' ', 'g'), 72) else title end,
      document_id = p_document_id, updated_at = v_now
      where id = p_conversation_id and owner_id = auth.uid() returning * into v_conversation;
  else
    -- UPDATE 3: retry this same saved question with a new attempt token, without duplicating it.
    update public.messages set status = 'pending', started_at = v_now, attempt_id = gen_random_uuid()
      where id = v_user.id and conversation_id = p_conversation_id and role = 'user' and status = 'failed'
      returning * into v_user;
    -- UPDATE 4: refresh only this owner's conversation scope/time on retry.
    update public.conversations set document_id = p_document_id, updated_at = v_now
      where id = p_conversation_id and owner_id = auth.uid() returning * into v_conversation;
  end if;
  return jsonb_build_object('conversation', to_jsonb(v_conversation), 'user_message', to_jsonb(v_user), 'assistant_message', null);
end;
$function$;

create function public.complete_conversation_turn(
  p_conversation_id uuid, p_request_id uuid, p_attempt_id uuid,
  p_content text, p_mode text, p_sources jsonb, p_rag jsonb default null
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_conversation public.conversations%rowtype;
  v_user public.messages%rowtype;
  v_assistant public.messages%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_conversation from public.conversations
    where id = p_conversation_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Conversation unavailable' using errcode = 'P0002'; end if;
  select * into v_user from public.messages
    where conversation_id = p_conversation_id and request_id = p_request_id and role = 'user' for update;
  if not found then raise exception 'Question unavailable' using errcode = 'P0002'; end if;
  if v_user.status = 'completed' then
    select * into strict v_assistant from public.messages
      where conversation_id = p_conversation_id and request_id = p_request_id and role = 'assistant';
  else
    if v_user.status <> 'pending' or v_user.attempt_id is distinct from p_attempt_id
    then raise exception 'Reply attempt is no longer current' using errcode = '55000'; end if;
    if p_content is null or char_length(btrim(p_content)) not between 1 and 20000
      or p_mode is null or p_mode not in ('mock', 'local') or p_sources is null
    then raise exception 'Invalid assistant reply' using errcode = '22023'; end if;
    insert into public.messages (conversation_id, request_id, turn_index, role, content, status, document_id, mode, sources, rag)
      values (p_conversation_id, p_request_id, v_user.turn_index, 'assistant', p_content, 'completed',
        v_user.document_id, p_mode, p_sources, p_rag) returning * into v_assistant;
    -- UPDATE 5: mark only the matching pending attempt completed, in the same transaction as its answer.
    update public.messages set status = 'completed'
      where id = v_user.id and conversation_id = p_conversation_id and status = 'pending' and attempt_id = p_attempt_id
      returning * into v_user;
    -- UPDATE 6: refresh this owner's conversation timestamp only.
    update public.conversations set updated_at = now()
      where id = p_conversation_id and owner_id = auth.uid() returning * into v_conversation;
  end if;
  return jsonb_build_object('conversation', to_jsonb(v_conversation),
    'user_message', to_jsonb(v_user), 'assistant_message', to_jsonb(v_assistant));
end;
$function$;

revoke all on function public.begin_conversation_turn(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_conversation_turn(uuid, uuid, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.begin_conversation_turn(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.complete_conversation_turn(uuid, uuid, uuid, text, text, jsonb, jsonb) to authenticated;
commit;
