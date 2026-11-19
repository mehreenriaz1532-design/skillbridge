-- UPGRADE script. Run ONCE in Supabase > SQL Editor, AFTER schema.sql was already run.

create table courses (
  id bigint generated always as identity primary key,
  title text not null,
  summary text default '',
  description text default '',
  benefits text default '',
  outcomes text default '',
  instructor text default '',
  icon text default '📘',
  price int default 0,
  is_demo boolean default false,
  published boolean default true,
  position int default 0
);
alter table modules add column course_id bigint references courses(id) on delete cascade;

create table enrollments (
  trainee_id bigint references trainees(id) on delete cascade,
  course_id bigint references courses(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (trainee_id, course_id)
);
create table payments (
  id bigint generated always as identity primary key,
  trainee_id bigint references trainees(id) on delete cascade,
  course_id bigint references courses(id) on delete cascade,
  method text not null,
  amount int default 0,
  trx_id text not null,
  sender text default '',
  proof_url text default '',
  status text default 'pending',
  flags text default '',
  created_at timestamptz default now()
);
create index payments_trx on payments (trx_id);
create table live_classes (
  id bigint generated always as identity primary key,
  course_id bigint references courses(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  link text default '',
  notes text default ''
);
create table announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text default '',
  pinned boolean default false,
  created_at timestamptz default now()
);
create table gallery (
  id bigint generated always as identity primary key,
  image_url text not null,
  caption text default '',
  link text default '',
  position int default 0
);
create table resets (
  token_hash text primary key,
  trainee_id bigint references trainees(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean default false
);

-- Certificates now belong to a course (one per trainee per course)
alter table certificates add column course_id bigint references courses(id) on delete cascade;
alter table certificates drop constraint if exists certificates_trainee_id_key;
create unique index certificates_trainee_course on certificates (trainee_id, course_id);

alter table courses enable row level security;
alter table enrollments enable row level security;
alter table payments enable row level security;
alter table live_classes enable row level security;
alter table announcements enable row level security;
alter table gallery enable row level security;
alter table resets enable row level security;

-- Starter content
insert into courses (title, summary, description, benefits, outcomes, instructor, icon, price, is_demo, position) values
('Soft Skills Essentials', 'Free demo course: communication, culture and teamwork basics for working abroad.',
 'A short, practical course that shows you how SkillBridge works. Learn the everyday soft skills employers abroad expect from you.',
 'Understand what employers abroad expect
Avoid common misunderstandings at work
Build confidence in daily conversations
Earn a verifiable certificate',
 'Communicate clearly with supervisors
Listen actively and confirm instructions
Respect local customs
Work reliably in a team',
 'SkillBridge Team', '🎓', 0, true, 1),
('Workplace English and Etiquette', 'Everyday English phrases and workplace manners for jobs in the Gulf and Europe.',
 'Practice the English you need on the job: greetings, instructions, safety and polite requests.',
 'Speak with more confidence at work
Understand safety instructions
Make a good first impression
Join live classes with the instructor',
 'Introduce yourself professionally
Understand and follow instructions
Ask for help politely',
 'SkillBridge Team', '💼', 2500, false, 2);

update modules set course_id = 1 where course_id is null;
insert into modules (title, description, icon, position, course_id) values ('English for the workplace', 'Everyday phrases for work and safety.', '🔤', 1, 2);
insert into lessons (module_id, title, content, position) values
 ((select max(id) from modules), 'Greetings and introductions', 'Say your name, your job and where you are from. Practice: "Good morning, my name is Ali. I am a welder. Nice to meet you."', 1);
insert into questions (module_id, question, options, answer) values
 ((select max(id) from modules), 'Which is a polite way to ask for help?', '["Help me now","Excuse me, could you help me please?","Hey you","Do it for me"]', 1),
 ((select max(id) from modules), 'How do you greet your supervisor in the morning?', '["Good morning, sir","What do you want","Nothing","Bye"]', 0);

insert into announcements (title, body, pinned) values
 ('Welcome to SkillBridge', 'Register for free and start the demo course today. New live classes will be announced here.', true);
insert into settings (key, value) values
 ('about', '"SkillBridge is an online training platform that helps Pakistani workers build the communication, teamwork and cultural skills employers abroad look for. Learn at your own pace, attend live classes and earn a certificate that anyone can verify with a QR code."'),
 ('hero_images', '[]'),
 ('pay_info', '"Bank: (bank name) - Account title: (name) - IBAN: (your IBAN)\nJazzCash: 03XX-XXXXXXX (account name)\nEasyPaisa: 03XX-XXXXXXX (account name)\nAfter paying, enter the transaction ID below. Access is activated after admin approval."')
on conflict (key) do nothing;
