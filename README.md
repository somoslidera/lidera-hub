# Hub · by Lidera

Base de conhecimento da Lidera (substitui o Notion). App de arquivo único (`index.html`), montado por `python3 build.py`.

- Páginas e bases: Supabase (projeto do Flow), tabelas `hub_*` (`hub-schema.sql`).
- Arquivos: Google Drive da conta conectada, pasta **Lidera Hub** (Edge Function `supabase/functions/hub-drive`).
- Fontes em `src/` (`hub.html`, `hub.css`, `js/*.js`) → `build.py` → `dist/index.html` → copiar para `index.html` na raiz (GitHub Pages).
