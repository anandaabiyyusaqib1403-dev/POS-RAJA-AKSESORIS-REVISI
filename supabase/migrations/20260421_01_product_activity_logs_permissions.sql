-- Keep product activity audit reads from breaking the POS when older
-- environments missed table grants during the product recycle-bin rollout.

do $$
declare
  v_owner_oid oid;
  v_owner_name name;
begin
  if to_regclass('public.product_activity_logs') is not null then
    select table_info.relowner, pg_get_userbyid(table_info.relowner)
    into v_owner_oid, v_owner_name
    from pg_class as table_info
    join pg_namespace as schema_info
      on schema_info.oid = table_info.relnamespace
    where schema_info.nspname = 'public'
      and table_info.relname = 'product_activity_logs'
      and table_info.relkind in ('r', 'p');

    begin
      grant usage on schema public to authenticated;
    exception
      when insufficient_privilege then
        raise notice
          'Skip grant usage on schema public because current role % cannot grant schema privileges.',
          current_user;
    end;

    if pg_has_role(v_owner_oid, 'member') then
      begin
        grant select, insert on table public.product_activity_logs to authenticated;
        revoke update, delete on table public.product_activity_logs from authenticated;
      exception
        when insufficient_privilege then
          raise notice
            'Skip table grants on product_activity_logs because current role % is not table owner %.',
            current_user,
            v_owner_name;
      end;

      begin
        alter table public.product_activity_logs enable row level security;
      exception
        when insufficient_privilege then
          raise notice
            'Skip enable RLS on product_activity_logs because current role % is not table owner %.',
            current_user,
            v_owner_name;
      end;

      begin
        drop policy if exists "owner read product activity logs" on public.product_activity_logs;
        drop policy if exists "authenticated insert product activity logs" on public.product_activity_logs;

        create policy "owner read product activity logs"
        on public.product_activity_logs
        for select
        to authenticated
        using (public.current_user_role() = 'pemilik'::public.user_role);

        create policy "authenticated insert product activity logs"
        on public.product_activity_logs
        for insert
        to authenticated
        with check (
          actor_id = auth.uid()
          or public.current_user_role() = 'pemilik'::public.user_role
        );
      exception
        when insufficient_privilege then
          raise notice
            'Skip policy update on product_activity_logs because current role % is not table owner %.',
            current_user,
            v_owner_name;
      end;
    else
      raise notice
        'Skip product_activity_logs permissions because current role % is not owner/member of owner %.',
        current_user,
        v_owner_name;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
