-- =====================================================================
-- هوم ماربل ERP — الإصدار 5.4 (المرحلة الرابعة: تعديلات العميل)
-- ملف إضافي فقط، وتشغيله أكثر من مرة آمن (Idempotent).
-- شغّله من Supabase ← SQL Editor بعد الملفات 0000..0003.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) المدير التنفيذي = له كل صلاحيات المدير العام (مدير النظام)
--    أي سياسة أو دالة تشترط 'admin' يجتازها الآن 'executive' أيضاً
--    (تعديل الصلاحيات، الفروع، سلة المحذوفات، استعادة النسخ، كلمات مرور الحسابات الإدارية...)
-- ---------------------------------------------------------------------
create or replace function public.hm_has_any(_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
     where user_id = auth.uid()
       and (role::text = any(_roles) or (role::text = 'executive' and 'admin' = any(_roles)))
  );
$$;

create or replace function public.hm_p1_any(_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
     where user_id = auth.uid()
       and (role::text = any(_roles) or (role::text = 'executive' and 'admin' = any(_roles)))
  );
$$;

-- دوال مساعدة تعتمد عليها السياسات (تُعرَّف هنا ليكون الملف مستقلاً حتى لو كانت ناقصة في قاعدتك)
create or replace function public.hm_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid());
$$;
create or replace function public.hm_is_mgr()
returns boolean language sql stable security definer set search_path = public as $$
  select public.hm_has_any(array['admin','executive']);
$$;
create or replace function public.hm_touch()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
grant execute on function public.hm_has_any(text[]), public.hm_p1_any(text[]), public.hm_is_staff(), public.hm_is_mgr() to authenticated;

do $$ begin
  if to_regprocedure('public.has_role(uuid, public.app_role)') is not null then
    execute $f$
      create or replace function public.has_role(_user_id uuid, _role public.app_role)
      returns boolean language sql stable security definer set search_path = public as $b$
        select exists (select 1 from public.user_roles
                        where user_id = _user_id
                          and (role = _role or (role::text = 'executive' and _role::text = 'admin')))
      $b$ $f$;
  end if;
exception when others then null;
end $$;

-- ---------------------------------------------------------------------
-- 2) العملاء: نوع العميل (فرد / شركة) + بيانات الشركة
-- ---------------------------------------------------------------------
alter table public.customers add column if not exists customer_type text not null default 'individual';
alter table public.customers add column if not exists contact_person text;
alter table public.customers add column if not exists cr_no text;
alter table public.customers add column if not exists tax_no text;
do $$ begin
  alter table public.customers add constraint customers_customer_type_chk check (customer_type in ('individual','company'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3) المخزون: نوع المنتج (بالقطعة / بالمتر) + سعر البيع (لربط عرض السعر بالمخزن)
-- ---------------------------------------------------------------------
alter table public.inventory_items add column if not exists sale_type text not null default 'piece';
alter table public.inventory_items add column if not exists sale_price numeric not null default 0;
do $$ begin
  alter table public.inventory_items add constraint inventory_items_sale_type_chk check (sale_type in ('piece','meter'));
exception when duplicate_object then null; end $$;
update public.inventory_items set sale_type = 'meter'
 where sale_type = 'piece' and unit in ('م','متر','م2','م²','م.ط','متر طولي','متر مربع');

-- ---------------------------------------------------------------------
-- 4) المستندات: بيانات إضافية للعقد (صور التصميم والرسم الهندسي وخانات التفاصيل)
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists meta jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 5) الإعلانات: إرسال لأكثر من قسم (وظيفة) بدل قسم واحد أو الكل
--    target_roles فارغة = الاعتماد على target_role القديم (null = لكل الموظفين)
-- ---------------------------------------------------------------------
alter table public.announcements add column if not exists target_roles text[] not null default '{}';

drop policy if exists "hm3_read" on public.announcements;
create policy "hm3_read" on public.announcements for select to authenticated using (
  public.hm_is_mgr()
  or (public.hm_is_staff() and (
        (coalesce(array_length(target_roles, 1), 0) = 0 and (target_role is null or public.hm_has_any(array[target_role])))
        or (coalesce(array_length(target_roles, 1), 0) > 0 and public.hm_has_any(target_roles))
     ))
);
drop policy if exists "hm3_ins" on public.announcements;
create policy "hm3_ins" on public.announcements for insert to authenticated with check (public.hm_is_mgr());

-- ---------------------------------------------------------------------
-- 6) إزالة جدولة مواعيد التركيبات من صلاحيات المبيعات
-- ---------------------------------------------------------------------
drop policy if exists "hm_p2_ins" on public.installation_jobs;
drop policy if exists "hm_p2_upd" on public.installation_jobs;
create policy "hm_p2_ins" on public.installation_jobs for insert to authenticated
  with check (public.hm_has_any(array['admin','executive','factory_manager']));
create policy "hm_p2_upd" on public.installation_jobs for update to authenticated
  using (public.hm_has_any(array['admin','executive','factory_manager'])
         or (public.hm_has_any(array['installer']) and (team_lead_id = auth.uid() or auth.uid() = any(member_ids) or team_lead_id is null)))
  with check (public.hm_has_any(array['admin','executive','factory_manager'])
         or (public.hm_has_any(array['installer']) and (team_lead_id = auth.uid() or auth.uid() = any(member_ids) or team_lead_id is null)));

-- ---------------------------------------------------------------------
-- 7) المخزون والمشتريات: تثبيت صلاحيات المدير التنفيذي صراحةً (إصلاح إضافة الأصناف والعمليات)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['suppliers','inventory_items','inventory_movements','inventory_reservations','purchase_requests'] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      execute format('grant all on public.%I to service_role', t);
    end if;
  end loop;
end $$;

drop policy if exists "hm_p2_ins" on public.inventory_items;
drop policy if exists "hm_p2_upd" on public.inventory_items;
drop policy if exists "hm_p2_del" on public.inventory_items;
create policy "hm_p2_ins" on public.inventory_items for insert to authenticated
  with check (public.hm_has_any(array['admin','executive','warehouse','factory_manager','purchasing']));
create policy "hm_p2_upd" on public.inventory_items for update to authenticated
  using (public.hm_has_any(array['admin','executive','warehouse','factory_manager','purchasing']))
  with check (public.hm_has_any(array['admin','executive','warehouse','factory_manager','purchasing']));
create policy "hm_p2_del" on public.inventory_items for delete to authenticated
  using (public.hm_has_any(array['admin','executive']));

drop policy if exists "hm_p2_ins" on public.inventory_movements;
create policy "hm_p2_ins" on public.inventory_movements for insert to authenticated
  with check (public.hm_has_any(array['admin','executive','warehouse','factory_manager']));

-- ---------------------------------------------------------------------
-- 8) استيراد بنود التصنيع من الفاتورة/العقد: يحمل نوع المنتج (قطعة / متر) أيضاً
-- ---------------------------------------------------------------------
create or replace function public.hm_import_items(_order uuid)
returns int language plpgsql security definer set search_path = public as $$
declare doc record; el jsonb; n int := 0; wt text;
begin
  if not public.hm_has_any(array['admin','executive','factory_manager','sales','accountant']) then
    raise exception 'لا تملك صلاحية استيراد البنود';
  end if;
  if exists (select 1 from public.order_items where order_id = _order) then return 0; end if;
  select id, items into doc from public.documents
   where order_id = _order and kind::text in ('invoice','contract','quote')
     and jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0
   order by case kind::text when 'invoice' then 1 when 'contract' then 2 else 3 end,
            (status::text = 'approved') desc, created_at desc
   limit 1;
  if doc.id is not null then
    for el in select * from jsonb_array_elements(doc.items) loop
      if coalesce(trim(el->>'name'), '') <> '' then
        n := n + 1;
        insert into public.order_items (order_id, name, qty, unit, source_doc_id, sort)
        values (_order, el->>'name', coalesce(nullif(el->>'qty','')::numeric, 1), nullif(el->>'unit',''), doc.id, n);
      end if;
    end loop;
  end if;
  if n = 0 then
    select work_type into wt from public.orders where id = _order;
    insert into public.order_items (order_id, name, qty, sort) values (_order, coalesce(wt, 'منتج'), 1, 1);
    n := 1;
  end if;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 9) Bucket الصور الخاص (صور التصميم والرسم الهندسي في العقد) — لا يتغير إن كان موجوداً
-- ---------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('hm-files', 'hm-files', false) on conflict (id) do nothing;
  end if;
exception when others then null;
end $$;

-- تحديث كاش واجهة البرمجة (PostgREST) ليتعرف على الأعمدة الجديدة فوراً
notify pgrst, 'reload schema';
