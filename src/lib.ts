import {createClient} from '@supabase/supabase-js';
import type {Session} from './domain';
export const configured=!!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
export const db=createClient(import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co', import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing');
export type Snapshot={state:Session;version:number;isHost?:boolean;playerId?:string};
export async function rpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{const {data,error}=await db.rpc(name,args);if(error)throw new Error(error.message);return data as T;}
