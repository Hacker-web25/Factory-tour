-- supabase/storage_inventory.sql  (26 Nov 2026)
--
-- WHY: the move of every picture and sound from Supabase Storage to Cloudflare R2
-- (/admin/storage) needs a flat, exact list of what is in a bucket: name, size and
-- the file's MD5 fingerprint. The Storage API can only list one folder at a time,
-- and the storage tables are not reachable over the public API. This function is the
-- list. It is for our server only (the service role): browsers and visitors cannot call it.
--
-- Safe to run more than once. Read-only.

drop function if exists public.vpv_storage_inventory(text, text, integer);
create function public.vpv_storage_inventory(
  p_bucket text,
  p_after  text    default '',
  p_limit  integer default 500
)
returns table (
  name          text,
  size          bigint,
  etag          text,
  mimetype      text,
  cache_control text,
  created_at    timestamptz,
  updated_at    timestamptz
)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name,
         coalesce((o.metadata ->> 'size')::bigint, 0),
         btrim(coalesce(o.metadata ->> 'eTag', ''), '"'),
         o.metadata ->> 'mimetype',
         o.metadata ->> 'cacheControl',
         o.created_at,
         coalesce(o.updated_at, o.created_at)
    from storage.objects o
   where o.bucket_id = p_bucket
     and o.name > coalesce(p_after, '')
   order by o.name
   limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke all on function public.vpv_storage_inventory(text, text, integer) from public, anon, authenticated;
grant execute on function public.vpv_storage_inventory(text, text, integer) to service_role;

notify pgrst, 'reload schema';
