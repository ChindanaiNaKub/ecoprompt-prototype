# EcoPrompt deployment setup

1. Create a Supabase project, then run the migration in `supabase/migrations/`.
2. Enable Email magic-link authentication. Add `http://localhost:5173` and the GitHub Pages URL to Supabase Auth redirect URLs.
3. Add `GROQ_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as Edge Function secrets. Never add either to a Vite environment file.
4. In Groq Data Controls, enable Zero Data Retention. Do not enable batch or fine-tuning features for this project.
5. Deploy `execute-prompt`, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the GitHub Pages build environment.

The frontend can run without these public variables as a clearly labeled local demonstration. Live requests require a signed-in user and deployed function.
