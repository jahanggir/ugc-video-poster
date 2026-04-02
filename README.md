# UGC Video Poster — Thumbnail Extractor

Extract high-quality thumbnails from any video file. Scrub to the exact frame, choose your resolution, and download.

## Features

- **Frame-accurate scrubbing** — timeline preview strip + arrow keys for 1/30s precision
- **Native resolution default** — auto-detects video dimensions, no upscale/downscale by default
- **Multiple export formats** — PNG, JPEG, WebP with quality control
- **Keyboard shortcuts** — `←` `→` step frames, `Enter`/`Space` capture, `Ctrl+S` save
- **Zero upload** — everything runs locally in your browser, no data leaves your machine

## Local Development

```bash
npm install
npm run dev
```

## Deploy to Netlify

1. Push this repo to GitHub
2. Go to [Netlify](https://app.netlify.com) → **Add new site** → **Import an existing project**
3. Connect your GitHub repo `jahanggir/ugc-video-poster`
4. Netlify auto-detects the `netlify.toml` config — just click **Deploy**

Build settings (auto-detected):
- **Build command:** `npm run build`
- **Publish directory:** `dist`

## Security Headers

The `netlify.toml` includes production security headers: CSP, X-Frame-Options, XCTO, and Referrer-Policy.

## License

MIT
