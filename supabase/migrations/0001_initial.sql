-- ============================================================================
-- OnPay — Initial schema
-- ============================================================================
--
-- Security principles encoded below:
--
-- 1. Row-Level Security is enabled on EVERY table. No implicit access.
-- 2. Merchants are identified by their Solana wallet address; they can only
--    read/mutate their own rows.
-- 3. Payments are append-only from the client perspective — only the server
--    (service role) can insert or update them.
-- 4. All amounts are stored as TEXT (bigint) to preserve precision without
--    relying on numeric types that can silently truncate.
--
-- Run with:  supabase db push   (or paste into the SQL editor)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Merchants
-- ---------------------------------------------------------------------------
create table if not exists public.merchants (
  id                   uuid primary key default gen_random_uuid(),
  wallet_address       text not null unique,
  business_name        text,
  settlement_mint      text not null,
  preferred_language   text not null default 'en' check (preferred_language in ('en', 'id')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_merchants_wallet on public.merchants (wallet_address);

comment on table public.merchants is 'Businesses that accept payments via OnPay. Identified by wallet address.';
comment on column public.merchants.wallet_address is 'Base58-encoded Solana public key, also the settlement destination.';
comment on column public.merchants.settlement_mint is 'SPL mint address of the token the merchant receives (e.g. USDC).';

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  reference    text not null unique,
  amount_raw   text not null,                 -- bigint stored as text for precision
  currency     text not null,                 -- e.g. 'USD', 'IDR', or SPL mint symbol
  decimals     int  not null check (decimals between 0 and 18),
  label        text,
  memo         text,
  status       text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed')),
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_invoices_reference on public.invoices (reference);
create index if not exists idx_invoices_merchant_status on public.invoices (merchant_id, status, created_at desc);
create index if not exists idx_invoices_expires on public.invoices (expires_at) where status = 'pending';

comment on column public.invoices.reference is '32-char unguessable ID embedded in the Solana Pay URL.';
comment on column public.invoices.amount_raw is 'Base-unit amount stored as text to preserve bigint precision.';

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id),
  buyer_wallet  text not null,
  input_mint    text not null,
  input_amount  text not null,                -- bigint stored as text
  output_amount text not null,                -- bigint stored as text
  tx_hash       text not null unique,
  confirmed_at  timestamptz not null default now()
);

create index if not exists idx_payments_invoice on public.payments (invoice_id);
create index if not exists idx_payments_tx_hash on public.payments (tx_hash);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists merchants_set_updated_at on public.merchants;
create trigger merchants_set_updated_at
  before update on public.merchants
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.merchants enable row level security;
alter table public.invoices  enable row level security;
alter table public.payments  enable row level security;

-- Merchants: a merchant can read and update their own row when authenticated
-- via a JWT containing `wallet_address` in the payload. The service role (used
-- by server-side code) bypasses these policies entirely.
drop policy if exists "merchants_select_own" on public.merchants;
create policy "merchants_select_own"
  on public.merchants for select
  using (wallet_address = coalesce((auth.jwt() ->> 'wallet_address'), ''));

drop policy if exists "merchants_update_own" on public.merchants;
create policy "merchants_update_own"
  on public.merchants for update
  using (wallet_address = coalesce((auth.jwt() ->> 'wallet_address'), ''));

-- Invoices: a merchant can read their own invoices. Inserts go through the
-- server (service role) — anonymous clients cannot create invoices directly,
-- because invoice creation is subject to rate limiting and input validation
-- that must run server-side.
drop policy if exists "invoices_select_own" on public.invoices;
create policy "invoices_select_own"
  on public.invoices for select
  using (
    merchant_id in (
      select id from public.merchants
      where wallet_address = coalesce((auth.jwt() ->> 'wallet_address'), '')
    )
  );

-- Payments: read-only for merchants on their own invoices. All inserts are
-- service-role only (triggered by webhook workers that observe on-chain txs).
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
  on public.payments for select
  using (
    invoice_id in (
      select i.id from public.invoices i
      join public.merchants m on m.id = i.merchant_id
      where m.wallet_address = coalesce((auth.jwt() ->> 'wallet_address'), '')
    )
  );
