# `lib/validations`

Schémas de validation des entrées (formulaires, Server Actions, Route Handlers).

Convention : **un fichier par domaine** (ex. `auth.ts`, `profile.ts`), exportant des schémas
réutilisés côté serveur (validation des Server Actions) et côté client (validation de formulaire).

`zod` est conseillé mais pas encore installé — `npm i zod` quand le premier schéma arrive.