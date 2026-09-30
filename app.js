/* global L */
const FRANCE_CENTER = [46.603354, 1.888334];
const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView(FRANCE_CENTER, 6);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  stations: [],
  visibleStations: [],
  markers: new Map(),
  userPosition: null,
  userMarker: null,
  route: null,
  routeLine: null,
  routeCasing: null,
  selectedStationId: null,
  locating: false,
  quickFilter: 'all',
  searchQuery: '',
  sort: 'smart',
  favorites: loadFavorites(),
  osmKeys: new Set(),
  osmFetchKeys: new Set(),
  osmLoading: false
};

const stationList = $('#stationList');
const count = $('#stationCount');
const routeFilter = $('#routeFilter');
const distanceRange = $('#distanceRange');
const routeSummary = $('#routeSummary');
const statusBox = $('#mapStatus');
const selectionCard = $('#selectionCard');
const citySuggestionCache = new Map();

const WASH_TYPES = {
  contactless: { label: 'Sans contact automatique', color: '#0878ef' },
  rollers: { label: 'Rouleaux', color: '#b86b0b' },
  pressure: { label: 'Haute pression manuelle', color: '#098777' },
  hand: { label: 'Lavage à la main', color: '#8851c8' },
  unknown: { label: 'Type à confirmer', color: '#64748b' }
};

function stationTypes(station) {
  const types = new Set();
  if (station.kind === 'contactless') types.add('contactless');
  const services = station.services || [];
  if (services.includes('Rouleaux')) types.add('rollers');
  if (services.includes('Haute pression')) types.add('pressure');
  if (services.includes('Lavage à la main')) types.add('hand');
  // Only documented equipment: neither "automatic" nor "hybrid" proves a brushless cycle.
  if (station.wash_type === 'rouleaux_haute_pression') { types.add('rollers'); types.add('pressure'); }
  if (station.wash_type === 'haute_pression') types.add('pressure');
  if (station.id === 1003) types.add('rollers');
  if (station.id === 1006) { types.add('rollers'); types.add('pressure'); }
  const tags = station.osm_tags || {};
  if (tags.high_pressure_washer === 'yes' && tags.self_service === 'yes') types.add('pressure');
  if (tags.hand_wash === 'yes') types.add('hand');
  return types.size ? [...types] : ['unknown'];
}

function isContactless(station) {
  return stationTypes(station).includes('contactless');
}

function isOsmOther(station) {
  return station.kind === 'osm';
}

function markerIconFor(station) {
  const type = stationTypes(station).includes(state.quickFilter) ? state.quickFilter : stationTypes(station)[0];
  return L.divIcon({
    className: '',
    html: `<div class="station-marker" style="background:${WASH_TYPES[type].color}"></div>`,
    iconSize: [34, 38],
    iconAnchor: [12, 34]
  });
}
const userIcon = L.divIcon({
  className: '',
  html: '<div class="user-marker"></div>',
  iconSize: [17, 17],
  iconAnchor: [8, 8]
});

function loadFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem('wash2-favorites') || '[]');
    return new Set(Array.isArray(raw) ? raw.map(Number).filter(Number.isFinite) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  localStorage.setItem('wash2-favorites', JSON.stringify([...state.favorites]));
  const favoriteCount = $('#favoriteCount');
  if (favoriteCount) favoriteCount.textContent = state.favorites.size;
}

function showStatus(message, duration = 2200) {
  statusBox.textContent = message;
  statusBox.classList.add('visible');
  clearTimeout(showStatus.timer);
  if (duration) showStatus.timer = setTimeout(() => statusBox.classList.remove('visible'), duration);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidStation(station) {
  return Number.isFinite(Number(station.id))
    && station.nom
    && station.adresse
    && Number.isFinite(Number(station.latitude))
    && Number.isFinite(Number(station.longitude));
}

function isPrecise(station) {
  return station.google_maps_type === 'fiche'
    || station.position_source === 'totalwash_official'
    || station.position_source === 'osm'
    || normalizeText(station.precision_position).includes('fiche google maps');
}

function accuracyLabel(station) {
  const precision = station.precision_position || '';
  if (station.position_source === 'osm') return 'Position OpenStreetMap · donnée communautaire';
  if (station.google_maps_type === 'fiche' || normalizeText(precision).includes('fiche google maps')) return 'Position recoupée avec Google Maps';
  if (normalizeText(precision).includes('geocodee')) return 'Adresse géocodée · entrée à vérifier';
  return precision || 'Emplacement à confirmer avant un long détour';
}

function washTypeLabel(station) {
  return stationTypes(station).map(type => WASH_TYPES[type].label).join(' + ');
}

function sourceUrl(station) {
  return Array.isArray(station.sources) && station.sources.length ? station.sources[0] : null;
}

function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const lat1 = a[0] * rad;
  const lat2 = b[0] * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointSegmentDistanceKm(point, start, end) {
  const lat0 = point[0] * Math.PI / 180;
  const project = ([lat, lon]) => [lon * 111.32 * Math.cos(lat0), lat * 110.574];
  const p = project(point);
  const a = project(start);
  const b = project(end);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  if (!length2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function distanceToRoute(station, route) {
  const point = [station.latitude, station.longitude];
  let best = Infinity;
  for (let i = 1; i < route.length; i += 1) {
    best = Math.min(best, pointSegmentDistanceKm(point, route[i - 1], route[i]));
  }
  return best;
}

function distanceLabel(km) {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}

function stationDistance(station) {
  if (state.route && routeFilter.checked) return distanceToRoute(station, state.route);
  if (state.userPosition) return haversine(state.userPosition, [station.latitude, station.longitude]);
  return Infinity;
}

function stationMapsUrl(station) {
  return station.google_maps_url
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${station.nom} ${station.adresse}`)}`;
}

function stationLinks(station) {
  const source = sourceUrl(station);
  const mapsLabel = station.google_maps_type === 'fiche' ? 'Google Maps ↗' : 'Rechercher sur Maps ↗';
  const sourceLink = source
    ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>`
    : '<span></span>';
  return `
    <div class="station-links">
      <a href="${escapeHtml(stationMapsUrl(station))}" target="_blank" rel="noopener noreferrer">${mapsLabel}</a>
      ${sourceLink}
    </div>
    <small class="position-note">${escapeHtml(accuracyLabel(station))}</small>
    ${station.note ? `<small class="station-notice">${escapeHtml(station.note)}</small>` : ''}
  `;
}

function matchesSearch(station) {
  if (!state.searchQuery) return true;
  const haystack = normalizeText(`${station.nom} ${station.adresse} ${washTypeLabel(station)} ${station.operator || ''} ${station.brand || ''}`);
  const tokens = normalizeText(state.searchQuery).split(' ').filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

function matchesQuickFilter(station) {
  if (WASH_TYPES[state.quickFilter]) return stationTypes(station).includes(state.quickFilter);
  if (state.quickFilter === 'precise') return isPrecise(station);
  if (state.quickFilter === 'favorites') return state.favorites.has(station.id);
  return true;
}

function sortStations(stations) {
  const compareName = (a, b) => a.nom.localeCompare(b.nom, 'fr');
  if (state.sort === 'name') return stations.sort(compareName);
  if (state.sort === 'distance') {
    return stations.sort((a, b) => {
      if (Number.isFinite(a.distance) || Number.isFinite(b.distance)) return a.distance - b.distance || compareName(a, b);
      return compareName(a, b);
    });
  }
  return stations.sort((a, b) => {
    if (state.userPosition || (state.route && routeFilter.checked)) return a.distance - b.distance || compareName(a, b);
    if (state.searchQuery) {
      const q = normalizeText(state.searchQuery);
      const aName = normalizeText(a.nom).startsWith(q) ? 0 : 1;
      const bName = normalizeText(b.nom).startsWith(q) ? 0 : 1;
      if (aName !== bName) return aName - bName;
    }
    if (isContactless(a) !== isContactless(b)) return isContactless(a) ? -1 : 1;
    return compareName(a, b);
  });
}

function stationBadges(station) {
  const badges = stationTypes(station).map(type => `<span class="mini-badge" style="color:${WASH_TYPES[type].color}">${WASH_TYPES[type].label}</span>`);
  if (isOsmOther(station)) badges.push('<span class="mini-badge">OpenStreetMap</span>');
  if (isPrecise(station)) badges.push('<span class="mini-badge precise">Position précise</span>');
  return badges.join('');
}

function renderStations() {
  const maxDistance = Number(distanceRange.value);
  let stations = state.stations
    .filter(matchesSearch)
    .filter(matchesQuickFilter)
    .map((station) => ({ ...station, distance: stationDistance(station) }));

  if (state.route && routeFilter.checked) {
    stations = stations.filter((station) => station.distance <= maxDistance);
  }

  sortStations(stations);
  state.visibleStations = stations;

  const visibleIds = new Set(stations.map((station) => station.id));
  for (const [id, marker] of state.markers) {
    const visible = visibleIds.has(id);
    if (visible && !map.hasLayer(marker)) marker.addTo(map);
    if (!visible && map.hasLayer(marker)) marker.removeFrom(map);
  }

  count.textContent = stations.length;
  const label = `${stations.length} station${stations.length > 1 ? 's' : ''}`;
  $('#mobileCount').textContent = label;
  $('#mobileSheetCount').textContent = `${label} affichée${stations.length > 1 ? 's' : ''}`;
  $('#mapPillText').textContent = `${label} · ${WASH_TYPES[state.quickFilter]?.label || 'Tous les types'}`;

  const context = [];
  if (state.searchQuery) context.push(`Recherche : “${state.searchQuery}”`);
  if (WASH_TYPES[state.quickFilter]) context.push(WASH_TYPES[state.quickFilter].label);
  if (state.quickFilter === 'precise') context.push('Positions précises uniquement');
  if (state.quickFilter === 'favorites') context.push('Favoris uniquement');
  if (state.route && routeFilter.checked) context.push(`À ≤ ${distanceRange.value} km du tracé`);
  $('#activeContext').hidden = context.length === 0;
  $('#activeContext').textContent = context.join(' · ');

  stationList.innerHTML = stations.length
    ? stations.map((station) => `
      <article class="station-item ${isContactless(station) ? '' : 'kind-other'} ${state.selectedStationId === station.id ? 'active' : ''}" data-id="${station.id}" tabindex="0" role="button" aria-label="Voir ${escapeHtml(station.nom)}">
        <span class="station-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17h16M6 17l1-7h10l1 7M8 10l1-3h6l1 3M7 14h.01M17 14h.01"/></svg></span>
        <span class="station-copy">
          <strong>${escapeHtml(station.nom)}</strong>
          <small>${escapeHtml(station.adresse)}</small>
          <span class="station-meta">${stationBadges(station)}</span>
        </span>
        <span class="station-distance">${Number.isFinite(station.distance) ? distanceLabel(station.distance) : ''}</span>
        <button class="item-favorite ${state.favorites.has(station.id) ? 'active' : ''}" type="button" data-favorite-id="${station.id}" aria-label="${state.favorites.has(station.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${state.favorites.has(station.id) ? '★' : '☆'}</button>
      </article>
    `).join('')
    : '<div class="empty-state">Aucune station ne correspond à ces critères.<br>Essaie d’effacer un filtre ou d’élargir le corridor.</div>';

  stationList.querySelectorAll('.station-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      if (event.target.closest('[data-favorite-id]')) return;
      focusStation(Number(item.dataset.id));
    });
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        focusStation(Number(item.dataset.id));
      }
    });
  });

  stationList.querySelectorAll('[data-favorite-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFavorite(Number(button.dataset.favoriteId));
    });
  });

  if (state.selectedStationId && !visibleIds.has(state.selectedStationId)) clearStationSelection();
  else if (state.selectedStationId) selectStation(state.selectedStationId, false);

  updateRouteNearbySummary();
}

function updateCounters() {
  const contactless = state.stations.filter(isContactless).length;
  const other = state.stations.length - contactless;
  $('#heroStationCount').textContent = state.stations.length;
  $('#contactlessCount').textContent = contactless;
  $('#otherCount').textContent = 4;
  for (const type of Object.keys(WASH_TYPES)) {
    const counter = document.querySelector(`[data-type-count="${type}"]`);
    if (counter) counter.textContent = state.stations.filter(s => stationTypes(s).includes(type)).length;
  }
  const favoriteCount = $('#favoriteCount');
  if (favoriteCount) favoriteCount.textContent = state.favorites.size;
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  saveFavorites();
  renderStations();
  if (state.selectedStationId === id) updateSelectionFavorite(id);
}

function updateSelectionFavorite(id) {
  const favorite = state.favorites.has(id);
  $('#selectionFavorite').classList.toggle('active', favorite);
  $('#selectionFavorite').textContent = favorite ? '★' : '☆';
  $('#selectionFavorite').setAttribute('aria-label', favorite ? 'Retirer des favoris' : 'Ajouter aux favoris');
}

function selectStation(id, scrollToItem = true) {
  const station = state.stations.find((item) => item.id === id);
  if (!station) return;

  state.selectedStationId = id;
  map.closePopup();
  for (const [markerId, marker] of state.markers) {
    marker.getElement()?.classList.toggle('is-selected', markerId === id);
  }
  $$('.station-item').forEach((item) => item.classList.toggle('active', Number(item.dataset.id) === id));

  const selectedItem = stationList.querySelector(`[data-id="${id}"]`);
  if (scrollToItem && selectedItem) selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const distance = stationDistance(station);
  const contactless = isContactless(station);
  $('#selectionName').textContent = station.nom;
  $('#selectionAddress').textContent = station.adresse;
  const selectionTag = $('#selectionTag');
  selectionTag.textContent = station.brand ? `Enseigne : ${station.brand}` : isOsmOther(station) ? 'Source : OpenStreetMap' : 'Station documentée';
  selectionTag.classList.toggle('other', !contactless);
  $('#selectionBadges').innerHTML = stationTypes(station).map(type => `<span class="selection-badge" style="color:${WASH_TYPES[type].color}">${WASH_TYPES[type].label}</span>`).join('');
  $('#selectionVerification').innerHTML = station.verification_equipement
    ? `<div class="verification-note"><strong>${contactless ? 'Vérification équipement' : 'Informations disponibles'} :</strong> ${escapeHtml(station.verification_equipement)}</div>`
    : '';
  $('#selectionLinks').innerHTML = stationLinks(station);
  $('#selectionDistance').textContent = Number.isFinite(distance)
    ? `${distanceLabel(distance)}${state.route && routeFilter.checked ? ' du tracé' : ''}`
    : isOsmOther(station) ? 'Donnée OpenStreetMap' : `Contrôlé le ${station.date_controle || '—'}`;
  $('#selectionDirections').dataset.stationId = station.id;
  updateSelectionFavorite(id);
  selectionCard.hidden = false;
}

function clearStationSelection() {
  state.selectedStationId = null;
  for (const marker of state.markers.values()) marker.getElement()?.classList.remove('is-selected');
  $$('.station-item').forEach((item) => item.classList.remove('active'));
  selectionCard.hidden = true;
  map.closePopup();
}

function focusStation(id) {
  const station = state.stations.find((item) => item.id === id);
  const marker = state.markers.get(id);
  if (!station || !marker) return;
  selectStation(id);
  map.flyTo([station.latitude, station.longitude], Math.max(map.getZoom(), 14), { duration: .75 });
  if (window.innerWidth <= 820) closeMobilePanel();
}

function openDirections(station) {
  if (!station) return;
  const destination = `${station.latitude},${station.longitude}`;
  $('#directionsStationName').textContent = station.nom;
  $('#googleMapsLink').href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${station.nom} ${station.adresse}`)}&travelmode=driving${station.google_place_id ? `&destination_place_id=${encodeURIComponent(station.google_place_id)}` : ''}`;
  $('#wazeLink').href = `https://www.waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes`;
  $('#appleMapsLink').href = `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`;
  const dialog = $('#directionsDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDirections() {
  const dialog = $('#directionsDialog');
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function addStationMarker(station) {
  if (state.markers.has(station.id)) return;
  const marker = L.marker([station.latitude, station.longitude], {
    icon: markerIconFor(station),
    title: station.nom
  });
  marker.on('click', () => selectStation(station.id));
  marker.addTo(map);
  state.markers.set(station.id, marker);
}

function normalizedStation(station, kind) {
  return {
    ...station,
    kind: station.kind || kind,
    id: Number(station.id),
    latitude: Number(station.latitude),
    longitude: Number(station.longitude)
  };
}

function osmWashType(tags = {}) {
  if (tags.touchless_wash === 'yes') return 'Sans contact déclaré sur OpenStreetMap';
  if (tags.self_service === 'yes' && tags.high_pressure_washer === 'yes') return 'Haute pression libre-service';
  if (tags.automated === 'yes' && tags.self_service === 'yes') return 'Automatique + libre-service';
  if (tags.automated === 'yes') return 'Lavage automatique';
  if (tags.self_service === 'yes') return 'Libre-service';
  if (tags.high_pressure_washer === 'yes') return 'Haute pression';
  return 'Technologie non renseignée';
}

function osmAddress(tags = {}) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const city = [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ') || tags['addr:place'] || 'Position OpenStreetMap';
}

function osmStationId(element) {
  const offset = element.type === 'node' ? 1 : element.type === 'way' ? 2 : 3;
  return -(Number(element.id) * 10 + offset);
}

function osmCoordinate(element) {
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

function isNearKnownStation(lat, lon, maxKm = 0.12) {
  return state.stations.some((station) => !isOsmOther(station)
    && haversine([lat, lon], [station.latitude, station.longitude]) <= maxKm);
}

function osmVerificationText(tags = {}) {
  const details = [];
  if (tags.automated === 'yes') details.push('automatique');
  if (tags.self_service === 'yes') details.push('libre-service');
  if (tags.high_pressure_washer === 'yes') details.push('haute pression');
  if (tags.touchless_wash === 'yes') details.push('sans contact déclaré');
  if (tags.amenity === 'fuel' && tags.car_wash === 'yes') details.push('lavage intégré à une station-service');
  if (tags.brand) details.push(`marque : ${tags.brand}`);
  const suffix = details.length ? ` Tags disponibles : ${details.join(', ')}.` : '';
  return `Station issue des données communautaires OpenStreetMap. La technologie et la disponibilité ne sont pas vérifiées par Carte des lavages auto.${suffix}`;
}

async function fetchOverpass(query) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: query })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Overpass indisponible');
}

function overpassRadiusForZoom(zoom) {
  if (zoom >= 13) return 12000;
  if (zoom >= 11) return 22000;
  if (zoom >= 9) return 40000;
  return 60000;
}

async function loadOtherStationsNearby({ silent = false } = {}) {
  if (state.quickFilter === 'contactless' || state.osmLoading) return;
  const zoom = map.getZoom();
  if (!state.userPosition && zoom < 8.5) {
    if (!silent) showStatus('Zoome sur une zone ou utilise « Autour de moi » pour charger les autres stations.', 3200);
    return;
  }

  const center = state.userPosition && zoom < 10
    ? { lat: state.userPosition[0], lng: state.userPosition[1] }
    : map.getCenter();
  const radius = overpassRadiusForZoom(zoom);
  const fetchKey = `${Math.round(center.lat * 20) / 20}:${Math.round(center.lng * 20) / 20}:${radius}`;
  if (state.osmFetchKeys.has(fetchKey)) return;

  state.osmLoading = true;
  if (!silent) showStatus('Chargement des autres stations autour de la carte…', 0);
  const query = `[out:json][timeout:20];(nwr["amenity"="car_wash"](around:${radius},${center.lat.toFixed(6)},${center.lng.toFixed(6)});nwr["amenity"="fuel"]["car_wash"="yes"](around:${radius},${center.lat.toFixed(6)},${center.lng.toFixed(6)}););out center tags;`;

  try {
    const data = await fetchOverpass(query);
    let added = 0;
    for (const element of (data.elements || []).slice(0, 500)) {
      const tags = element.tags || {};
      if (tags.access === 'private' || tags.access === 'no') continue;
      const coord = osmCoordinate(element);
      if (!coord) continue;
      const [lat, lon] = coord;
      const osmKey = `${element.type}/${element.id}`;
      if (state.osmKeys.has(osmKey)) continue;
      state.osmKeys.add(osmKey);
      if (isNearKnownStation(lat, lon)) continue;

      const id = osmStationId(element);
      if (state.stations.some((station) => station.id === id)) continue;
      const name = tags.name || tags.brand || tags.operator || 'Station de lavage';
      const station = {
        id,
        kind: 'osm',
        osm_key: osmKey,
        osm_tags: { self_service: tags.self_service, high_pressure_washer: tags.high_pressure_washer, hand_wash: tags.hand_wash },
        nom: name,
        adresse: osmAddress(tags),
        latitude: lat,
        longitude: lon,
        operator: tags.operator || '',
        brand: tags.brand || '',
        wash_type_label: osmWashType(tags),
        position_source: 'osm',
        precision_position: 'Position OpenStreetMap · donnée communautaire.',
        sources: [`https://www.openstreetmap.org/${element.type}/${element.id}`],
        google_maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`,
        google_maps_type: 'recherche',
        verification_equipement: osmVerificationText(tags)
      };
      state.stations.push(station);
      addStationMarker(station);
      added += 1;
    }
    state.osmFetchKeys.add(fetchKey);
    updateCounters();
    renderStations();
    if (!silent) showStatus(`${added} autre${added > 1 ? 's' : ''} station${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} autour de la carte.`);
  } catch (error) {
    console.warn('Carte des lavages auto: chargement OpenStreetMap impossible', error);
    if (!silent) showStatus('Les stations documentées restent disponibles. OpenStreetMap est temporairement indisponible.', 3600);
  } finally {
    state.osmLoading = false;
  }
}

async function loadStations() {
  try {
    const [strictResult, otherResult, totalResult] = await Promise.allSettled([
      fetch('stations.json', { cache: 'no-store' }),
      fetch('stations-autres.json', { cache: 'no-store' }),
      fetch('stations-totalwash.json', { cache: 'no-store' })
    ]);

    if (strictResult.status !== 'fulfilled' || !strictResult.value.ok) {
      throw new Error('Impossible de charger stations.json');
    }

    const strictRaw = await strictResult.value.json();
    let otherRaw = [];
    if (otherResult.status === 'fulfilled' && otherResult.value.ok) {
      otherRaw = await otherResult.value.json();
    } else {
      console.warn('Carte des lavages auto: stations-autres.json indisponible, la base sans contact reste utilisable.');
    }

    let totalRaw = [];
    let totalLoaded = false;
    if (totalResult.status === 'fulfilled' && totalResult.value.ok) {
      try {
        const data = await totalResult.value.json();
        if (!Array.isArray(data)) throw new Error('Format Total Wash incorrect');
        totalRaw = data;
        totalLoaded = true;
      } catch (error) { console.warn('Carte des lavages auto: base Total Wash indisponible', error); }
    }

    const allRaw = [
      ...strictRaw.map((station) => normalizedStation(station, 'contactless')),
      ...otherRaw.map((station) => normalizedStation(station, 'other')),
      ...totalRaw.map((station) => normalizedStation(station, 'other'))
    ].filter(isValidStation);

    const ids = new Set();
    state.stations = allRaw.filter((station) => {
      if (ids.has(station.id)) return false;
      ids.add(station.id);
      return true;
    });

    state.stations.forEach(addStationMarker);
    updateCounters();
    renderStations();
    statusBox.classList.remove('visible');
    if (!totalLoaded) showStatus('La base Total Wash n’a pas pu être chargée. Recharge la page pour réessayer.', 0);

    if (allRaw.length !== state.stations.length) {
      console.warn(`Carte des lavages auto: ${allRaw.length - state.stations.length} entrée(s) dupliquée(s) ignorée(s).`);
    }
  } catch (error) {
    console.error(error);
    showStatus('Impossible de charger la base de stations.', 0);
    stationList.innerHTML = '<div class="empty-state">Erreur de chargement de stations.json.<br>Le site doit être servi en HTTPS ou via un serveur local.</div>';
  }
}

function applyUserPosition(coords, cached = false) {
  state.userPosition = [coords.latitude, coords.longitude];
  if (state.userMarker) state.userMarker.remove();
  state.userMarker = L.marker(state.userPosition, { icon: userIcon, zIndexOffset: 1000 })
    .addTo(map)
    .bindTooltip(cached ? 'Dernière position connue' : 'Votre position', { direction: 'top' });
  state.sort = 'distance';
  $('#sortSelect').value = 'distance';
  map.setView(state.userPosition, 11);
  renderStations();
  if (state.quickFilter !== 'contactless') loadOtherStationsNearby({ silent: true });
  if (window.innerWidth <= 820) closeMobilePanel();
  showStatus(cached ? 'Dernière position affichée · actualisation…' : 'Position trouvée');
}

function setLocationBusy(busy) {
  state.locating = busy;
  [$('#locateButton'), $('#locatePrimary')].forEach((button) => {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
  });
}

function locateUser() {
  if (!navigator.geolocation) return showStatus('La géolocalisation n’est pas disponible.');
  if (state.locating) return;

  let cachedPosition = null;
  try {
    const saved = JSON.parse(localStorage.getItem('wash2-position'));
    if (saved && Date.now() - saved.timestamp < 10 * 60 * 1000) {
      cachedPosition = saved;
      applyUserPosition(saved, true);
    }
  } catch {
    localStorage.removeItem('wash2-position');
  }

  if (!cachedPosition) showStatus('Localisation…', 0);
  setLocationBusy(true);

  navigator.geolocation.getCurrentPosition(({ coords }) => {
    const position = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      timestamp: Date.now()
    };
    localStorage.setItem('wash2-position', JSON.stringify(position));
    applyUserPosition(position);
    setLocationBusy(false);
  }, (error) => {
    setLocationBusy(false);
    if (cachedPosition) return showStatus('Dernière position utilisée');
    const message = error.code === 1
      ? 'Autorise la localisation pour afficher les stations proches.'
      : 'Position indisponible. Réessaie dans quelques secondes.';
    showStatus(message, 4200);
  }, { enableHighAccuracy: false, timeout: 7000, maximumAge: 600000 });
}

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=fr&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Service de recherche indisponible');
  const results = await response.json();
  if (!results.length) throw new Error(`Adresse introuvable : ${query}`);
  return { lat: Number(results[0].lat), lon: Number(results[0].lon), label: results[0].display_name };
}

function selectedPlace(input) {
  const lat = Number(input.dataset.lat);
  const lon = Number(input.dataset.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon, label: input.dataset.label || input.value };
  return null;
}

async function resolvePlace(input) {
  return selectedPlace(input) || geocode(input.value.trim());
}

async function searchCities(query, signal) {
  const key = normalizeText(query);
  if (citySuggestionCache.has(key)) return citySuggestionCache.get(key);
  const url = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(query)}&limit=7&type=municipality&autocomplete=1`;
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Suggestions indisponibles');
  const data = await response.json();
  const cities = (data.features || []).map((feature) => {
    const properties = feature.properties || {};
    const [lon, lat] = feature.geometry?.coordinates || [];
    return {
      name: properties.city || properties.name || properties.label,
      label: properties.label || properties.city || properties.name,
      context: [properties.postcode, properties.context].filter(Boolean).join(' · '),
      lat: Number(lat), lon: Number(lon)
    };
  }).filter((city) => city.name && Number.isFinite(city.lat) && Number.isFinite(city.lon));
  citySuggestionCache.set(key, cities);
  return cities;
}

function setupCityAutocomplete(input, list) {
  let suggestions = [];
  let activeIndex = -1;
  let debounceTimer;
  let controller;

  const close = () => {
    list.hidden = true;
    list.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  };

  const setActive = (index) => {
    const items = [...list.querySelectorAll('.suggestion-item')];
    if (!items.length) return;
    activeIndex = (index + items.length) % items.length;
    items.forEach((item, itemIndex) => item.classList.toggle('active', itemIndex === activeIndex));
    input.setAttribute('aria-activedescendant', items[activeIndex].id);
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  };

  const choose = (index) => {
    const city = suggestions[index];
    if (!city) return;
    input.value = city.name;
    input.dataset.lat = city.lat;
    input.dataset.lon = city.lon;
    input.dataset.label = city.label;
    close();
    input.focus();
  };

  const render = (cities) => {
    suggestions = cities;
    activeIndex = -1;
    list.innerHTML = cities.length
      ? cities.map((city, index) => `
        <button class="suggestion-item" id="${list.id}-option-${index}" type="button" role="option" data-index="${index}">
          <span class="suggestion-pin" aria-hidden="true">⌖</span>
          <span class="suggestion-copy"><strong>${escapeHtml(city.name)}</strong><small>${escapeHtml(city.context || 'France')}</small></span>
        </button>`).join('')
      : '<div class="suggestion-message">Aucune ville trouvée</div>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    list.querySelectorAll('.suggestion-item').forEach((item) => {
      item.addEventListener('pointerdown', (event) => event.preventDefault());
      item.addEventListener('click', () => choose(Number(item.dataset.index)));
    });
  };

  input.addEventListener('input', () => {
    delete input.dataset.lat;
    delete input.dataset.lon;
    delete input.dataset.label;
    clearTimeout(debounceTimer);
    controller?.abort();
    const query = input.value.trim();
    if (query.length < 2) return close();
    debounceTimer = setTimeout(async () => {
      controller = new AbortController();
      try {
        render(await searchCities(query, controller.signal));
      } catch (error) {
        if (error.name !== 'AbortError') close();
      }
    }, 260);
  });

  input.addEventListener('keydown', (event) => {
    if (list.hidden) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(activeIndex + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(activeIndex - 1); }
    else if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); choose(activeIndex); }
    else if (event.key === 'Escape') close();
  });

  input.addEventListener('blur', () => setTimeout(close, 120));
}

function updateRouteNearbySummary() {
  const nearby = $('#routeNearby');
  if (!nearby || !state.route) return;
  if (!routeFilter.checked) {
    nearby.textContent = 'Filtre de proximité désactivé';
    return;
  }
  const total = state.visibleStations.length;
  nearby.textContent = `${total} station${total > 1 ? 's' : ''} à ≤ ${distanceRange.value} km du tracé`;
}

function setRouteDistance(value) {
  distanceRange.value = String(value);
  $('#distanceOutput').textContent = `${value} km`;
  $$('.distance-presets button').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.distance) === Number(value));
  });
  renderStations();
}

async function calculateRoute(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const startQuery = $('#startInput').value.trim();
  const endQuery = $('#endInput').value.trim();
  routeSummary.className = 'route-summary';
  routeSummary.textContent = 'Recherche des adresses…';
  button.disabled = true;

  try {
    const start = await resolvePlace($('#startInput'));
    const end = await resolvePlace($('#endInput'));
    routeSummary.textContent = 'Calcul du trajet…';
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?alternatives=false&steps=false&overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Le service d’itinéraire ne répond pas');
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.length) throw new Error('Aucun itinéraire routier trouvé');

    const best = data.routes[0];
    state.route = best.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    if (state.routeLine) state.routeLine.remove();
    if (state.routeCasing) state.routeCasing.remove();

    state.routeCasing = L.polyline(state.route, {
      color: '#fff', weight: 10, opacity: .95, lineJoin: 'round', lineCap: 'round', interactive: false
    }).addTo(map);
    state.routeLine = L.polyline(state.route, {
      color: '#0d73f6', weight: 6, opacity: 1, lineJoin: 'round', lineCap: 'round', interactive: false
    }).addTo(map);
    state.routeCasing.bringToFront();
    state.routeLine.bringToFront();
    map.fitBounds(state.routeLine.getBounds(), { padding: window.innerWidth <= 820 ? [24, 24] : [42, 42] });

    routeFilter.disabled = false;
    distanceRange.disabled = false;
    $$('.distance-presets button').forEach((preset) => { preset.disabled = false; });
    routeFilter.checked = true;
    $('#clearRoute').hidden = false;
    $('#routeFilterBlock').hidden = false;
    state.sort = 'distance';
    $('#sortSelect').value = 'distance';

    routeSummary.innerHTML = `
      <span class="route-mode">Trajet calculé</span><br>
      <strong>${distanceLabel(best.distance / 1000)} · ${Math.round(best.duration / 60)} min</strong><br>
      ${escapeHtml(startQuery)} → ${escapeHtml(endQuery)}
      <span class="route-nearby" id="routeNearby"></span>
    `;
    renderStations();

    if (window.innerWidth <= 820) {
      closeMobilePanel();
      showStatus(`${state.visibleStations.length} station${state.visibleStations.length > 1 ? 's' : ''} près du trajet`);
    }
  } catch (error) {
    routeSummary.className = 'route-summary error';
    routeSummary.textContent = error.message || 'Impossible de calculer cet itinéraire.';
  } finally {
    button.disabled = false;
  }
}

function clearRoute() {
  if (state.routeLine) state.routeLine.remove();
  if (state.routeCasing) state.routeCasing.remove();
  state.route = null;
  state.routeLine = null;
  state.routeCasing = null;
  routeFilter.checked = false;
  routeFilter.disabled = true;
  distanceRange.disabled = true;
  $$('.distance-presets button').forEach((preset) => { preset.disabled = true; });
  routeSummary.textContent = '';
  $('#clearRoute').hidden = true;
  $('#routeFilterBlock').hidden = true;
  renderStations();
  if (state.userPosition) map.setView(state.userPosition, 11);
  else map.setView(FRANCE_CENTER, 6);
}

function setQuickFilter(filter) {
  state.quickFilter = filter;
  $$('.filter-chip').forEach((button) => button.classList.toggle('active', button.dataset.filter === filter));
  for (const station of state.stations) state.markers.get(station.id)?.setIcon(markerIconFor(station));
  clearStationSelection();
  renderStations();
  if (filter !== 'contactless') loadOtherStationsNearby();
}

function setSearch(value) {
  state.searchQuery = value.trim();
  $('#clearSearch').hidden = !state.searchQuery;
  renderStations();

  if (state.searchQuery && state.visibleStations.length === 1) {
    const station = state.visibleStations[0];
    map.flyTo([station.latitude, station.longitude], 13, { duration: .5 });
  }
}

const mobilePanel = $('.panel');
const mobilePanelButton = $('#mobilePanelButton');
const panelBackdrop = $('#panelBackdrop');
const mobilePanelClose = $('#mobilePanelClose');

function openMobilePanel() {
  mobilePanel.classList.add('open');
  panelBackdrop.classList.add('visible');
  mobilePanelButton.setAttribute('aria-expanded', 'true');
  document.body.classList.add('panel-open');
  setTimeout(() => mobilePanelClose.focus(), 280);
}

function closeMobilePanel(returnFocus = false) {
  mobilePanel.classList.remove('open');
  panelBackdrop.classList.remove('visible');
  mobilePanelButton.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('panel-open');
  if (returnFocus) mobilePanelButton.focus();
}

$('#locateButton').addEventListener('click', locateUser);
$('#locatePrimary').addEventListener('click', locateUser);
$('#routeForm').addEventListener('submit', calculateRoute);
setupCityAutocomplete($('#startInput'), $('#startSuggestions'));
setupCityAutocomplete($('#endInput'), $('#endSuggestions'));
$('#clearRoute').addEventListener('click', clearRoute);
routeFilter.addEventListener('change', renderStations);
distanceRange.addEventListener('input', () => setRouteDistance(distanceRange.value));
$$('.distance-presets button').forEach((button) => button.addEventListener('click', () => setRouteDistance(button.dataset.distance)));
$$('.filter-chip').forEach((button) => button.addEventListener('click', () => setQuickFilter(button.dataset.filter)));
$('#sortSelect').addEventListener('change', (event) => { state.sort = event.target.value; renderStations(); });
$('#stationSearch').addEventListener('input', (event) => setSearch(event.target.value));
$('#clearSearch').addEventListener('click', () => { $('#stationSearch').value = ''; setSearch(''); $('#stationSearch').focus(); });
$('#brandHome').addEventListener('click', (event) => { event.preventDefault(); clearStationSelection(); map.setView(FRANCE_CENTER, 6); });
$('#aboutButton').addEventListener('click', () => $('#aboutDialog').showModal());
$('#closeDialog').addEventListener('click', () => $('#aboutDialog').close());
$('#selectionClose').addEventListener('click', clearStationSelection);
$('#selectionFavorite').addEventListener('click', () => { if (state.selectedStationId) toggleFavorite(state.selectedStationId); });
$('#selectionDirections').addEventListener('click', () => {
  openDirections(state.stations.find((station) => station.id === Number($('#selectionDirections').dataset.stationId)));
});
$('#closeDirectionsDialog').addEventListener('click', closeDirections);
$('#directionsDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeDirections(); });
mobilePanelButton.addEventListener('click', openMobilePanel);
mobilePanelClose.addEventListener('pointerup', (event) => { event.preventDefault(); event.stopPropagation(); closeMobilePanel(true); });
mobilePanelClose.addEventListener('click', (event) => { event.preventDefault(); closeMobilePanel(true); });
panelBackdrop.addEventListener('click', () => closeMobilePanel(true));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (window.innerWidth <= 820 && mobilePanel.classList.contains('open')) closeMobilePanel();
    else clearStationSelection();
  }
});

let osmMoveTimer;
map.on('moveend', () => {
  if (state.quickFilter === 'contactless' || map.getZoom() < 8.5) return;
  clearTimeout(osmMoveTimer);
  osmMoveTimer = setTimeout(() => loadOtherStationsNearby({ silent: true }), 550);
});

saveFavorites();
loadStations();
