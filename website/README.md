# Haven website

Static, framework-free landing site in `website/`.

## Local preview

From the repository root, run a static server, for example:

```powershell
python -m http.server 8080 --directory website
```

Then open `http://localhost:8080`.

## Before publishing

- Replace the placeholder `@haven.example` email addresses in the Terms, Privacy, and footer links with monitored contacts.
- Have the Terms and Privacy Policy reviewed for the actual project operator, jurisdiction, hosting configuration, and data flows. The current legal copy is a draft template, not legal advice.
- Configure an official project domain and download location. `downloads/HavenSetup-1.0.5.exe` is a copy of the current local release artifact, not a public release URL.
- The checked-in installer is about 145 MB; confirm hosting limits and decide whether the landing page should link to GitHub Releases or another CDN rather than serving it from the site repository.
- Re-check system requirements and feature descriptions against the release that will actually be distributed.

Images in `assets/` are the one supplied Haven desktop screenshot (`haven-desktop.png`) and the supplied project logo (`rose-logo.png`). No Familiar or externally sourced imagery is used. If you need more screenshots for the gallery, supply them and I can add them.

