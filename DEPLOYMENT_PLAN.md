# Deployment Plan for Yatiksu

## 1. Build Output
- Run `pnpm build` to generate static files in the `dist/` directory.

## 2. Recommended Hosting Options

### A. Vercel (Recommended)
- **Why:** Easiest for static Vite apps, instant preview URLs, free tier.
- **How:**
  1. Push code to GitHub.
  2. Sign up at [vercel.com](https://vercel.com/) and import the repo.
  3. Set build command: `pnpm build`
  4. Set output directory: `dist`
  5. Deploy.

### B. Netlify
- **Why:** Also great for static sites, simple drag-and-drop or Git integration.
- **How:**
  1. Push code to GitHub.
  2. Sign up at [netlify.com](https://netlify.com/) and link the repo.
  3. Set build command: `pnpm build`
  4. Set publish directory: `dist`
  5. Deploy.

### C. Cloudflare Pages
- **Why:** Fast global CDN, free tier, supports Vite.
- **How:**
  1. Push code to GitHub.
  2. Sign up at [pages.cloudflare.com](https://pages.cloudflare.com/) and connect the repo.
  3. Set build command: `pnpm build`
  4. Set output directory: `dist`
  5. Deploy.

## 3. PWA Support
- Ensure `vite-plugin-pwa` is configured for offline support.
- All static hosts above support PWAs out of the box.

## 4. Custom Domain (Optional)
- All providers allow custom domains with HTTPS.

## 5. CI/CD
- Each push to `main` triggers an automatic deploy.

---

**Alternative:**  
If you need a backend in the future (e.g., multiplayer, leaderboards), consider Vercel/Netlify serverless functions or Cloudflare Workers. 