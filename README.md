# Carte des lavages auto

Carte indépendante de 1 137 stations en France, avec recherche, favoris, géolocalisation et itinéraire.

## Méthodes de lavage

- Sans contact automatique : 46 stations avec programme sans brosses documenté.
- Rouleaux automatique : 797 stations.
- Haute pression manuelle : 322 stations, avec lance utilisée soi-même.
- Lavage à la main : detailing professionnel uniquement, avec preuve explicite (`detailing_verified` et `detailing_source`). Aucun centre de la base actuelle ne possède encore cette vérification.
- Type à confirmer : 231 stations dont les services ne permettent pas de classer le lavage extérieur.

Comptage au 30 septembre 2026. Une station peut proposer plusieurs méthodes : ces nombres ne s’additionnent pas. Total Wash est une enseigne ; ses 1 084 centres sont répartis dans les méthodes selon les services de leur localisateur officiel.

## Données

`stations.json` conserve la base sans contact automatique. `stations-autres.json` ajoute les centres documentés individuellement. `stations-totalwash.json` contient l’import officiel du 29 septembre 2026. Voir les fichiers `SOURCES*.md` pour les preuves et limites. Les compléments OpenStreetMap sont communautaires.

## Publication

GitHub Pages : https://cleementt26.github.io/carte-lavages-auto/

Application statique : servir ce dossier en HTTP pour le développement, par exemple `python3 -m http.server 8080`. Aucun secret ni backend requis. Les services tiers de cartographie et d’itinéraire peuvent être temporairement indisponibles.
