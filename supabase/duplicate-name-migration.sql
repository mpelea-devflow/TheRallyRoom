-- Apply to an existing Rallyroom database in the Supabase SQL editor.
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
