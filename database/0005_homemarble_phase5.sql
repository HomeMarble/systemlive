-- =====================================================================
-- هوم ماربل ERP — الإصدار 5.5 (المرحلة الخامسة)
--  1) صلاحيات فرعية لكل موظف (مربعات اختيار يحددها المدير)
--  2) قوالب العقود القابلة للتحرير (رفع قالب من الجهاز ثم التعديل داخل النظام)
--  3) ملحوظات العملاء في المصنع
-- ملف إضافي فقط، وتشغيله أكثر من مرة آمن (Idempotent).
-- شغّله بعد 0004 (أو شغّل الملف المجمّع UPDATE_v5.5_RUN_THIS.sql مرة واحدة).
-- =====================================================================

create table if not exists public.hm_user_perms (
  user_id uuid primary key references auth.users(id) on delete cascade,
  denied text[] not null default '{}',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.hm_user_perms enable row level security;
grant select, insert, update, delete on public.hm_user_perms to authenticated;
grant all on public.hm_user_perms to service_role;
drop policy if exists "hm5_perms_read" on public.hm_user_perms;
drop policy if exists "hm5_perms_ins"  on public.hm_user_perms;
drop policy if exists "hm5_perms_upd"  on public.hm_user_perms;
drop policy if exists "hm5_perms_del"  on public.hm_user_perms;
create policy "hm5_perms_read" on public.hm_user_perms for select to authenticated using (user_id = auth.uid() or public.hm_is_mgr());
create policy "hm5_perms_ins"  on public.hm_user_perms for insert to authenticated with check (public.hm_is_mgr());
create policy "hm5_perms_upd"  on public.hm_user_perms for update to authenticated using (public.hm_is_mgr()) with check (public.hm_is_mgr());
create policy "hm5_perms_del"  on public.hm_user_perms for delete to authenticated using (public.hm_is_mgr());

create table if not exists public.hm_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'contract',
  pages jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hm_templates enable row level security;
grant select, insert, update, delete on public.hm_templates to authenticated;
grant all on public.hm_templates to service_role;
drop policy if exists "hm5_tpl_read" on public.hm_templates;
drop policy if exists "hm5_tpl_ins"  on public.hm_templates;
drop policy if exists "hm5_tpl_upd"  on public.hm_templates;
drop policy if exists "hm5_tpl_del"  on public.hm_templates;
create policy "hm5_tpl_read" on public.hm_templates for select to authenticated using (public.hm_is_staff());
create policy "hm5_tpl_ins"  on public.hm_templates for insert to authenticated with check (public.hm_has_any(array['admin','executive','sales']));
create policy "hm5_tpl_upd"  on public.hm_templates for update to authenticated using (public.hm_has_any(array['admin','executive','sales'])) with check (public.hm_has_any(array['admin','executive','sales']));
create policy "hm5_tpl_del"  on public.hm_templates for delete to authenticated using (public.hm_has_any(array['admin','executive']));
drop trigger if exists trg_hm5_tpl_touch on public.hm_templates;
create trigger trg_hm5_tpl_touch before update on public.hm_templates for each row execute function public.hm_touch();

create table if not exists public.hm_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  body text not null check (char_length(btrim(body)) > 0),
  source text not null default 'factory',
  author_id uuid default auth.uid(),
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_hm_notes_cust on public.hm_notes(customer_id, created_at desc);
alter table public.hm_notes enable row level security;
grant select, insert, update, delete on public.hm_notes to authenticated;
grant all on public.hm_notes to service_role;
drop policy if exists "hm5_notes_read" on public.hm_notes;
drop policy if exists "hm5_notes_ins"  on public.hm_notes;
drop policy if exists "hm5_notes_del"  on public.hm_notes;
create policy "hm5_notes_read" on public.hm_notes for select to authenticated using (public.hm_is_staff());
create policy "hm5_notes_ins"  on public.hm_notes for insert to authenticated with check (public.hm_is_staff());
create policy "hm5_notes_del"  on public.hm_notes for delete to authenticated using (public.hm_is_mgr() or author_id = auth.uid());

do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['hm_user_perms','hm_templates','hm_notes'] loop
      begin execute format('alter publication supabase_realtime add table public.%I', t);
      exception when others then null; end;
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
