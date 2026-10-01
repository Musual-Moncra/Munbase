create or replace function public.admin_get_checkout_access()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_enabled boolean; v_buyers jsonb;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  select checkout_enabled into v_enabled from public.marketplace_settings where id = true;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email,
    'allowed', (b.user_id is not null)) order by p.created_at desc), '[]'::jsonb)
    into v_buyers from public.profiles p left join private.checkout_test_buyers b on b.user_id = p.id where p.role = 'buyer';
  return jsonb_build_object('enabled', coalesce(v_enabled, false), 'buyers', v_buyers);
end; $$;

create or replace function public.admin_set_checkout_access(p_enabled boolean, p_buyer_id uuid default null, p_allowed boolean default false, p_reason text default 'Controlled checkout configuration')
returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after jsonb;
begin
  if not private.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  select jsonb_build_object('enabled', checkout_enabled) into v_before from public.marketplace_settings where id = true for update;
  update public.marketplace_settings set checkout_enabled = p_enabled, updated_at = now() where id = true;
  if p_buyer_id is not null then
    if not exists(select 1 from public.profiles where id = p_buyer_id and role = 'buyer') then raise exception 'buyer_not_found'; end if;
    if p_allowed then insert into private.checkout_test_buyers(user_id) values(p_buyer_id) on conflict do nothing;
    else delete from private.checkout_test_buyers where user_id = p_buyer_id; end if;
    v_after := jsonb_build_object('enabled', p_enabled, 'buyer_id', p_buyer_id, 'allowed', p_allowed);
  else v_after := jsonb_build_object('enabled', p_enabled); end if;
  insert into public.admin_audit_log(actor_id, entity_type, entity_id, action, reason, before_state, after_state)
    values((select auth.uid()), 'checkout_access', coalesce(p_buyer_id, gen_random_uuid()), 'update_checkout_access', trim(p_reason), coalesce(v_before, '{}'::jsonb), coalesce(v_after, '{}'::jsonb));
end; $$;
revoke all on function public.admin_get_checkout_access(), public.admin_set_checkout_access(boolean,uuid,boolean,text) from public, anon;
grant execute on function public.admin_get_checkout_access(), public.admin_set_checkout_access(boolean,uuid,boolean,text) to authenticated;
