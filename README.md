# Carte des lavages auto

Carte indépendante de 1 125 stations affichées en France (1 137 fiches conservées), avec recherche, favoris, géolocalisation et itinéraire.

## Méthodes de lavage

- Sans contact automatique : 46 stations avec programme sans brosses documenté.
- Rouleaux automatique : 973 stations.
- Haute pression manuelle : 386 stations, avec lance utilisée soi-même.
- Detailing professionnel : 30 centres dont les programmes décrivent le lustrage manuel et/ou le traitement des micro-rayures.

Les 12 fiches sans méthode suffisamment documentée sont conservées dans les données mais ne sont affichées ni sur la carte, ni dans les résultats ou compteurs. Aucune catégorie « À confirmer » n’est proposée.

Comptage au 30 septembre 2026. Une station peut proposer plusieurs méthodes : ces nombres ne s’additionnent pas. Total Wash est une enseigne ; ses 1 084 centres sont répartis dans les méthodes selon les équipements et programmes de leurs localisateurs officiels.

## Données

`stations.json` conserve la base sans contact automatique. `stations-autres.json` ajoute les centres documentés individuellement. `stations-totalwash.json` contient l’import officiel du 29 septembre 2026. Voir les fichiers `SOURCES*.md` pour les preuves et limites. Les compléments OpenStreetMap sont communautaires.

## Publication

GitHub Pages : https://cleementt26.github.io/carte-lavages-auto/

Application statique : servir ce dossier en HTTP pour le développement, par exemple `python3 -m http.server 8080`. Aucun secret ni backend requis. Les services tiers de cartographie et d’itinéraire peuvent être temporairement indisponibles.

## Recherche complémentaire du 30 septembre 2026

Les 231 fiches auparavant non classées ont été relues individuellement. Recoupement avec le répertoire public du localisateur TotalEnergies : correspondances par nom, adresse et coordonnées, avec revue des cas ambigus. 219 fiches reclassées, 12 masquées. Les codes ROLLOVER et JET_WASH désignent respectivement les rouleaux et la haute pression. Le detailing exige un programme manuel décrivant une finition précise ; un simple code MANUAL ne suffit pas. Les équipements référencés ne garantissent pas la disponibilité des programmes au moment du déplacement. Les fermetures signalées lors de la vérification sont mentionnées dans les fiches.

Voir `RECLASSEMENT-20260930.json` pour les sources et la décision de chaque fiche. Les compléments OpenStreetMap sans méthode explicite sont également masqués.
