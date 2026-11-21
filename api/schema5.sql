-- Run ONCE in Supabase > SQL Editor (after schema.sql ... schema4.sql).
-- Fills both courses with real lessons and a 12-question test bank (the final test picks 10 at random).

-- 1) richer text for the 5 starter lessons
update lessons set content = 'Verbal communication means the words you say and how you say them. At work abroad, clear speech matters more than perfect grammar.

• Speak slowly and use short sentences.
• Say one idea at a time.
• Repeat the key point back to confirm: "So I should finish this by 3 pm, correct?"
• If you do not understand, say: "Sorry, could you repeat that please?"

Practice: explain your daily job to a friend in three short sentences.' where title = 'Verbal communication';
update lessons set content = 'Active listening means giving the speaker your full attention and showing that you understood.

• Look at the person and put your phone away.
• Do not interrupt. Wait until they finish.
• Nod or say "yes, I see" so they know you are following.
• Repeat the instruction in your own words before you start.
• Ask one question if something is unclear.

Good listening prevents mistakes, saves time and builds your supervisor''s trust.' where title = 'Active listening';
update lessons set content = 'Every country has its own customs. Learning them early shows respect and avoids trouble.

• Learn the local greeting and how to address seniors.
• Follow the dress code of your workplace and public places.
• Respect prayer times, fasting periods and public holidays.
• Ask politely when you are not sure: "Is it okay if I...?"
• Never joke about religion, family or local leaders.

You do not have to give up your own culture. You only need to respect the place where you work.' where title = 'Respecting local culture';
update lessons set content = 'A reliable team member is someone others can count on.

• Arrive on time and ready to work.
• Finish your part of the task completely.
• Tell the team early if you will be late or need help.
• Keep your word. If you say you will do it, do it.
• Admit mistakes quickly and help fix them.

Reliability is the first thing supervisors look for when they choose people for better jobs.' where title = 'Being a reliable team member';
update lessons set content = 'Pressure comes from time limits, mistakes or emergencies. A calm decision is almost always a better decision.

• Stop and breathe for a few seconds.
• Ask: what is the problem and what is most urgent?
• List two or three options.
• Choose the safest option and tell your supervisor quickly.
• Afterwards, think about what you can learn.

In an emergency, the safety of people always comes before work or equipment.' where title = 'Making decisions under pressure';

-- 2) new lessons for course 1 (Soft Skills Essentials)
insert into lessons (module_id, title, content, position) values
((select id from modules where title = 'Communication Skills' limit 1), 'Non-verbal communication', 'Your body speaks before your words do. Employers abroad notice how you stand, look and smile.

• Eye contact: look at the person briefly and politely. In some cultures long staring is rude, so watch how local people do it.
• Posture: stand straight and keep your hands visible.
• Smile and greet people when you arrive.
• Personal space: keep about one arm length distance when talking.
• Avoid pointing with your finger or showing the sole of your shoe.

When your words and body language match, people trust you more.', 3),
((select id from modules where title = 'Communication Skills' limit 1), 'Writing clear messages', 'Many jobs use messages, notes and emails. Keep them short and polite.

• Start with a greeting: "Hello Mr. Ahmed,"
• State the point in the first line: "I will be 15 minutes late today."
• Give the reason in one sentence.
• End politely: "Thank you."
• Check spelling and numbers before sending.

Example: "Hello Sir, I finished the loading in Block B. I need two more boxes of gloves. Thank you."', 4),
((select id from modules where title = 'Socio-Cultural Skills' limit 1), 'Greetings and etiquette', 'A good first meeting opens many doors.

• Greet with a smile and a short phrase in the local language if you can.
• Shake hands only if the other person offers their hand first.
• Use titles such as Mr., Mrs., Sir or Madam until told otherwise.
• Say please, thank you and excuse me often.
• Arrive on time. Being late is seen as disrespect in most countries.

Practice your greeting out loud until it feels natural.', 2),
((select id from modules where title = 'Socio-Cultural Skills' limit 1), 'Working with people from different backgrounds', 'Your colleagues may come from many countries and speak many languages.

• Do not make fun of accents or customs.
• Use simple words and speak a little slower.
• Ask questions instead of making guesses about people.
• Share tools and help freely.
• If you are treated unfairly, report it politely and with facts to your supervisor or agency.

A respectful worker is welcomed in every team.', 3),
((select id from modules where title = 'Teamwork' limit 1), 'Handling disagreements', 'Disagreements happen in every team. What matters is how you handle them.

• Stay calm. Do not raise your voice.
• Listen to the other side fully before you answer.
• Talk about the problem, not about the person.
• Use polite words: "I see it a little differently, may I explain?"
• If you cannot agree, ask the supervisor to decide and accept the decision.

Never argue in front of customers or in a crowd.', 2),
((select id from modules where title = 'Teamwork' limit 1), 'Asking for and giving help', 'No one knows everything. Asking for help early saves time and prevents accidents.

• Ask clearly: "Could you please show me how to use this machine?"
• Say thank you and, if possible, show them the result.
• Offer help when you see a colleague struggling.
• Never touch equipment you are not trained to use.
• Write down new steps so you do not need to ask twice.

Teams grow stronger when people help each other.', 3),
((select id from modules where title = 'Leadership and Decision-Making' limit 1), 'Taking responsibility', 'Taking responsibility means owning your actions, good or bad.

• Do your duty without waiting to be reminded.
• If you make a mistake, say it honestly and explain how you will fix it.
• Do not blame others or make excuses.
• Learn from feedback and thank the person who gave it.
• Look after company property as if it were your own.

Supervisors promote people who are honest and responsible.', 2),
((select id from modules where title = 'Leadership and Decision-Making' limit 1), 'Planning your day', 'Good planning helps you finish work and stay calm.

• Write down your tasks the night before.
• Put the most important or urgent task first.
• Keep your tools and documents ready.
• Allow extra time for travel and delays.
• Rest well. A tired worker makes more mistakes.

Check your list at the end of the day and move unfinished tasks to tomorrow.', 3);

-- 3) course 2 (Workplace English and Etiquette): more lessons + a second module
insert into modules (title, description, icon, position, course_id)
select 'Workplace Etiquette', 'Manners, punctuality and good service.', '🤝', 2, id from courses where title = 'Workplace English and Etiquette';

insert into lessons (module_id, title, content, position) values
((select id from modules where title = 'English for the workplace' limit 1), 'Understanding instructions', 'Instructions are short and fast at work. Learn the common words.

• "Please bring..." = take it here.
• "Put it over there" = place it at that spot.
• "Be careful" = there is danger or risk.
• "Stop" = do not continue.
• "Finish by 5 pm" = complete it before 5 pm.

If you do not understand, say: "Sorry, could you say that again more slowly?"', 2),
((select id from modules where title = 'English for the workplace' limit 1), 'Safety words you must know', 'Know these words before your first day.

• Danger, Warning, Caution
• Exit, Fire exit, Emergency
• Helmet, Gloves, Safety shoes, Mask
• First aid, Ambulance, Hospital

Read every sign. When you hear "Stop" or "Emergency", stop at once and follow your supervisor.', 3),
((select id from modules where title = 'English for the workplace' limit 1), 'Asking politely', 'Polite English is simple.

• Could you please help me?
• May I take a break?
• Excuse me, where is the supervisor?
• Thank you very much.
• I am sorry, I did not understand.

Use "could" and "may" for requests. Add "please" and "thank you".', 4),
((select id from modules where title = 'Workplace Etiquette' limit 1), 'Punctuality and appearance', 'Being on time and neat shows respect.

• Reach the site 10 minutes early.
• Wear clean clothes and the required uniform.
• Keep your hair, nails and hands clean.
• Carry your ID card and documents.
• If you will be late, inform your supervisor before the shift starts.', 1),
((select id from modules where title = 'Workplace Etiquette' limit 1), 'Using your phone and messages at work', 'Your phone can help or harm your job.

• Keep it on silent during work.
• Use it only for work calls or emergencies in work time.
• Do not take photos of people or sites without permission.
• Reply to supervisor messages quickly and politely.
• Do not share company information on social media.', 2),
((select id from modules where title = 'Workplace Etiquette' limit 1), 'Talking to customers and colleagues', 'Good service builds a good name.

• Greet with a smile: "Good morning, how can I help you?"
• Listen first, then answer.
• Stay calm even if the customer is angry.
• If you cannot help, say: "Let me ask my supervisor."
• Thank them at the end.', 3);

-- 4) test bank: course 1 now has 12 questions, course 2 has 12 (each final test asks 10)
insert into questions (module_id, question, options, answer) values
((select id from modules where title = 'Communication Skills' limit 1), 'What is the best way to be sure you understood an instruction?', '["Nod and walk away","Repeat it back in your own words","Ask someone else later","Wait and see"]', 1),
((select id from modules where title = 'Communication Skills' limit 1), 'Which body language shows respect and attention?', '["Looking at your phone","Standing straight and listening","Turning away","Pointing at the person"]', 1),
((select id from modules where title = 'Teamwork' limit 1), 'A colleague disagrees with you. What should you do first?', '["Raise your voice","Listen fully and stay calm","Leave the room","Tell the customers"]', 1),
((select id from modules where title = 'Leadership and Decision-Making' limit 1), 'What should you do right after making a mistake?', '["Hide it","Blame a colleague","Admit it honestly and explain the fix","Ignore it"]', 2),
((select id from modules where title = 'English for the workplace' limit 1), 'What does the word "Danger" on a sign mean?', '["Free entrance","There is a risk of harm","Lunch time","Exit this way"]', 1),
((select id from modules where title = 'English for the workplace' limit 1), 'Which sentence is the most polite request?', '["Give me that","Could you please pass me that?","Hurry up","Do it now"]', 1),
((select id from modules where title = 'English for the workplace' limit 1), 'You did not understand your supervisor. What do you say?', '["Nothing","Sorry, could you say that again more slowly?","Yes yes","I do not care"]', 1),
((select id from modules where title = 'English for the workplace' limit 1), 'Which item is protective equipment?', '["Helmet","Notebook","Cup","Radio"]', 0),
((select id from modules where title = 'English for the workplace' limit 1), 'What does "Exit" mean?', '["The way out","Stop work","Start work","Dangerous area"]', 0),
((select id from modules where title = 'Workplace Etiquette' limit 1), 'How early should you reach your site?', '["10 minutes early","10 minutes late","At the end of the shift","Whenever possible"]', 0),
((select id from modules where title = 'Workplace Etiquette' limit 1), 'You will be late for work. What is the best action?', '["Say nothing","Inform your supervisor before the shift starts","Send a friend tomorrow","Skip work"]', 1),
((select id from modules where title = 'Workplace Etiquette' limit 1), 'What is the right use of your phone during work?', '["Social media","Silent mode, only for work calls or emergencies","Loud music","Taking photos of everyone"]', 1),
((select id from modules where title = 'Workplace Etiquette' limit 1), 'An angry customer talks to you. What should you do?', '["Shout back","Stay calm and listen first","Walk away","Laugh"]', 1),
((select id from modules where title = 'Workplace Etiquette' limit 1), 'If you cannot help a customer, you should say:', '["Not my job","Let me ask my supervisor","Go away","Come tomorrow"]', 1);
