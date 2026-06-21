-- Phase 3: idempotent money-flow execution for network retries and duplicate submits.

create table if not exists public.money_operation_requests (
  operation_type text not null,
  request_key text not null,
  actor_id uuid not null references auth.users(id),
  request_payload jsonb not null,
  response_payload jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (operation_type, request_key)
);

alter table public.money_operation_requests enable row level security;
revoke all on public.money_operation_requests from public, anon, authenticated;

create index if not exists money_operation_requests_created_at_idx
on public.money_operation_requests (created_at);

create or replace function public.money_operation_intent(p_payload jsonb)
returns jsonb
language sql
immutable
as $$
  select
    (coalesce(p_payload, '{}'::jsonb) - array['id', 'request_id', 'created_at', 'no_transaksi', 'no_retur'])
    ||
    case
      when jsonb_typeof(p_payload->'transaction_items') = 'array' then
        jsonb_build_object(
          'transaction_items',
          coalesce(
            (
              select jsonb_agg(item.value - 'id')
              from jsonb_array_elements(p_payload->'transaction_items') as item(value)
            ),
            '[]'::jsonb
          )
        )
      else '{}'::jsonb
    end;
$$;

create or replace function public.money_operation_items_intent(p_items jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (
      select jsonb_agg(item.value - array['id', 'transaksi_id'])
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item(value)
    ),
    '[]'::jsonb
  );
$$;

create or replace function public.claim_money_operation(
  p_operation_type text,
  p_request_key text,
  p_request_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_claimed boolean := false;
  v_existing public.money_operation_requests%rowtype;
begin
  if v_actor_id is null then
    raise exception 'User belum login.';
  end if;

  if btrim(coalesce(p_request_key, '')) = '' then
    raise exception 'Request id transaksi wajib tersedia.';
  end if;

  insert into public.money_operation_requests (
    operation_type,
    request_key,
    actor_id,
    request_payload
  )
  values (
    p_operation_type,
    p_request_key,
    v_actor_id,
    coalesce(p_request_payload, '{}'::jsonb)
  )
  on conflict (operation_type, request_key) do nothing
  returning true into v_claimed;

  if coalesce(v_claimed, false) then
    return jsonb_build_object('claimed', true);
  end if;

  select *
  into v_existing
  from public.money_operation_requests
  where operation_type = p_operation_type
    and request_key = p_request_key;

  if v_existing.actor_id is distinct from v_actor_id then
    raise exception 'Request transaksi sudah digunakan aktor lain.';
  end if;

  if v_existing.request_payload is distinct from coalesce(p_request_payload, '{}'::jsonb) then
    raise exception 'Request transaksi yang sama berisi data berbeda.';
  end if;

  if v_existing.completed_at is null then
    raise exception 'Request transaksi masih diproses. Coba lagi sebentar.';
  end if;

  return jsonb_build_object(
    'claimed', false,
    'response', coalesce(v_existing.response_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function public.complete_money_operation(
  p_operation_type text,
  p_request_key text,
  p_response_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.money_operation_requests
  set response_payload = coalesce(p_response_payload, '{}'::jsonb),
      completed_at = now()
  where operation_type = p_operation_type
    and request_key = p_request_key
    and actor_id = auth.uid();

  if not found then
    raise exception 'Request transaksi tidak ditemukan untuk diselesaikan.';
  end if;
end;
$$;

revoke execute on function public.claim_money_operation(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.complete_money_operation(text, text, jsonb) from public, anon, authenticated;

do $migration$
begin
  if to_regprocedure('public.create_accessory_transaction_atomic_idempotency_impl(jsonb,jsonb)') is null then
    execute 'alter function public.create_accessory_transaction_atomic(jsonb, jsonb) rename to create_accessory_transaction_atomic_idempotency_impl';
  end if;
  if to_regprocedure('public.create_digital_transaction_atomic_idempotency_impl(jsonb)') is null then
    execute 'alter function public.create_digital_transaction_atomic(jsonb) rename to create_digital_transaction_atomic_idempotency_impl';
  end if;
  if to_regprocedure('public.create_logistics_transaction_atomic_idempotency_impl(jsonb)') is null then
    execute 'alter function public.create_logistics_transaction_atomic(jsonb) rename to create_logistics_transaction_atomic_idempotency_impl';
  end if;
  if to_regprocedure('public.create_wallet_transaction_atomic_authorized_impl(jsonb)') is null then
    execute 'alter function public.create_wallet_transaction_atomic(jsonb) rename to create_wallet_transaction_atomic_authorized_impl';
  end if;
  if to_regprocedure('public.create_supplier_return_atomic_idempotency_impl(jsonb,jsonb)') is null then
    execute 'alter function public.create_supplier_return_atomic(jsonb, jsonb) rename to create_supplier_return_atomic_idempotency_impl';
  end if;
  if to_regprocedure('public.create_customer_return_atomic_idempotency_impl(jsonb,jsonb)') is null then
    execute 'alter function public.create_customer_return_atomic(jsonb, jsonb) rename to create_customer_return_atomic_idempotency_impl';
  end if;
  if to_regprocedure('public.update_supplier_return_status_atomic_idempotency_impl(uuid,text,jsonb)') is null then
    execute 'alter function public.update_supplier_return_status_atomic(uuid, text, jsonb) rename to update_supplier_return_status_atomic_idempotency_impl';
  end if;
  if to_regprocedure('public.close_shift_atomic_authorized_impl(uuid,integer,text,text)') is null then
    execute 'alter function public.close_shift_atomic(uuid, integer, text, text) rename to close_shift_atomic_authorized_impl';
  end if;
  if to_regprocedure('public.void_transaction_atomic_idempotency_impl(text,uuid,text)') is null then
    execute 'alter function public.void_transaction_atomic(text, uuid, text) rename to void_transaction_atomic_idempotency_impl';
  end if;
end
$migration$;

revoke execute on function public.create_accessory_transaction_atomic_idempotency_impl(jsonb, jsonb)
from public, anon, authenticated;
revoke execute on function public.create_digital_transaction_atomic_idempotency_impl(jsonb)
from public, anon, authenticated;
revoke execute on function public.create_logistics_transaction_atomic_idempotency_impl(jsonb)
from public, anon, authenticated;
revoke execute on function public.create_wallet_transaction_atomic_authorized_impl(jsonb)
from public, anon, authenticated;
revoke execute on function public.create_supplier_return_atomic_idempotency_impl(jsonb, jsonb)
from public, anon, authenticated;
revoke execute on function public.create_customer_return_atomic_idempotency_impl(jsonb, jsonb)
from public, anon, authenticated;
revoke execute on function public.update_supplier_return_status_atomic_idempotency_impl(uuid, text, jsonb)
from public, anon, authenticated;
revoke execute on function public.close_shift_atomic_authorized_impl(uuid, integer, text, text)
from public, anon, authenticated;
revoke execute on function public.void_transaction_atomic_idempotency_impl(text, uuid, text)
from public, anon, authenticated;

create or replace function public.create_accessory_transaction_atomic(p_transaction jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_key text := coalesce(nullif(p_transaction->>'request_id', ''), nullif(p_transaction->>'id', ''));
  v_claim jsonb;
  v_result jsonb;
begin
  v_claim := public.claim_money_operation(
    'accessory_sale',
    v_request_key,
    jsonb_build_object(
      'transaction', public.money_operation_intent(p_transaction),
      'items', public.money_operation_items_intent(p_items)
    )
  );
  if not coalesce((v_claim->>'claimed')::boolean, false) then
    return v_claim->'response';
  end if;

  v_result := public.create_accessory_transaction_atomic_idempotency_impl(p_transaction, p_items);
  perform public.complete_money_operation('accessory_sale', v_request_key, v_result);
  return v_result;
end;
$$;

create or replace function public.create_digital_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_key text := coalesce(nullif(p_transaction->>'request_id', ''), nullif(p_transaction->>'id', ''));
  v_claim jsonb;
  v_result jsonb;
begin
  v_claim := public.claim_money_operation(
    'digital_sale',
    v_request_key,
    public.money_operation_intent(p_transaction)
  );
  if not coalesce((v_claim->>'claimed')::boolean, false) then
    return v_claim->'response';
  end if;

  v_result := public.create_digital_transaction_atomic_idempotency_impl(p_transaction);
  perform public.complete_money_operation('digital_sale', v_request_key, v_result);
  return v_result;
end;
$$;

create or replace function public.create_logistics_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_key text := coalesce(nullif(p_transaction->>'request_id', ''), nullif(p_transaction->>'id', ''));
  v_claim jsonb;
  v_result jsonb;
begin
  v_claim := public.claim_money_operation(
    'logistics_sale',
    v_request_key,
    public.money_operation_intent(p_transaction)
  );
  if not coalesce((v_claim->>'claimed')::boolean, false) then
    return v_claim->'response';
  end if;

  v_result := public.create_logistics_transaction_atomic_idempotency_impl(p_transaction);
  perform public.complete_money_operation('logistics_sale', v_request_key, v_result);
  return v_result;
end;
$$;

create or replace function public.create_wallet_transaction_atomic(p_transaction jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_key text := coalesce(nullif(p_transaction->>'request_id', ''), nullif(p_transaction->>'id', ''));
  v_claim jsonb;
  v_result jsonb;
begin
  v_claim := public.claim_money_operation(
    'wallet_mutation',
    v_request_key,
    public.money_operation_intent(p_transaction)
  );
  if not coalesce((v_claim->>'claimed')::boolean, false) then
    return v_claim->'response';
  end if;

  v_result := public.create_wallet_transaction_atomic_authorized_impl(p_transaction);
  perform public.complete_money_operation('wallet_mutation', v_request_key, v_result);
  return v_result;
end;
$$;

create or replace function public.create_cash_entry_atomic(p_entry jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_entry_id uuid := coalesce(nullif(p_entry->>'id', '')::uuid, gen_random_uuid());
  v_request_key text := coalesce(nullif(p_entry->>'request_id', ''), v_entry_id::text);
  v_kasir_id uuid := coalesce(nullif(p_entry->>'kasir_id', '')::uuid, v_actor_id);
  v_saved_entry public.kas%rowtype;
  v_claim jsonb;
  v_result jsonb;
begin
  if not public.current_user_has_employee_permission('finance.cash_wallet') then
    raise exception 'Akses catatan kas tidak diizinkan.';
  end if;
  if v_kasir_id is distinct from v_actor_id then
    raise exception 'Catatan kas hanya dapat dibuat untuk pengguna aktif.';
  end if;

  v_claim := public.claim_money_operation(
    'cash_entry',
    v_request_key,
    public.money_operation_intent(p_entry)
  );
  if not coalesce((v_claim->>'claimed')::boolean, false) then
    return v_claim->'response';
  end if;

  insert into public.kas (id, kasir_id, jenis, kategori, nominal, keterangan, tanggal, created_at)
  values (
    v_entry_id,
    v_kasir_id,
    (p_entry->>'jenis')::public.jenis_kas,
    (p_entry->>'kategori')::public.kategori_kas,
    coalesce((p_entry->>'nominal')::numeric::integer, 0),
    p_entry->>'keterangan',
    coalesce(nullif(p_entry->>'tanggal', '')::date, current_date),
    coalesce(nullif(p_entry->>'created_at', '')::timestamptz, now())
  )
  returning * into v_saved_entry;

  v_result := to_jsonb(v_saved_entry);

  insert into public.audit_logs (
    actor_id, actor_role, action, target_table, target_id, before_value, after_value, reason, incident_code
  )
  values (
    v_actor_id,
    public.current_user_role()::text,
    'cash.create_entry',
    'kas',
    v_entry_id,
    '{}'::jsonb,
    v_result,
    'Permission-enforced cash entry',
    'MONEY-FLOW'
  );

  perform public.complete_money_operation('cash_entry', v_request_key, v_result);
  return v_result;
end;
$$;

create or replace function public.create_supplier_return_atomic(p_return jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_key text := coalesce(nullif(p_return->>'request_id', ''), nullif(p_return->>'id', ''));
  v_claim jsonb;
  v_result jsonb;
begin
  v_claim := public.claim_money_operation(
    'supplier_return',
    v_request_key,
    jsonb_build_object(
      'return', public.money_operation_intent(p_return),
      'items', public.money_operation_items_intent(p_items)
    )
  );
  if not coalesce((v_claim->>'claimed')::boolean, false) then
    return v_claim->'response';
  end if;

  v_result := public.create_supplier_return_atomic_idempotency_impl(p_return, p_items);
  perform public.complete_money_operation('supplier_return', v_request_key, v_result);
  return v_result;
end;
$$;

create or replace function public.create_customer_return_atomic(p_return jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_key text := coalesce(nullif(p_return->>'request_id', ''), nullif(p_return->>'id', ''));
  v_claim jsonb;
  v_result jsonb;
begin
  v_claim := public.claim_money_operation(
    'customer_return',
    v_request_key,
    jsonb_build_object(
      'return', public.money_operation_intent(p_return),
      'items', public.money_operation_items_intent(p_items)
    )
  );
  if not coalesce((v_claim->>'claimed')::boolean, false) then
    return v_claim->'response';
  end if;

  v_result := public.create_customer_return_atomic_idempotency_impl(p_return, p_items);
  perform public.complete_money_operation('customer_return', v_request_key, v_result);
  return v_result;
end;
$$;

create or replace function public.update_supplier_return_status_atomic(
  p_id uuid,
  p_status text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_key text := p_id::text || ':' || p_status;
  v_claim jsonb;
  v_result jsonb;
begin
  v_claim := public.claim_money_operation(
    'supplier_return_resolution',
    v_request_key,
    coalesce(p_payload, '{}'::jsonb)
  );
  if not coalesce((v_claim->>'claimed')::boolean, false) then
    return v_claim->'response';
  end if;

  v_result := public.update_supplier_return_status_atomic_idempotency_impl(p_id, p_status, p_payload);
  perform public.complete_money_operation('supplier_return_resolution', v_request_key, v_result);
  return v_result;
end;
$$;

create or replace function public.close_shift_atomic(
  p_shift_id uuid,
  p_actual_cash integer,
  p_notes text default '',
  p_pin text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_key text := p_shift_id::text;
  v_claim jsonb;
  v_result jsonb;
begin
  v_claim := public.claim_money_operation(
    'shift_closing',
    v_request_key,
    jsonb_build_object('actual_cash', p_actual_cash, 'notes', btrim(coalesce(p_notes, '')))
  );
  if not coalesce((v_claim->>'claimed')::boolean, false) then
    return v_claim->'response';
  end if;

  v_result := public.close_shift_atomic_authorized_impl(p_shift_id, p_actual_cash, p_notes, p_pin);
  perform public.complete_money_operation('shift_closing', v_request_key, v_result);
  return v_result;
end;
$$;

create or replace function public.void_transaction_atomic(p_source text, p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_key text := lower(btrim(p_source)) || ':' || p_id::text;
  v_claim jsonb;
  v_result jsonb;
begin
  v_claim := public.claim_money_operation(
    'transaction_void',
    v_request_key,
    jsonb_build_object('source', lower(btrim(p_source)), 'id', p_id, 'reason', btrim(coalesce(p_reason, '')))
  );
  if not coalesce((v_claim->>'claimed')::boolean, false) then
    return v_claim->'response';
  end if;

  v_result := public.void_transaction_atomic_idempotency_impl(p_source, p_id, p_reason);
  perform public.complete_money_operation('transaction_void', v_request_key, v_result);
  return v_result;
end;
$$;

grant execute on function public.create_accessory_transaction_atomic(jsonb, jsonb) to authenticated;
grant execute on function public.create_digital_transaction_atomic(jsonb) to authenticated;
grant execute on function public.create_logistics_transaction_atomic(jsonb) to authenticated;
grant execute on function public.create_wallet_transaction_atomic(jsonb) to authenticated;
grant execute on function public.create_cash_entry_atomic(jsonb) to authenticated;
grant execute on function public.create_supplier_return_atomic(jsonb, jsonb) to authenticated;
grant execute on function public.create_customer_return_atomic(jsonb, jsonb) to authenticated;
grant execute on function public.update_supplier_return_status_atomic(uuid, text, jsonb) to authenticated;
grant execute on function public.close_shift_atomic(uuid, integer, text, text) to authenticated;
grant execute on function public.void_transaction_atomic(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
