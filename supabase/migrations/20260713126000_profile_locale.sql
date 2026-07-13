-- Persist the user's UI locale so asynchronous push copy matches the language
-- they selected on web or mobile.
alter table public.profiles
  add column locale text not null default 'en'
  check (locale in ('en', 'tr', 'es', 'fr', 'ar', 'hi', 'zh'));
