-- Run once in the Supabase SQL editor. All writes lock the session row.
create table if not exists public.rally_sessions (
 id uuid primary key, host_id uuid not null references auth.users(id), state jsonb not null,
 version bigint not null default 0, created_at timestamptz not null default now()
);
alter table public.rally_sessions enable row level security;
revoke all on public.rally_sessions from anon, authenticated;
create or replace function public.rally_create(p_state jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s rally_sessions; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_state->>'id' is null then raise exception 'Missing session ID'; end if;
 insert into rally_sessions(id,host_id,state) values ((p_state->>'id')::uuid,auth.uid(),p_state) returning * into s;
 return jsonb_build_object('state',s.state,'version',s.version); end $$;
create or replace function public.rally_get(p_id uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select case when coalesce((state->>'live')::boolean,false) then jsonb_build_object('state',state,'version',version,'isHost',host_id=auth.uid()) else jsonb_build_object('ended',true) end from rally_sessions where id=p_id $$;
create or replace function public.rally_my_sessions() returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('state',state,'version',version) order by created_at desc),'[]'::jsonb) from rally_sessions where host_id=auth.uid() and coalesce((state->>'live')::boolean,false) $$;
create or replace function public.rally_update(p_id uuid,p_version bigint,p_state jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s rally_sessions; begin
 select * into s from rally_sessions where id=p_id for update;
 if not found or s.host_id is distinct from auth.uid() then raise exception 'Host access required'; end if;
 if not coalesce((s.state->>'live')::boolean,false) then raise exception 'Session has ended'; end if;
 if s.version<>p_version then raise exception 'Session changed. Refresh and try again.'; end if;
 if p_state->>'id'<>p_id::text then raise exception 'Invalid session'; end if;
 update rally_sessions set state=p_state,version=version+1 where id=p_id returning * into s;
 return jsonb_build_object('state',s.state,'version',s.version); end $$;
create or replace function public.rally_join(p_id uuid,p_name text,p_rating numeric,p_beginner boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s rally_sessions; player jsonb; next_clock bigint; pid uuid:=gen_random_uuid(); begin
 if length(trim(p_name))<1 or length(trim(p_name))>40 then raise exception 'Name must be 1–40 characters'; end if;
 if p_rating is not null and (p_rating<1 or p_rating>8) then raise exception 'Rating must be between 1 and 8'; end if;
 select * into s from rally_sessions where id=p_id for update;
 if not found or not coalesce((s.state->>'live')::boolean,false) then raise exception 'Session is not live'; end if;
 if exists (select 1 from jsonb_array_elements(coalesce(s.state->'players','[]'::jsonb)) as p
   where p->>'status' is distinct from 'left'
     and lower(regexp_replace(trim(p->>'name'), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(trim(p_name), '[[:space:]]+', ' ', 'g'))) then
   raise exception 'This name is already taken. Please use another name.';
 end if;
 next_clock:=coalesce((s.state->>'clock')::bigint,0)+1;
 player:=jsonb_build_object('id',pid,'name',trim(p_name),'rating',p_rating,'beginner',coalesce(p_beginner,false),'status','waiting','joined',next_clock,'queued',next_clock,'games',0,'protected',false,'roster',null,'pair',null,'past','[]'::jsonb,'partners','[]'::jsonb);
 s.state:=jsonb_set(jsonb_set(s.state,'{clock}',to_jsonb(next_clock)),'{players}',coalesce(s.state->'players','[]'::jsonb)||jsonb_build_array(player));
 update rally_sessions set state=s.state,version=version+1 where id=p_id returning * into s;
 return jsonb_build_object('state',s.state,'version',s.version,'playerId',pid); end $$;
revoke all on function public.rally_create(jsonb), public.rally_get(uuid), public.rally_my_sessions(), public.rally_update(uuid,bigint,jsonb), public.rally_join(uuid,text,numeric,boolean) from public;
grant execute on function public.rally_get(uuid), public.rally_join(uuid,text,numeric,boolean) to anon,authenticated;
grant execute on function public.rally_create(jsonb), public.rally_my_sessions(), public.rally_update(uuid,bigint,jsonb) to authenticated;
