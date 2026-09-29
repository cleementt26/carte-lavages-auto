# Wash 2.0 — refonte du site

Cette version repart du dépôt `cleementt26/lavage-sans-contact-france` et conserve la base stricte `stations.json`. Elle ajoute une seconde couche clairement séparée pour les autres stations de lavage.

## Deux niveaux de données

1. **Sans contact** — les stations déjà documentées dans `stations.json`. Elles restent la couche affichée par défaut.
2. **Autres** — deux sources complémentaires :
   - `stations-autres.json` : stations ajoutées manuellement avec une source publique et un type de lavage documenté ;
   - OpenStreetMap : les objets `amenity=car_wash` et stations-service `amenity=fuel + car_wash=yes` chargés à la demande autour de la zone affichée via Overpass. Ils restent marqués comme données communautaires et ne sont jamais promus automatiquement en « sans contact vérifié ».

## Fonctions

- carte Leaflet / OpenStreetMap ;
- géolocalisation ;
- recherche par nom, ville, adresse, code postal et type ;
- filtres **Sans contact / Autres / Toutes / Position précise / Favoris** ;
- chargement progressif des autres stations OpenStreetMap quand on zoome ou se localise ;
- distinction visuelle entre sans-contact vérifié, autre station documentée et station communautaire OSM ;
- favoris locaux ;
- tri par pertinence, distance ou nom ;
- itinéraire OSRM et filtre autour du tracé ;
- liens Google Maps, Waze et Apple Plans ;
- fiche station avec technologie connue, niveau de précision et source.

## Fichiers de la refonte

À remplacer :

- `index.html`
- `styles.css`
- `app.js`

À ajouter :

- `stations-autres.json`
- `SOURCES-AUTRES.md`

À conserver :

- `stations.json`
- `SOURCES.md`
- `RECHERCHE-REGIONALE.md`
- `stations-a-verifier.json`
- `.nojekyll`

## Services externes

- OpenStreetMap : fond de carte et données communautaires de stations ;
- Overpass API : chargement des objets `amenity=car_wash` et stations-service `amenity=fuel + car_wash=yes` autour de la zone visible ;
- GeoPF : suggestions de communes ;
- Nominatim : repli de géocodage ;
- OSRM : calcul des itinéraires.

Les données Overpass sont chargées par zone et mises en cache pendant la session afin d’éviter des requêtes répétitives. À l’échelle nationale, le site n’essaie volontairement pas de télécharger toutes les stations d’un coup.

## Test local

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.
