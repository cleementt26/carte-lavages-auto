# Stations du réseau Wash TotalEnergies

Import du 29 septembre 2026 : **1 084 centres** en France métropolitaine référencés par le localisateur officiel.

## Sources et couverture

- Localisateur : https://wash-totalenergies.fr/centre-de-lavage/
- Données publiques du localisateur : https://wash-totalenergies.fr/wp-json/skp/v1/finder/points
- Plans de site : https://wash-totalenergies.fr/skpfinderpoint-sitemap.xml et https://wash-totalenergies.fr/skpfinderpoint-sitemap2.xml

Collecte par zones géographiques dans les limites de l’API (rayon et nombre de résultats de 200 maximum). Les zones atteignant 200 résultats ont été subdivisées jusqu’à obtenir des réponses non tronquées. Les identifiants officiels servent à dédupliquer les résultats des zones qui se recouvrent.

Contrôle de couverture : les **1 078 fiches de station uniques** présentes dans les deux plans de site sont toutes représentées, plus **6 centres distincts à La Défense** dont le localisateur renvoie à une page départementale commune des Hauts-de-Seine. Les pages de département figurant dans les plans de site sont exclues du décompte des fiches individuelles.

## Champs et limites

Chaque entrée conserve le nom, l’adresse, les coordonnées, les services et le lien source fournis par la source officielle. Les identifiants de l’application sont stables : 1 000 000 + identifiant officiel. Aucun compte client, donnée privée ou clé d’API n’est nécessaire ni conservé.

Les 1 084 centres étaient marqués actifs par le localisateur à la collecte. Le statut horaire « ouvert/fermé » n’est pas figé dans la carte : consulter la fiche officielle avant le déplacement. Les horaires et la disponibilité peuvent changer.

Depuis le 30 septembre 2026, les centres sont répartis par services documentés : **Rouleaux**, **Haute pression manuelle**, **Lavage à la main** ou **Type à confirmer**. Total Wash reste une enseigne, sans filtre de catégorie dédié. Aucun centre n’est automatiquement classé en **Sans contact automatique**. Une piste haute pression manuelle ne constitue pas une preuve de portique automatique sans brosses. Les services non renseignés ne sont pas inventés. Les prestations sont conservées telles que déclarées par le réseau, y compris le lavage à la main et les services intérieurs.

Il s’agit d’un instantané du localisateur officiel, pas d’une garantie que tous les établissements physiques du réseau y sont correctement recensés. Le chargement de ce fichier est indépendant d’Overpass/OpenStreetMap.
