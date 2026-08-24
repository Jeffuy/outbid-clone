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
  target_total_cents bigint not null check (target_total_cents between 100 and 99999900 and target_total_cents % 100 = 0),
  charge_amount_cents bigint not null check (charge_amount_cents > 0 and charge_amount_cents % 100 = 0),
  paypal_order_id text unique,
  paypal_capture_id text unique,
  status text not null check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.visitors (
  visitor_id uuid primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  page_views bigint not null default 1 check (page_views >= 0)
);

create index if not exists listings_ranking_idx on public.listings (bid_total_cents desc, bid_reached_at asc) where status = 'active';
create index if not exists payments_recent_completed_idx on public.payments (completed_at desc) where status = 'completed';
create index if not exists payments_normalized_url_idx on public.payments (normalized_url, created_at desc);
create index if not exists visitors_last_seen_idx on public.visitors (last_seen desc);

alter table public.listings enable row level security;
alter table public.payments enable row level security;
alter table public.visitors enable row level security;

revoke all on public.listings, public.payments, public.visitors from anon, authenticated;

create or replace function public.increment_listing_click(listing_uuid uuid)
returns table(destination_url text)
language sql
security definer
set search_path = public
as $$
  update public.listings
  set click_count = click_count + 1,
      updated_at = now()
  where id = listing_uuid and status = 'active'
  returning url;
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
  if capture_id is null or exists (select 1 from public.payments where paypal_capture_id = capture_id and id <> payment_uuid) then
    raise exception 'capture_already_used';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(payment_row.normalized_url, 0));

  select * into listing_row
  from public.listings
  where normalized_url = payment_row.normalized_url
  for update;

  if not found then
    insert into public.listings (
      url, normalized_url, host, title, description, favicon_url,
      bid_total_cents, last_bid_at, bid_reached_at
    ) values (
      listing_url, payment_row.normalized_url, listing_host, listing_title,
      listing_description, listing_favicon_url, payment_row.target_total_cents,
      completion_time, completion_time
    ) returning id into result_listing_id;
  else
    if listing_row.status = 'blocked' then raise exception 'listing_blocked'; end if;
    result_listing_id := listing_row.id;
    update public.listings
    set bid_total_cents = greatest(bid_total_cents, payment_row.target_total_cents),
        bid_reached_at = case when payment_row.target_total_cents > bid_total_cents then completion_time else bid_reached_at end,
        last_bid_at = case when payment_row.target_total_cents > bid_total_cents then completion_time else last_bid_at end,
        title = coalesce(nullif(title, ''), listing_title),
        description = coalesce(description, listing_description),
        favicon_url = coalesce(favicon_url, listing_favicon_url),
        updated_at = completion_time
    where id = result_listing_id;
  end if;

  update public.payments
  set listing_id = result_listing_id,
      paypal_capture_id = capture_id,
      status = 'completed',
      completed_at = completion_time
  where id = payment_uuid;

  return result_listing_id;
end;
$$;

revoke all on function public.increment_listing_click(uuid) from public, anon, authenticated;
revoke all on function public.record_visit(uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_public_stats() from public, anon, authenticated;
revoke all on function public.get_listing_with_rank(uuid) from public, anon, authenticated;
revoke all on function public.get_recent_activity() from public, anon, authenticated;
revoke all on function public.complete_payment(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.increment_listing_click(uuid) to service_role;
grant execute on function public.record_visit(uuid, boolean) to service_role;
grant execute on function public.get_public_stats() to service_role;
grant execute on function public.get_listing_with_rank(uuid) to service_role;
grant execute on function public.get_recent_activity() to service_role;
grant execute on function public.complete_payment(uuid, text, text, text, text, text, text, text) to service_role;
