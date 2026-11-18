-- Run this ONCE in Supabase > SQL Editor > New query > paste all > Run.
-- Use a fresh project (the starter content below assumes ids start at 1).

create table trainees (
  id bigint generated always as identity primary key,
  cnic text unique not null,
  first_name text not null,
  middle_name text default '',
  last_name text not null,
  dob date not null,
  email text not null,
  phone text default '',
  password_hash text not null,
  created_at timestamptz default now()
);
create table modules (
  id bigint generated always as identity primary key,
  title text not null,
  description text default '',
  icon text default '📘',
  position int default 0,
  published boolean default true
);
create table lessons (
  id bigint generated always as identity primary key,
  module_id bigint references modules(id) on delete cascade,
  title text not null,
  content text default '',
  video_url text default '',
  position int default 0
);
create table questions (
  id bigint generated always as identity primary key,
  module_id bigint references modules(id) on delete set null,
  question text not null,
  options jsonb not null,
  answer int not null
);
create table progress (
  trainee_id bigint references trainees(id) on delete cascade,
  lesson_id bigint references lessons(id) on delete cascade,
  done_at timestamptz default now(),
  primary key (trainee_id, lesson_id)
);
create table attempts (
  id bigint generated always as identity primary key,
  trainee_id bigint references trainees(id) on delete cascade,
  score int,
  passed boolean,
  created_at timestamptz default now()
);
create table certificates (
  id text primary key,
  trainee_id bigint unique references trainees(id) on delete cascade,
  score int,
  revoked boolean default false,
  issued_at timestamptz default now()
);
create table settings (key text primary key, value jsonb);

-- Security: only the server (service_role key) can touch data. The public/anon key gets nothing.
alter table trainees enable row level security;
alter table modules enable row level security;
alter table lessons enable row level security;
alter table questions enable row level security;
alter table progress enable row level security;
alter table attempts enable row level security;
alter table certificates enable row level security;
alter table settings enable row level security;

-- Starter content (edit or delete later from the admin panel)
insert into modules (title, description, icon, position) values
 ('Communication Skills', 'Speak, listen and write clearly at work.', '🗣️', 1),
 ('Socio-Cultural Skills', 'Understand and respect local culture abroad.', '🌍', 2),
 ('Teamwork', 'Work well with colleagues and supervisors.', '🤝', 3),
 ('Leadership and Decision-Making', 'Take responsibility and decide under pressure.', '🧭', 4);

insert into lessons (module_id, title, content, position) values
 (1, 'Verbal communication', 'Speak slowly and clearly. Keep sentences short. Repeat the key point back to confirm you understood your supervisor.', 1),
 (1, 'Active listening', 'Look at the speaker, do not interrupt, and ask one question to confirm what you heard before you start the task.', 2),
 (2, 'Respecting local culture', 'Learn the greeting, dress code and prayer or break times of your workplace. Ask politely when you are not sure.', 1),
 (3, 'Being a reliable team member', 'Arrive on time, finish your part, and tell the team early if you need help or will be late.', 1),
 (4, 'Making decisions under pressure', 'Stay calm, list the options, pick the safest one, and inform your supervisor quickly.', 1);

insert into questions (module_id, question, options, answer) values
 (1, 'Your supervisor gives an instruction you did not fully understand. What should you do?', '["Guess and start working","Repeat it back and ask a question","Ask a colleague later","Ignore it"]', 1),
 (1, 'Which is part of active listening?', '["Interrupting often","Looking at your phone","Not interrupting and confirming what you heard","Finishing the speaker''s sentences"]', 2),
 (2, 'You are unsure about a local custom at work. Best action?', '["Do what you did at home","Ask politely","Copy nobody","Stay silent and avoid everyone"]', 1),
 (2, 'Showing respect for local culture helps you to:', '["Avoid misunderstandings","Earn less","Skip training","Change the rules"]', 0),
 (3, 'You will be late for your shift. What is best?', '["Say nothing","Inform the team early","Blame traffic later","Leave without telling"]', 1),
 (3, 'A good team member:', '["Finishes their part and helps when needed","Works only alone","Hides mistakes","Avoids meetings"]', 0),
 (4, 'In an emergency at work, first you should:', '["Panic","Stay calm and inform your supervisor","Run away","Wait for someone else"]', 1),
 (4, 'A good decision under pressure is usually:', '["The fastest, whatever the risk","The safest option after listing choices","Whatever a friend says","Postponed forever"]', 1);

insert into settings (key, value) values
 ('hero_title', '"Build the soft skills that get you hired abroad"'),
 ('hero_sub', '"Free online training for overseas job seekers. Learn at your own pace, pass the final test and download a certificate you can verify online."'),
 ('pass_percent', '60'),
 ('exam_questions', '10'),
 ('faqs', '[{"q":"Who can register?","a":"Anyone with a valid CNIC who plans to work abroad."},{"q":"How do I start my training?","a":"Create an account, log in and open the first lesson."},{"q":"When will I receive my certificate?","a":"Right after you finish all lessons and pass the final test."},{"q":"How can my certificate be verified?","a":"Enter the Certificate ID on the home page. Anyone can verify it."},{"q":"Is my progress saved automatically?","a":"Yes. Every completed lesson is saved to your account."}]');
