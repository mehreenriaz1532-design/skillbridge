-- Run ONCE in Supabase > SQL Editor (after schema.sql, schema2.sql and schema3.sql).
-- Ratings and suggestions sent from the website
create table feedback (
  id bigint generated always as identity primary key,
  name text not null,
  rating int not null check (rating between 1 and 5),
  message text not null,
  created_at timestamptz default now()
);
alter table feedback enable row level security;
