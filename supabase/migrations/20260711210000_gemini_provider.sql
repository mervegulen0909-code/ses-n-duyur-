-- Allow 'gemini' as a scoring-provider provenance value. Provider order is
-- now OpenAI -> Gemini -> mock (Anthropic retired from the default order for
-- cost — the column keeps accepting it so historical rows stay valid).

alter table public.scores drop constraint if exists scores_ai_provider_check;
alter table public.scores add constraint scores_ai_provider_check
  check (ai_provider in ('anthropic', 'openai', 'gemini', 'mock'));
