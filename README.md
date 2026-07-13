# Discord Serveur Creator

Bot Discord qui configure automatiquement un serveur (salons, roles, permissions,
regles, roles de jeu auto-detectes, salon vocal staff dynamique) a partir d'un
template ("Stream communautaire" ou "Multigaming"), plus un dashboard web pour
tout administrer ensuite.

## Pourquoi cette architecture

Discord a supprime le 28 juillet 2025 la possibilite pour un bot de creer un
nouveau serveur (`POST /guilds`). Le bot ne peut donc pas "creer un Discord"
de zero : il faut l'inviter classiquement sur un serveur (typiquement un
serveur vide que tu viens de creer toi-meme), puis lancer `/setup` dessus.

Le projet est en trois parties :

- **`src/`** — le bot (Node.js + discord.js). Tourne en continu (chez toi ou
  sur un petit serveur), gere le temps reel : `/setup`, reglement, +16/-16,
  roles de jeu auto, salon vocal staff dynamique, bienvenue/depart.
- **`worker/`** — un Worker Cloudflare qui sert d'API pour le dashboard :
  login OAuth2 Discord, edition en masse des permissions, export/import,
  ajout de salons pregeneres, edition des textes. Appelle l'API Discord
  directement avec le token du bot (pas besoin que le process local soit
  joignable depuis l'exterieur).
- **`docs/`** — le dashboard, un site 100% statique (HTML/CSS/JS, sans build)
  a heberger sur GitHub Pages.

Le bot et le Worker partagent **le meme namespace Cloudflare KV** comme source
unique de verite (config par serveur, roles de jeu, pseudos par jeu) : le bot
y accede via l'API REST Cloudflare, le Worker via son binding natif.

## 1. Discord Developer Portal

1. Sur https://discord.com/developers/applications, recupere (deja fait si tu
   as suivi la mise en place initiale) : **Application ID**, **Token** (onglet
   Bot).
2. Onglet **Bot** : active **Server Members Intent** et **Presence Intent**
   (necessaires pour les roles de jeu auto et la detection du staff en ligne).
   Laisse **Message Content Intent** desactive (inutile ici).
3. Onglet **OAuth2 → General** : recupere le **Client Secret**, ajoute une
   **Redirect** correspondant a `OAUTH_REDIRECT_URI` du Worker (ex:
   `https://ton-worker.ton-compte.workers.dev/auth/callback`).
4. Pour inviter le bot sur un serveur : utilise le lien genere automatiquement
   par le dashboard ("Inviter le bot"), ou construis-le a la main :
   `https://discord.com/oauth2/authorize?client_id=TON_CLIENT_ID&permissions=8&scope=bot%20applications.commands`
   Une fois invite, va dans **Parametres du serveur > Roles** et verifie que
   le role du bot est place assez haut (au moins au-dessus de la dizaine de
   roles standards) — sinon `/setup` refusera de demarrer et te le dira.

## 2. Bot local (`src/`)

```
npm install
cp .env.example .env
```

Remplis `.env` :
- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` (Developer Portal)
- `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `CF_API_TOKEN` (voir section Cloudflare ci-dessous)

Deploie la commande `/setup` (guild-scope = instantane pour tester, sinon
global = ~1h de propagation) :

```
node scripts/deployCommands.js TON_GUILD_ID_DE_TEST
node scripts/deployCommands.js            # global, pour la prod
```

Lance le bot :

```
npm start
```

## 3. Cloudflare (KV + Worker)

```
npm install -g wrangler   # si pas deja installe
wrangler login
wrangler kv namespace create GUILD_KV
```

Note l'`id` retourne : c'est ton `CF_KV_NAMESPACE_ID` (a mettre dans le `.env`
du bot ET dans `worker/wrangler.toml`).

Pour `CF_API_TOKEN` (utilise par le bot pour lire/ecrire le KV via API REST) :
https://dash.cloudflare.com/profile/api-tokens → **Create Token** → template
"Edit Cloudflare Workers" ou un token custom avec la permission
**Account > Workers KV Storage > Edit**. `CF_ACCOUNT_ID` est visible sur la
page d'accueil de ton dashboard Cloudflare (colonne de droite).

Dans `worker/wrangler.toml`, remplace :
- `id` du binding `GUILD_KV` par le namespace cree ci-dessus
- `DISCORD_CLIENT_ID`
- `OAUTH_REDIRECT_URI` (l'URL de ton Worker + `/auth/callback`)
- `FRONTEND_ORIGIN` (l'URL de ton site GitHub Pages, ex: `https://tonpseudo.github.io`)

Puis les secrets (jamais dans `wrangler.toml`) :

```
cd worker
npm install
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_CLIENT_SECRET
wrangler deploy
```

Note l'URL du Worker affichee a la fin du deploiement (`https://....workers.dev`).

## 4. Dashboard (GitHub Pages)

1. Edite `docs/assets/config.js` et mets l'URL de ton Worker :
   `window.API_BASE_URL = 'https://ton-worker.ton-compte.workers.dev';`
2. Sur GitHub : **Settings > Pages** → Source = `main` branch, dossier `/docs`.
3. Une fois publie, ton dashboard est sur `https://tonpseudo.github.io/ton-repo/`.
   Mets a jour `FRONTEND_ORIGIN` dans `worker/wrangler.toml` avec cette URL
   exacte (sans slash final) et redeploie le Worker (`wrangler deploy`).

## Utilisation

1. Cree un serveur Discord vide, invite le bot dessus.
2. Dans Discord, tape `/setup template:Stream communautaire` (ou Multigaming).
3. Va sur ton dashboard, connecte-toi avec Discord : le serveur apparait
   "Configure", tu peux editer les textes, gerer les roles de jeu, faire de
   l'edition de permissions en masse, ajouter des salons pregeneres.

## Limitations connues

- Un bot ne peut pas etre proprietaire d'un serveur ni en creer un nouveau
  (retire de l'API Discord depuis juillet 2025) — `/setup` s'applique donc a
  un serveur ou le bot a ete invite normalement.
- Toute action de gestion de roles par le bot reste bornee par la position
  de son propre role dans la hierarchie du serveur (regle Discord, meme avec
  la permission Administrateur).
