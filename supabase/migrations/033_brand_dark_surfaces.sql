-- Kits that can go dark.
--
-- A kit could set the page background but not the text on it. One colour,
-- `primary`, was both the sidebar's background and the heading colour in every
-- card, so a client wanting light headings on a black page could only get them
-- by turning their sidebar white too. Setting a dark surface produced black
-- text on black.
--
-- Two roles split that apart: `card` is the panel background, `heading` is the
-- heading colour, and `primary` goes back to meaning the chrome alone. Seven
-- roles is more than five, but each one now does a single job, and the ones a
-- dark kit needs are the two that were missing.
--
-- Everything else here is 032 unchanged: brand_sanitize keeps only the keys it
-- knows, so the new colours had to be named here or they would have been
-- dropped on the way in.
create or replace function public.brand_sanitize(b jsonb)
returns jsonb language plpgsql immutable
set search_path = public, pg_temp as $$
declare
  out_b  jsonb := '{}'::jsonb;
  k      text;
  v      text;
  item   jsonb;
  list   jsonb;
  src    text;
  n      int;
begin
  if b is null or jsonb_typeof(b) <> 'object' then
    return '{}'::jsonb;
  end if;

  foreach k in array array['primary','accent','link','surface','text','card','heading'] loop
    v := nullif(b ->> k, '');
    if v is not null then
      if v !~ '^#[0-9a-fA-F]{6}$' then
        raise exception 'brand colour "%" must be a six-digit hex value, got "%"', k, v
          using errcode = '22023';
      end if;
      out_b := out_b || jsonb_build_object(k, lower(v));
    end if;
  end loop;

  foreach k in array array['wordmark','displayFont','bodyFont'] loop
    v := b ->> k;
    if v is not null then
      out_b := out_b || jsonb_build_object(k, left(v, 80));
    end if;
  end loop;

  v := b ->> 'voice';
  if v is not null then
    out_b := out_b || jsonb_build_object('voice', left(v, 2000));
  end if;

  foreach k in array array['logoDark','logoLight'] loop
    v := nullif(b ->> k, '');
    if v is not null then
      if not public.brand_url_ok(v) then
        raise exception 'a brand logo must be a file we host, got "%"', v
          using errcode = '22023';
      end if;
      out_b := out_b || jsonb_build_object(k, v);
    end if;
  end loop;

  foreach k in array array['logos','photos'] loop
    list := b -> k;
    if jsonb_typeof(list) = 'array' then
      n := case when k = 'logos' then 24 else 48 end;
      if jsonb_array_length(list) > n then
        raise exception 'a brand kit holds at most % %', n, k
          using errcode = '22023';
      end if;
      out_b := out_b || jsonb_build_object(k, coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'id',    left(coalesce(e ->> 'id', ''), 40),
                 'name',  left(coalesce(e ->> 'name', ''), 120),
                 'ext',   left(coalesce(e ->> 'ext', ''), 8),
                 'src',   e ->> 'src',
                 'plate', case when e ->> 'plate' = 'dark' then 'dark' else 'light' end)))
        from jsonb_array_elements(list) e
        where e ->> 'src' is not null
          and public.brand_url_ok(e ->> 'src')
      ), '[]'::jsonb));
    end if;
  end loop;

  list := b -> 'palette';
  if jsonb_typeof(list) = 'array' then
    if jsonb_array_length(list) > 24 then
      raise exception 'a brand kit holds at most 24 palette colours'
        using errcode = '22023';
    end if;
    for item in select e from jsonb_array_elements(list) e loop
      src := item ->> 'hex';
      if src is null or src !~ '^#[0-9a-fA-F]{6}$' then
        raise exception 'palette colour "%" must be a six-digit hex value', coalesce(src, 'null')
          using errcode = '22023';
      end if;
    end loop;
    out_b := out_b || jsonb_build_object('palette', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',   left(coalesce(e ->> 'id', ''), 40),
               'name', left(coalesce(e ->> 'name', ''), 60),
               'hex',  lower(e ->> 'hex')))
      from jsonb_array_elements(list) e
    ), '[]'::jsonb));
  end if;

  return out_b;
end $$;

revoke execute on function public.brand_sanitize(jsonb) from public, anon, authenticated;
