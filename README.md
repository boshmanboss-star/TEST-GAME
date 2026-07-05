PortesDuDestin - MVP (faux argent) - Instructions

Ce dépôt contient un MVP pour "Portes du Destin" en mode faux argent (English/Français).
Architecture : frontend React (3000) + backend Express (4000) + SQLite (MVP).

Prérequis :
- Docker et docker-compose installés

Exécution locale :
1. Cloner le projet et se placer à la racine.
2. Copier `.env.example` en `.env` et ajuster si nécessaire.
3. Lancer :
   docker-compose up --build

- Frontend : http://localhost:3000
- Backend API : http://localhost:4000

Endpoints importants :
- GET  /api/config         -> config du jeu (ce que voit le joueur)
- POST /api/play           -> effectuer un tour (body: { playerId, clientSeed })
- POST /api/pf/create      -> créer une session provably-fair (protégé admin)
- POST /api/pf/reveal      -> révéler server_seed pour vérification (protégé admin)
- POST /api/auth/signup    -> créer joueur (faux wallet)
- POST /api/auth/login     -> login joueur
- GET  /api/player/:id     -> récupérer joueur

Notes :
- Mode faux argent : wallet interne crédité pour les tests.
- Provably fair : serveur publie hash(server_seed) avant sessions, et révèle server_seed pour vérification.
- Base de données : SQLite (fichier `backend/data/db.sqlite`).
- Pour production : remplacer SQLite par PostgreSQL, activer HTTPS, audits RNG externes, sauvegardes.
