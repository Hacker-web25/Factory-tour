-- ============================================================================
-- VPV — Inbox (Nov 2026): a shared team mailbox for support@myvpv.com
--
-- Mail sent to the company address arrives here (Resend "receiving" posts each
-- message to /api/inbox/inbound). Every conversation gets a ticket number, the
-- sender gets an automatic acknowledgement with an expected reply time, and the
-- team reads and answers inside VPV — nobody needs a hosting or mail login.
--
--   inbox_members    who besides the platform owner may use the inbox
--                    (matched by the e-mail on their VPV login)
--   inbox_settings   ONE row: the auto-reply wording, the reply target and the
--                    office hours it is counted in, and the signature
--   inbox_threads    one row per conversation (ticket number, status, owner)
--   inbox_messages   every message in a conversation: what came in, what the
--                    team sent, the automatic acknowledgement, internal notes
--
-- Safe to run more than once. Run in the Supabase SQL editor.
-- Owner/server only: RLS on, no policy, no grants to the browser roles. Every
-- read and write goes through our own route handlers (service role), which
-- check the caller first.
-- ============================================================================

create table if not exists public.inbox_members (
  email       text primary key check (email = lower(email)),
  name        text,
  -- agent: reads and replies.  admin: also changes the auto-reply settings.
  role        text not null default 'agent' check (role in ('agent', 'admin')),
  added_by    text,
  created_at  timestamptz not null default now()
);

comment on table public.inbox_members is
  'People allowed into the VPV Inbox besides the platform owner, matched by the e-mail on their VPV login.';

create table if not exists public.inbox_settings (
  -- A single row: the primary key can only ever be TRUE.
  id                  boolean primary key default true check (id),
  support_address     text    not null default 'support@myvpv.com',
  from_name           text    not null default 'VPV Support',
  ack_enabled         boolean not null default true,
  -- {name} {ticket} {eta} are filled in per message.
  ack_body            text    not null default
    E'Hello {name},\n\nThank you for writing to VPV. We have your message and your reference is {ticket}.\n\nA member of our team will reply {eta}.\n\nIf you want to add something, just reply to this e-mail. It will be added to the same ticket.',
  reply_target_hours  integer not null default 4 check (reply_target_hours between 1 and 240),
  -- Office hours the target is counted in. Days: 0 = Sunday … 6 = Saturday.
  office_start_hour   integer not null default 10 check (office_start_hour between 0 and 23),
  office_end_hour     integer not null default 18 check (office_end_hour between 1 and 24),
  office_days         integer[] not null default '{1,2,3,4,5,6}',
  -- Minutes east of UTC. 330 = India (no daylight saving).
  tz_offset_min       integer not null default 330 check (tz_offset_min between -720 and 840),
  signature           text    not null default E'VPV Support Team\nVirtual Plant Visit\nhttps://myvpv.com',
  updated_at          timestamptz not null default now(),
  updated_by          text,
  check (office_end_hour > office_start_hour)
);

insert into public.inbox_settings (id) values (true) on conflict (id) do nothing;

comment on table public.inbox_settings is
  'The one row of inbox settings: auto-reply wording, reply target, office hours, signature.';

create table if not exists public.inbox_threads (
  id               uuid primary key default gen_random_uuid(),
  -- Shown to the customer as [VPV-1001]; starts at 1001 so it looks established.
  ticket_no        bigint generated always as identity (start with 1001) unique,
  subject          text not null default '',
  customer_email   text not null,
  customer_name    text,
  status           text not null default 'open'
                     check (status in ('open', 'waiting', 'solved', 'spam')),
  assignee_email   text,
  message_count    integer not null default 0,
  -- A message has come in that nobody has opened yet.
  unread           boolean not null default true,
  first_inbound_at timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  last_inbound_at  timestamptz,
  first_reply_at   timestamptz,
  -- When the customer was promised an answer (office hours already counted).
  due_at           timestamptz,
  ack_sent_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists inbox_threads_status_idx
  on public.inbox_threads (status, last_message_at desc);
create index if not exists inbox_threads_customer_idx
  on public.inbox_threads (customer_email);

create table if not exists public.inbox_messages (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references public.inbox_threads(id) on delete cascade,
  -- in: from the customer.  out: sent by us.  note: internal, never sent.
  direction     text not null check (direction in ('in', 'out', 'note')),
  -- mail: a real message.  ack: the automatic acknowledgement.  note: internal.
  kind          text not null default 'mail' check (kind in ('mail', 'ack', 'note')),
  -- Resend's id for the message (received or sent). Unique, so a webhook that
  -- is delivered twice cannot create the message twice.
  provider_id   text,
  message_id    text,
  in_reply_to   text,
  refs          text,
  from_email    text,
  from_name     text,
  to_emails     text[] not null default '{}',
  cc_emails     text[] not null default '{}',
  subject       text,
  text_body     text not null default '',
  -- Kept for reference. NEVER rendered as HTML in the app: mail from the
  -- internet is untrusted, so the screen shows the text only.
  html_body     text,
  -- The team member who wrote an out/note message.
  author_email  text,
  attachments   jsonb not null default '[]'::jsonb,
  delivery      text check (delivery in ('sent', 'failed')),
  error         text,
  created_at    timestamptz not null default now()
);

create unique index if not exists inbox_messages_provider_uq
  on public.inbox_messages (provider_id) where provider_id is not null;
create index if not exists inbox_messages_thread_idx
  on public.inbox_messages (thread_id, created_at);
create index if not exists inbox_messages_message_id_idx
  on public.inbox_messages (message_id) where message_id is not null;

alter table public.inbox_members  enable row level security;
alter table public.inbox_settings enable row level security;
alter table public.inbox_threads  enable row level security;
alter table public.inbox_messages enable row level security;
revoke all on public.inbox_members  from anon, authenticated;
revoke all on public.inbox_settings from anon, authenticated;
revoke all on public.inbox_threads  from anon, authenticated;
revoke all on public.inbox_messages from anon, authenticated;
