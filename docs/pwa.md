# PWA and Web

## Development and export

- `npm run web` starts the Expo web development server (`expo start --web`). The
  service worker is intentionally disabled in development to avoid caching the
  Metro development bundle.
- `npm run build:web` exports the production web app to `dist/`.
- `react-dom` and `react-native-web` were already present at compatible
  versions; `@expo/metro-runtime` was added with `npx expo install`.
- The existing `npm run ios`, `npm run android`, and EAS native build profiles
  are unchanged. The PWA assets and browser-only code are not loaded by native
  builds.

`npx expo install --check` currently reports older Expo SDK 57 patch versions
in other existing dependencies. They were not upgraded as part of this web-only
change to avoid unrelated native dependency changes.

## Manifest, template, and icons

For this Expo Router app with static output, `npx expo customize
src/app/+html.tsx` creates the supported root HTML document. The document links
`public/manifest.json`, defines the browser theme color, and retains Expo's
static-rendering structure. (The `public/index.html` template is used by other
web output modes; it is not the document template for this static Router
export.) Update `+html.tsx` alongside `app.json` if the app's branding changes.

The manifest sets the name, standalone display, portrait orientation, `/` start
URL and scope, and theme/background colors. Its icons are 192x192, 512x512, and
512x512 maskable PNGs under `public/icons/`. Keep the maskable artwork inside
the central safe area. If the app is hosted below the domain root, update the
manifest URLs, scope, start URL, and service-worker registration path together.

## Offline behavior and updates

The production service worker precaches the app shell, its emitted JS/CSS
bundles, manifest, and icons, then caches same-origin scripts, styles, images,
and fonts as they are requested. It uses network-first navigation with a
cached app shell fallback. API requests and cross-origin resources are not
cached. When an updated worker is ready, the browser offers a reload prompt.
The cache name in `public/service-worker.js` can be incremented when changing
cache strategy or intentionally clearing older cached assets.

Service-worker registration lives in `registerServiceWorker.web.ts`; the
`.native.ts` and base implementations are no-ops. Keep browser globals and APIs
(`window`, `document`, `navigator.serviceWorker`, and `caches`) in web-only
modules. The system-calendar feature follows the same platform split: native
uses Expo Calendar, while web downloads an `.ics` event file.

## Verify the production PWA

1. Run `npm run build:web`.
2. Serve the exported directory locally, for example:

   ```bash
   python3 -m http.server 4173 --directory dist
   ```

3. Open `http://localhost:4173` in Chrome. Localhost is treated as a secure
   context for service workers; deployed sites must use HTTPS.
4. In DevTools **Application**, confirm the manifest fields and icons, then
   check that the service worker is activated and the app loads after going
   offline. Lighthouse's **Progressive Web App** audit can check installability.
5. To verify update handling, change a cached web asset, export and serve the
   updated build, then revisit the app and accept the reload prompt.

Static hosting must serve the exported route files (or provide an appropriate
route fallback). Confirm the deployed site's `/manifest.json`,
`/service-worker.js`, and `/icons/` URLs return successfully.
