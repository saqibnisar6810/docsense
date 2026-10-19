-- DocSense schema. Run once in the Supabase SQL Editor.

create table if not exists workspaces (
  id uuid primary key,
  webhook_url text,
  webhook_secret text not null,
  created_at timestamptz not null default now(),
  touched_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  file_name text not null,
  mime text not null,
  file_path text not null,
  pages jsonb not null default '[]',
  is_sample boolean not null default false,
  status text not null check (status in ('processing', 'needs_review', 'ready', 'approved', 'failed')),
  document_type text,
  method text check (method in ('text', 'vision')),
  model text,
  duration_ms integer,
  fields jsonb,
  line_items jsonb not null default '[]',
  checks jsonb not null default '[]',
  notes text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists documents_workspace_idx on documents (workspace_id, created_at desc);
create index if not exists documents_cleanup_idx on documents (created_at) where not is_sample;

-- Audit history: uploads, extractions, edits (with before/after), approvals, webhook deliveries.
create table if not exists events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists events_workspace_idx on events (workspace_id, created_at desc);
create index if not exists events_document_idx on events (document_id, created_at desc);

-- Only the server (service role key) talks to the database.
alter table workspaces enable row level security;
alter table documents enable row level security;
alter table events enable row level security;

-- Private bucket for uploads. Files are reached through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 4194304, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
