---
name: roadmap-item
description: Implemente un ou plusieurs items numerotes de l'artefact roadmap "1000 ameliorations" (dashboard docs/, worker/, bot src/) puis verifie, commit, push, deploie, poll et met a jour l'artefact + la memoire projet. A utiliser quand l'utilisateur demande d'implementer/continuer des items de roadmap (numeros ou plage de numeros).
argument-hint: [numeros ou plage d'items, ex. "425,427,430" ou "500-520"]
---

Tu es invoque comme `/roadmap-item` avec en argument un ou plusieurs numeros d'items de la roadmap "1000 ameliorations — Site & Bot" (P1=111-210, P2=211-710, P3=711-1110). Si aucun argument n'est donne, reprends la liste des prochains items non faits deja identifies dans la conversation (TodoWrite ou artefact roadmap).

Execute cette boucle, sans t'arreter entre les etapes sauf si genuinement bloque :

## 1. Implementer
Pour chaque item : localise le fichier concerne (dashboard `docs/assets/*.js`, `docs/assets/style.css`, worker `worker/src/*.js`, bot `src/**/*.js`), implemente le changement minimal correspondant a la description de l'item. Reste dans les patterns deja etablis du repo (voir memoire projet : sectionHtml/quickJumpBarHtml pour nouvelles sections dashboard, undoableDelete pour suppressions, tampon+flush periodique pour toute ecriture KV frequente — le quota KV gratuit est de ~1000 put()/jour).

## 2. Verifier
- `node --check` sur CHAQUE fichier .js touche (bot et worker), en un seul appel shell groupe.
- Si un fichier dans `worker/` a change : lance `npm test` depuis `worker/` (suite miniflare, `node --test test/routes.test.js`).
- Si `docs/assets/*.js` ou `.css` a change : bump le(s) `?v=N` correspondant dans `docs/app.html`.

## 3. Commit
`git add` explicitement les fichiers touches (jamais `.claude/` ni `.vscode/` sauf demande explicite). Message en francais SANS accents, plusieurs lignes si plusieurs items, referencant chaque numero d'item (ex. `n°425`). Jamais de credit Claude dans le message sauf si l'utilisateur le demande — suis le format deja utilise dans `git log` de ce repo.

## 4. Push
`git push` vers la branche courante.

## 5. Deployer
- Si un fichier dans `worker/` a change : `npx wrangler deploy` depuis `worker/`.
- Si `src/discord/commandDefinitions.js` a change : `node scripts/deployCommands.js 1526242972989915307`.
- Si seulement `docs/` a change : rien a deployer manuellement (GitHub Pages se met a jour seul sur push), mais il faut quand meme poller (etape 6).
- Si `src/` (bot) a change hors commandDefinitions : Render redeploie automatiquement sur push vers master, poller son `/health` ou `/` (etape 6).

## 6. Poller la mise en prod
- Dashboard : `curl` en boucle sur `https://yolscript.github.io/DiscordServeurCreator/app.html` (ou l'URL Pages confirmee dans la memoire projet) jusqu'a voir la nouvelle chaine `app.js?v=N`.
- Bot : `curl https://discordserveurcreator.onrender.com/` en boucle jusqu'a ce que le champ `version` du JSON corresponde au SHA du commit qui vient d'etre pousse.
- Utilise un interval raisonnable entre chaque poll (quelques secondes), pas de boucle serree.

## 7. Mettre a jour l'artefact roadmap + la memoire
- Marque les items comme faits dans l'artefact roadmap (le fichier source le plus recent dans le scratchpad, ex. `roadmap-1000-v4.html` ou plus recent — verifie le nom exact avant d'ecrire) et republie-le via l'outil Artifact.
- Si l'artefact a ete perdu par la plateforme (erreur "deleted or no longer have write access") : copie le HTML vers un NOUVEAU chemin (v4->v5 etc.) et republie frais, ne jamais reessayer le meme file_path mort.
- Si une decouverte non evidente a eu lieu (bug, contrainte d'architecture, decision de scoping) : ajoute une note dense a la memoire projet pertinente (fichiers dans le repertoire memoire), sinon ne cree pas de memoire pour un item routinier.

## Regles
- Ne demande pas confirmation entre les etapes 1-7 pour un item deja explicitement demande par l'utilisateur — enchaine.
- Si un item de roadmap chevauche trop un item deja livre, ou si l'enonce litteral impliquerait un risque disproportionne (ex. toucher un systeme complexe existant comme le drag-and-drop), scope a la baisse vers une implementation plus sure et dis-le en une phrase dans le recap, plutot que de forcer l'implementation risquee.
- Termine par un recap court en francais : items faits, lien artefact a jour, nombre total d'items completes.
