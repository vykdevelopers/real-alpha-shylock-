-- Real Alpha Shylock Loan — Supabase setup
-- Run the whole script in Supabase Dashboard > SQL Editor.
-- Keep the loan-documents bucket PRIVATE.

create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','staff')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.has_staff_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin','staff')
  );
$$;

create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,
  full_name text not null,
  email text not null,
  phone text not null,
  national_id text not null,
  loan_amount numeric(12,2) not null check (loan_amount between 5000 and 50000),
  loan_type text not null check (loan_type in ('Business Loan','Education Loan','Emergency Loan')),
  marital_status text not null,
  spouse_name text,
  guarantor_name text not null,
  guarantor_phone text not null,
  purpose_details text not null,
  passport_path text not null,
  id_front_path text not null,
  id_back_path text not null,
  status text not null default 'Pending'
    check (status in ('Pending','Under Review','Approved','Rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loan_applications_applicant_idx
  on public.loan_applications(applicant_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists loan_applications_updated_at on public.loan_applications;
create trigger loan_applications_updated_at
before update on public.loan_applications
for each row execute function public.set_updated_at();

alter table public.user_roles enable row level security;
alter table public.loan_applications enable row level security;

drop policy if exists "Users can read their own role rows" on public.user_roles;
create policy "Users can read their own role rows"
on public.user_roles for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Applicants can read their own applications" on public.loan_applications;
create policy "Applicants can read their own applications"
on public.loan_applications for select to authenticated
using (applicant_id = auth.uid() or public.has_staff_access());

drop policy if exists "Applicants can submit their own applications" on public.loan_applications;
create policy "Applicants can submit their own applications"
on public.loan_applications for insert to authenticated
with check (
  applicant_id = auth.uid()
  and status = 'Pending'
  and loan_amount between 5000 and 50000
);

drop policy if exists "Staff can update application status" on public.loan_applications;
create policy "Staff can update application status"
on public.loan_applications for update to authenticated
using (public.has_staff_access())
with check (public.has_staff_access());

-- Private document bucket. File size/type limits are also enforced in the browser,
-- but storage policies remain the actual access control.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('loan-documents', 'loan-documents', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Applicants upload into their own folder" on storage.objects;
create policy "Applicants upload into their own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'loan-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Applicants and staff can read permitted documents" on storage.objects;
create policy "Applicants and staff can read permitted documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'loan-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_staff_access()
  )
);

-- Do not add a public read policy or expose a service_role key in browser code.
