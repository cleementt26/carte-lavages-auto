# Wash 2.0 — sources de la couche « Autres lavages »

Mise à jour : 29 septembre 2026.

Cette couche est volontairement séparée de `stations.json`, qui reste la base stricte des programmes automatiques sans contact documentés.

## Deux niveaux de données

1. `stations-autres.json` contient quelques stations vérifiées manuellement (rouleaux, haute pression ou hybrides) avec un type de lavage documenté.
2. Wash 2.0 peut charger autour de la carte des objets OpenStreetMap `amenity=car_wash` ainsi que les stations-service `amenity=fuel + car_wash=yes`. Ces données sont communautaires : le site reprend le type uniquement lorsque les tags OSM le renseignent (`self_service`, `automated`, `high_pressure_washer`, `touchless_wash`). Sinon, la technologie est affichée comme non renseignée.

Une station issue d’OpenStreetMap n’est **jamais** promue automatiquement dans la base « sans contact vérifié ». La base stricte conserve ses propres preuves.

## Stations documentées dans `stations-autres.json`

- Aqua Factory Annecy — https://aquafactory.fr/nos-centres/aqua-factory-annecy/
- Aqua Factory Sévrier — https://aquafactory.fr/nos-centres/aqua-factory-sevrier/
- Lavage du Marais, Pringy — https://www.google.com/maps?cid=7719916174820893604
- Lavage New Wave, Cluses — https://lavage-auto-proximite.fr/haute-savoie/cluses/station-de-lavage-rue-de-la-pointe-de-cupoire-80716
- Lavage des Fontaines Marnaz — https://fr.linkedin.com/company/lavage-des-fontaines
- MSLB Entreprise Lavage Auto, Saint-Jeoire-Prieuré — https://www.station-lavage-saint-jeoire-prieure.fr/lavage-automobile/
- Station de Lavage Caen Louvigny — https://www.station-lavage-caen-louvigny.fr/

## OpenStreetMap

Référence de balisage : https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dcar_wash

Les stations dynamiques proviennent de l’API Overpass et restent attribuées à OpenStreetMap. La présence d’un tag ne garantit pas l’état de fonctionnement du matériel le jour de la visite.
