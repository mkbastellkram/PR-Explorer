Madeira Wanderplaner v3

Startdatei: index.html

Änderungen v3:
- störende untere Navigation entfernt
- Installieren-Hinweis in die Kopfzeile verlegt
- Kartencontainer mit fester App-Höhe und ResizeObserver stabilisiert
- Leaflet invalidateSize mehrfach nachgeladen, damit die Karte auf iOS vollständig zeichnet
- POI-Daten sind in index.html eingebettet und offline nutzbar

Hinweis:
Die POI-Inhalte funktionieren offline. OpenStreetMap-Kartenkacheln benötigen Internet, sofern sie nicht vorher im Browsercache liegen. Für ein Homescreen-Icon muss die App per HTTPS bereitgestellt werden, z. B. GitHub Pages/Netlify. Danach in Safari: Teilen > Zum Home-Bildschirm.
