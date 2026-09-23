-- Add a second Culture Partnership soft-skills option (Digital Communication), alongside the
-- existing Communication Course. Bump soft_other's sort so the "other" catch-all stays last.
update public.activities set sort = 13 where key = 'soft_other';
insert into public.activities (key, category, credits, kind, is_other, keywords, sort) values
  ('culture_digital_comm', 'soft', 10, 'certificate', false,
   '{"digital communication","culture partnership",culturepartnership,digital}', 12);
