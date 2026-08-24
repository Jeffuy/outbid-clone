create extension if not exists pgcrypto;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  normalized_url text unique not null,
  host text not null,
  title text,
  description text,
  favicon_url text,
  bid_total_cents bigint not null check (bid_total_cents between 100 and 99999900 and bid_total_cents % 100 = 0),
  click_count bigint not null default 0 check (click_count >= 0),
  status text not null default 'active' check (status in ('active', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_bid_at timestamptz not null default now(),
  bid_reached_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id),
  submitted_url text not null,
  normalized_url text not null,
  base_total_cents bigint not null default 0 check (base_total_cents >= 0 and base_total_cents % 100 = 0),
  target_total_cents bigint not null check (target_total_cents between 100 and 99999900 and target_total_cents % 100 = 0),
  charge_amount_cents bigint not null check (charge_amount_cents > 0 and charge_amount_cents % 100 = 0),
  paypal_order_id text unique,
  paypal_capture_id text unique,
  status text not null constraint payments_status_check check (status in ('pending', 'completed', 'failed', 'stale', 'expired')),
  capture_locked_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint payments_charge_matches_base check (charge_amount_cents = target_total_cents - base_total_cents)
);

-- Safe when rerunning this file against the earlier MVP schema.
alter table public.payments add column if not exists base_total_cents bigint not null default 0;
alter table public.payments add column if not exists capture_locked_at timestamptz;
update public.payments
set base_total_cents = target_total_cents - charge_amount_cents
where base_total_cents = 0 and target_total_cents - charge_amount_cents > 0;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check (status in ('pending', 'completed', 'failed', 'stale', 'expired'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_base_total_check' and conrelid = 'public.payments'::regclass) then
    alter table public.payments add constraint payments_base_total_check check (base_total_cents >= 0 and base_total_cents % 100 = 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_charge_matches_base' and conrelid = 'public.payments'::regclass) then
    alter table public.payments add constraint payments_charge_matches_base check (charge_amount_cents = target_total_cents - base_total_cents);
  end if;
end $$;

create table if not exists public.visitors (
  visitor_id uuid primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  page_views bigint not null default 1 check (page_views >= 0)
);

create table if not exists public.rate_limits (
  key_hash text not null check (length(key_hash) = 64),
  bucket bigint not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  primary key (key_hash, bucket)
);

create table if not exists public.click_dedup (
  listing_id uuid not null references public.listings(id) on delete cascade,
  identity_hash text not null check (length(identity_hash) = 64),
  bucket bigint not null,
  expires_at timestamptz not null,
  primary key (listing_id, identity_hash, bucket)
);

create index if not exists listings_ranking_idx on public.listings (bid_total_cents desc, bid_reached_at asc) where status = 'active';
create index if not exists payments_recent_completed_idx on public.payments (completed_at desc) where status = 'completed';
create index if not exists payments_normalized_url_idx on public.payments (normalized_url, created_at desc);
create index if not exists payments_capture_lease_idx on public.payments (normalized_url, capture_locked_at) where status = 'pending';
create index if not exists visitors_last_seen_idx on public.visitors (last_seen desc);
create index if not exists rate_limits_expiry_idx on public.rate_limits (expires_at);
create index if not exists click_dedup_expiry_idx on public.click_dedup (expires_at);

update public.listings set favicon_url = null where favicon_url is not null;

alter table public.listings enable row level security;
alter table public.payments enable row level security;
alter table public.visitors enable row level security;
alter table public.rate_limits enable row level security;
alter table public.click_dedup enable row level security;

revoke all on public.listings, public.payments, public.visitors, public.rate_limits, public.click_dedup from public, anon, authenticated;
grant select, insert, update, delete on public.listings, public.payments, public.visitors, public.rate_limits, public.click_dedup to service_role;

create or replace function public.check_rate_limit(limit_key text, max_requests integer, window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket_value bigint;
  current_count integer;
begin
  if length(limit_key) <> 64 or max_requests < 1 or window_seconds < 1 then
    raise exception 'invalid_rate_limit';
  end if;
  bucket_value := floor(extract(epoch from clock_timestamp()) / window_seconds)::bigint;
  insert into public.rate_limits (key_hash, bucket, request_count, expires_at)
  values (limit_key, bucket_value, 1, now() + make_interval(secs => window_seconds * 2))
  on conflict (key_hash, bucket) do update
  set request_count = public.rate_limits.request_count + 1,
      expires_at = excluded.expires_at
  returning request_count into current_count;

  if random() < 0.01 then
    delete from public.rate_limits where expires_at < now();
  end if;
  return current_count <= max_requests;
end;
$$;

create or replace function public.track_listing_click(listing_uuid uuid, identity_hash text)
returns table(destination_url text, counted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  destination text;
  bucket_value bigint;
  inserted_count integer;
begin
  if length(identity_hash) <> 64 then raise exception 'invalid_identity_hash'; end if;
  select l.url into destination from public.listings l where l.id = listing_uuid and l.status = 'active';
  if not found then return; end if;

  bucket_value := floor(extract(epoch from clock_timestamp()) / 600)::bigint;
  insert into public.click_dedup (listing_id, identity_hash, bucket, expires_at)
  values (listing_uuid, identity_hash, bucket_value, now() + interval '20 minutes')
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    update public.listings set click_count = click_count + 1, updated_at = now() where id = listing_uuid;
  end if;
  if random() < 0.01 then
    delete from public.click_dedup where expires_at < now();
  end if;
  return query select destination, inserted_count = 1;
end;
$$;

create or replace function public.record_visit(visitor_uuid uuid, count_page_view boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.visitors (visitor_id, page_views)
  values (visitor_uuid, case when count_page_view then 1 else 0 end)
  on conflict (visitor_id) do update
  set last_seen = now(),
      page_views = public.visitors.page_views + case when count_page_view then 1 else 0 end;
end;
$$;

create or replace function public.acquire_capture_lease(payment_uuid uuid, expected_order_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
  listing_row public.listings%rowtype;
begin
  select * into payment_row from public.payments where id = payment_uuid for update;
  if not found then raise exception 'payment_not_found'; end if;
  if payment_row.paypal_order_id is distinct from expected_order_id then raise exception 'order_mismatch'; end if;
  if payment_row.status = 'completed' then return 'completed'; end if;
  if payment_row.status <> 'pending' then return payment_row.status; end if;
  if payment_row.created_at < now() - interval '30 minutes' then
    update public.payments set status = 'expired', capture_locked_at = null where id = payment_uuid;
    return 'expired';
  end if;
  if payment_row.capture_locked_at >= now() - interval '2 minutes' then return 'busy'; end if;

  perform pg_advisory_xact_lock(hashtextextended(payment_row.normalized_url, 0));
  if exists (
    select 1 from public.payments p
    where p.normalized_url = payment_row.normalized_url
      and p.id <> payment_uuid
      and p.status = 'pending'
      and p.capture_locked_at >= now() - interval '2 minutes'
  ) then return 'busy'; end if;

  select * into listing_row from public.listings
  where normalized_url = payment_row.normalized_url
  for update;

  if found then
    if listing_row.status <> 'active' or listing_row.bid_total_cents <> payment_row.base_total_cents then
      update public.payments set status = 'stale', capture_locked_at = null where id = payment_uuid;
      return 'stale';
    end if;
  elsif payment_row.base_total_cents <> 0 then
    update public.payments set status = 'stale', capture_locked_at = null where id = payment_uuid;
    return 'stale';
  end if;

  if payment_row.charge_amount_cents <> payment_row.target_total_cents - payment_row.base_total_cents then
    update public.payments set status = 'stale', capture_locked_at = null where id = payment_uuid;
    return 'stale';
  end if;
  update public.payments set capture_locked_at = now() where id = payment_uuid;
  return 'acquired';
end;
$$;

create or replace function public.release_capture_lease(payment_uuid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.payments set capture_locked_at = null where id = payment_uuid and status = 'pending';
$$;

create or replace function public.get_public_stats()
returns table(
  online_now bigint,
  visitors_since_launch bigint,
  visitors_today bigint,
  page_views bigint,
  outbound_clicks bigint,
  total_raised_cents bigint,
  completed_bids bigint,
  active_listings bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.visitors where last_seen >= now() - interval '5 minutes'),
    (select count(*) from public.visitors),
    (select count(*) from public.visitors where last_seen >= date_trunc('day', now())),
    (select coalesce(sum(v.page_views), 0) from public.visitors v),
    (select coalesce(sum(l.click_count), 0) from public.listings l),
    (select coalesce(sum(p.charge_amount_cents), 0) from public.payments p where p.status = 'completed'),
    (select count(*) from public.payments p where p.status = 'completed'),
    (select count(*) from public.listings l where l.status = 'active');
$$;

create or replace function public.get_listing_with_rank(listing_uuid uuid)
returns table(
  id uuid,
  url text,
  normalized_url text,
  host text,
  title text,
  description text,
  favicon_url text,
  bid_total_cents bigint,
  click_count bigint,
  created_at timestamptz,
  last_bid_at timestamptz,
  bid_reached_at timestamptz,
  overall_rank bigint,
  active_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select l.*,
      row_number() over (order by l.bid_total_cents desc, l.bid_reached_at asc) as rank,
      count(*) over () as board_count
    from public.listings l
    where l.status = 'active'
  )
  select r.id, r.url, r.normalized_url, r.host, r.title, r.description, r.favicon_url,
    r.bid_total_cents, r.click_count, r.created_at, r.last_bid_at, r.bid_reached_at,
    r.rank, r.board_count
  from ranked r
  where r.id = listing_uuid;
$$;

create or replace function public.get_recent_activity()
returns table(
  id uuid,
  completed_at timestamptz,
  target_total_cents bigint,
  listing_id uuid,
  host text,
  overall_rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select l.id, l.host,
      row_number() over (order by l.bid_total_cents desc, l.bid_reached_at asc) as rank
    from public.listings l
    where l.status = 'active'
  )
  select p.id, p.completed_at, p.target_total_cents, r.id, r.host, r.rank
  from public.payments p
  join ranked r on r.id = p.listing_id
  where p.status = 'completed'
  order by p.completed_at desc
  limit 5;
$$;

create or replace function public.complete_payment(
  payment_uuid uuid,
  expected_order_id text,
  capture_id text,
  listing_url text,
  listing_host text,
  listing_title text,
  listing_description text,
  listing_favicon_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.payments%rowtype;
  listing_row public.listings%rowtype;
  result_listing_id uuid;
  completion_time timestamptz := now();
begin
  select * into payment_row from public.payments where id = payment_uuid for update;
  if not found then raise exception 'payment_not_found'; end if;
  if payment_row.paypal_order_id is distinct from expected_order_id then raise exception 'order_mismatch'; end if;
  if payment_row.status = 'completed' then return payment_row.listing_id; end if;
  if payment_row.status <> 'pending' then raise exception 'payment_not_pending'; end if;
  if payment_row.charge_amount_cents <> payment_row.target_total_cents - payment_row.base_total_cents then
    raise exception 'payment_amount_mismatch';
  end if;
  if capture_id is null or exists (select 1 from public.payments where paypal_capture_id = capture_id and id <> payment_uuid) then
    raise exception 'capture_already_used';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(payment_row.normalized_url, 0));
  select * into listing_row from public.listings
  where normalized_url = payment_row.normalized_url
  for update;

  if not found then
    if payment_row.base_total_cents <> 0 then raise exception 'stale_payment'; end if;
    insert into public.listings (
      url, normalized_url, host, title, description, favicon_url,
      bid_total_cents, last_bid_at, bid_reached_at
    ) values (
      listing_url, payment_row.normalized_url, listing_host, listing_title,
      listing_description, listing_favicon_url, payment_row.target_total_cents,
      completion_time, completion_time
    ) returning id into result_listing_id;
  else
    if listing_row.status <> 'active' then raise exception 'listing_blocked'; end if;
    if listing_row.bid_total_cents <> payment_row.base_total_cents then raise exception 'stale_payment'; end if;
    result_listing_id := listing_row.id;
    update public.listings
    set bid_total_cents = payment_row.target_total_cents,
        bid_reached_at = completion_time,
        last_bid_at = completion_time,
        title = coalesce(nullif(title, ''), listing_title),
        description = coalesce(description, listing_description),
        favicon_url = null,
        updated_at = completion_time
    where id = result_listing_id;
  end if;

  update public.payments
  set listing_id = result_listing_id,
      paypal_capture_id = capture_id,
      status = 'completed',
      capture_locked_at = null,
      completed_at = completion_time
  where id = payment_uuid;
  return result_listing_id;
end;
$$;

drop function if exists public.increment_listing_click(uuid);

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.track_listing_click(uuid, text) from public, anon, authenticated;
revoke all on function public.record_visit(uuid, boolean) from public, anon, authenticated;
revoke all on function public.acquire_capture_lease(uuid, text) from public, anon, authenticated;
revoke all on function public.release_capture_lease(uuid) from public, anon, authenticated;
revoke all on function public.get_public_stats() from public, anon, authenticated;
revoke all on function public.get_listing_with_rank(uuid) from public, anon, authenticated;
revoke all on function public.get_recent_activity() from public, anon, authenticated;
revoke all on function public.complete_payment(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.track_listing_click(uuid, text) to service_role;
grant execute on function public.record_visit(uuid, boolean) to service_role;
grant execute on function public.acquire_capture_lease(uuid, text) to service_role;
grant execute on function public.release_capture_lease(uuid) to service_role;
grant execute on function public.get_public_stats() to service_role;
grant execute on function public.get_listing_with_rank(uuid) to service_role;
grant execute on function public.get_recent_activity() to service_role;
grant execute on function public.complete_payment(uuid, text, text, text, text, text, text, text) to service_role;
