alter table public.customer_email_outbox add column if not exists claimed_at timestamptz;
create table if not exists public.payment_job_runs (
  id uuid primary key default gen_random_uuid(), job text not null check (job in ('reconcile', 'email')),
  environment text, status text not null check (status in ('running', 'succeeded', 'failed', 'skipped')),
  started_at timestamptz not null default now(), completed_at timestamptz, processed_count integer not null default 0,
  checkpoint_id uuid, error_message text
);
alter table public.payment_job_runs enable row level security;
create policy "admin reads payment job history" on public.payment_job_runs for select to authenticated using (private.is_admin());
revoke all on public.payment_job_runs from public, anon, authenticated;
grant select on public.payment_job_runs to authenticated;
grant insert, update on public.payment_job_runs to service_role;

create or replace function public.finish_sepay_sync(p_environment text, p_lease_token uuid, p_checkpoint_id uuid default null, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.sepay_sync_state set checkpoint_id = coalesce(p_checkpoint_id, checkpoint_id),
    last_success_at = case when p_error is null then now() else last_success_at end,
    last_error = left(p_error, 1000), lease_token = null, lease_until = null
  where environment = p_environment and lease_token = p_lease_token;
  return found;
end; $$;

create or replace function public.claim_customer_emails(p_limit integer default 20)
returns setof public.customer_email_outbox language plpgsql security definer set search_path = '' as $$
begin
  return query with selected as (
    select id from public.customer_email_outbox
    where attempt_count < 5 and ((status = 'pending' and next_attempt_at <= now())
      or (status = 'sending' and claimed_at < now() - interval '5 minutes'))
    order by created_at for update skip locked limit greatest(1, least(p_limit, 50))
  ) update public.customer_email_outbox e set status = 'sending', attempt_count = attempt_count + 1, claimed_at = now()
    from selected where e.id = selected.id returning e.*;
end; $$;

create or replace function public.finish_customer_email(p_id uuid, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.customer_email_outbox set status = case when p_error is null then 'sent' when attempt_count >= 5 then 'failed' else 'pending' end,
    sent_at = case when p_error is null then now() else null end, claimed_at = null,
    next_attempt_at = now() + make_interval(mins => least(60, (2 ^ least(attempt_count, 6))::integer)),
    last_error = left(p_error, 1000) where id = p_id and status = 'sending';
end; $$;
