-- Apply in the Supabase SQL editor to update existing Rallyroom databases.
create or replace function public.rally_get(p_id uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select case when coalesce((state->>'live')::boolean,false) then jsonb_build_object('state',state,'version',version,'isHost',host_id=auth.uid()) else jsonb_build_object('ended',true) end from rally_sessions where id=p_id $$;
create or replace function public.rally_update(p_id uuid,p_version bigint,p_state jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s rally_sessions; begin
 select * into s from rally_sessions where id=p_id for update;
 if not found or s.host_id is distinct from auth.uid() then raise exception 'Host access required'; end if;
 if not coalesce((s.state->>'live')::boolean,false) then raise exception 'Session has ended'; end if;
 if s.version<>p_version then raise exception 'Session changed. Refresh and try again.'; end if;
 if p_state->>'id'<>p_id::text then raise exception 'Invalid session'; end if;
 update rally_sessions set state=p_state,version=version+1 where id=p_id returning * into s;
 return jsonb_build_object('state',s.state,'version',s.version); end $$;
