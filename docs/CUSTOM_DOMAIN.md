# Custom Domain Setup

This guide explains how to configure `burnyourmoneywithslop.joosibaeri.xyz` for your GitHub Pages site.

## Current Configuration

The repository already includes a `CNAME` file in `public/`:
```
burnyourmoneywithslop.joosibaeri.xyz
```

This will be deployed to GitHub Pages automatically.

---

## DNS Configuration

You need to configure DNS for `burnyourmoneywithslop.joosibaeri.xyz` to point to GitHub Pages.

### Option A: Subdomain (Current Setup)

Since `joosibaeri.xyz` is your root domain, add a **CNAME record**:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | burnyourmoneywithslop | joosibaeri.github.io | Auto |

**Important**: The target must be `joosibaeri.github.io` (your GitHub Pages domain), NOT `joosibaeri.xyz`.

### Option B: Apex Domain (If you want joosibaeri.xyz directly)

If you want the root domain `joosibaeri.xyz` to point to GitHub Pages:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 185.199.108.153 | Auto |
| A | @ | 185.199.109.153 | Auto |
| A | @ | 185.199.110.153 | Auto |
| A | @ | 185.199.111.153 | Auto |
| CNAME | www | joosibaeri.github.io | Auto |

Then update `public/CNAME` to `joosibaeri.xyz`.

---

## GitHub Pages Configuration

1. Go to your repo: `https://github.com/Joosibaeri/burnyourmoneywithslop`
2. **Settings** → **Pages**
3. **Source**: Deploy from a branch
4. **Branch**: `gh-pages` (created automatically by the workflow) / `/ (root)`
5. **Custom domain**: Enter `burnyourmoneywithslop.joosibaeri.xyz`
6. Check **Enforce HTTPS** (may take a few minutes to become available)
7. Click **Save**

---

## Verification

After DNS propagates (usually 5-30 minutes, up to 48 hours):

```bash
# Check DNS
dig +short burnyourmoneywithslop.joosibaeri.xyz CNAME
# Should return: joosibaeri.github.io.

# Check HTTPS
curl -I https://burnyourmoneywithslop.joosibaeri.xyz
# Should return 200 OK with valid certificate
```

---

## Troubleshooting

### "Custom domain not verified"

- DNS changes can take up to 48 hours
- Ensure CNAME points to `joosibaeri.github.io` exactly
- No trailing dots in the CNAME value in GitHub settings

### HTTPS not working

- Wait 5-10 minutes after domain verification
- GitHub provisions Let's Encrypt certificates automatically
- Check "Enforce HTTPS" is checked in Pages settings

### 404 on subdomain

- Ensure the `CNAME` file is in `public/` and gets deployed
- Check the workflow builds to `dist/` with the CNAME file
- Verify base path in `vite.config.ts` matches repo name: `/burnyourmoneywithslop/`

### Mixed content warnings

- All assets must load over HTTPS
- The Vite build with `base: '/burnyourmoneywithslop/'` handles this
- Check browser console for `http://` requests

---

## DNS Providers Quick Reference

### Cloudflare
1. DNS → Add Record
2. Type: CNAME, Name: `burnyourmoneywithslop`, Target: `joosibaeri.github.io`
3. Proxy status: **DNS Only** (gray cloud) - GitHub Pages doesn't work with Cloudflare proxy

### Namecheap
1. Advanced DNS → Add New Record
2. Type: CNAME Record, Host: `burnyourmoneywithslop`, Value: `joosibaeri.github.io`

### GoDaddy
1. DNS Management → Add
2. Type: CNAME, Host: `burnyourmoneywithslop`, Points to: `joosibaeri.github.io`

### AWS Route 53
1. Create Record
2. Record type: CNAME, Name: `burnyourmoneywithslop`, Value: `joosibaeri.github.io`

---

## SSL Certificate Details

GitHub Pages uses Let's Encrypt. The certificate covers:
- `burnyourmoneywithslop.joosibaeri.xyz`
- `www.burnyourmoneywithslop.joosibaeri.xyz` (if you add it)

Auto-renewal happens automatically.

---

## Reverting to GitHub Pages Default

If you want to remove the custom domain:

1. GitHub Settings → Pages → Custom domain → **Remove**
2. Delete the `CNAME` file from `public/`
3. Push changes - site will be available at `https://joosibaeri.github.io/burnyourmoneywithslop/`