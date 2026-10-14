# 03 — Technical and Ethical Design

**Speaker:** Presenter 3  
**Target time:** ~1.5–2 minutes

## Technical architecture (exact sentences)

"The frontend is built with Vue, TypeScript, and Vite."  
"Authentication and request handling go through Supabase, including an Edge Function."  
"The Edge Function calls the Groq provider and returns response plus token usage."  
"The database stores private metadata, quests, and badge progress under authenticated access controls."  
"The project is deployed on GitHub Pages for the frontend."

## Ethical design (exact sentences)

"A key point is that EcoPrompt does not measure exact provider emissions."  
"It reports provider token usage and calculates a modelled low, central, and high operational carbon range using assumptions."  
"We show a range because uncertainty is real and should be communicated honestly."  
"Users keep autonomy: recommendations are advisory, and users can reject them."  
"Prompt storage is opt-in, not automatic."  
"Secrets stay server-side, and privacy is protected through authenticated, private data access."

## Slide cues

- Show architecture flow slide: frontend → Supabase auth/Edge Function → Groq → usage + modelled range.
- Show ethics slide: uncertainty range, autonomy, opt-in storage, server-side secrets, privacy.
