# Custom domain and HTTPS

Production uses:

```text
howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz
```

The public repository and website remain public. GitHub Pages publishes a **GitHub Actions artifact**, not a `gh-pages` branch.

## DNS and Pages settings

The required subdomain record is:

| Type | Host | Target |
| --- | --- | --- |
| CNAME | `howmuchmoneydidyoualreadyburnedwithslop` | `joosibaeri.github.io` |

The target is the account's GitHub Pages host, not `joosibaeri.xyz` or a repository URL. Do not change unrelated apex/other-site DNS records. Keep this subdomain DNS-only if your provider has a proxy mode.

In [repository Settings → Pages](https://github.com/Joosibaeri/burnyourmoneywithslop/settings/pages):

1. Set **Source → GitHub Actions**.
2. Set the custom domain to the exact hostname above.
3. Confirm GitHub's DNS check succeeds.
4. Once a valid certificate is available, enable **Enforce HTTPS**.

`public/CNAME` matches this hostname. `vite.config.ts` uses **`base: '/'`**, because the application is served at this custom-domain root. Do not change it to the repository path for this deployment. The build supplies a static callback index and SPA 404 fallback for direct profile/invitation routes.

## Certificate provisioning

GitHub requests a Let's Encrypt certificate after its DNS checks pass. A working CNAME alone does **not** prove HTTPS is ready. If curl reports a certificate hostname mismatch, do not use `--insecure`, disable verification, or send users through HTTP OAuth.

If Pages still says **Certificate not yet created** after its DNS check succeeds, GitHub's [official troubleshooting guide](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https#troubleshooting-certificate-provisioning-certificate-not-yet-created-error) recommends removing and re-entering the same custom domain in Pages to restart provisioning. This briefly changes routing; use the settings UI deliberately. Then enable Enforce HTTPS once available.

Check for conflicting subdomain records and CAA rules that prevent Let's Encrypt. The hostname is under GitHub's documented 64-character certificate limit. Do not shorten or replace it without intentionally updating the CNAME, Auth site/redirect URLs, OAuth homepage, and collector discovery URL together.

## Verify

```sh
curl --head https://howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz
curl --head https://howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz/auth/callback
curl https://howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz/collector-config.json
```

All must use a valid certificate; the first two should return 200 after deployment. The JSON contains only the Supabase project URL and publishable key. An HTTP request should redirect to HTTPS after enforcement is enabled. Direct SPA profile/invite routes may return the custom 404 document and then render normally in the browser.

GitHub OAuth's registered callback is **Supabase's** `https://skvbxlhnjnksmzdnchlu.supabase.co/auth/v1/callback`, not a Pages route. The website's PKCE return route is `/auth/callback`; it works only with the allowed origin and a valid HTTPS session. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

If production TLS is pending, authenticated development can be tested at the allowed `localhost:5173` callback using public `.env.local` values. Collector login can use the explicit Supabase `--url`/`--key` fallback; neither workaround bypasses TLS on remote services.
