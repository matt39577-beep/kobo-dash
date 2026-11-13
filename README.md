# Kobo Dash

Turns an old Kobo e-reader into a weather, commute, calendar and news display, with **no server at home**.

```
GitHub Actions (every 15 min)          GitHub Pages                    Kobo Mini
  fetch weather / traffic /   ──►   dashboard.png + display   ◄──   wakes, downloads image,
  calendar / news, render PNG        settings.html (phone)            shows it, sleeps
```

* **Weather:** [Open-Meteo](https://open-meteo.com) (free, no key)
* **Commute:** [TomTom Routing API](https://developer.tomtom.com) with live traffic (free key, 2,500 requests/day)
* **Calendar:** any private `.ics` link (Google, iCloud, Outlook)
* **News:** any RSS feeds
* **Kobo side:** the open-source [trmnl-kobo](https://github.com/usetrmnl/trmnl-kobo) client, pointed at your GitHub Pages site instead of TRMNL's servers

Everything here runs free on a **public** GitHub repo. Your addresses and calendar link are stored as encrypted GitHub secrets, never in the code.

---

## Part 1: Put it on GitHub (about 10 minutes)

1. Create a free account at github.com if you don't have one.
2. Create a **new public repository** named `kobo-dash`.
3. Upload every file in this folder except `dashboard.yml` with *Add file → Upload files*. Then click *Add file → Create new file*, name it `.github/workflows/dashboard.yml`, paste in the contents of `dashboard.yml`, and commit.
4. In the repo, go to **Settings → Pages**. Under *Build and deployment → Source*, choose **GitHub Actions**.
5. Go to **Settings → Secrets and variables → Actions → New repository secret** and add whichever of these you want:

| Secret | What to put in it |
|---|---|
| `TOMTOM_API_KEY` | Free key from developer.tomtom.com (sign up, then *Keys* in your dashboard) |
| `HOME_ADDRESS` | e.g. `123 Queen St W, Toronto` |
| `WORK_ADDRESS` | e.g. `100 King St W, Toronto` |
| `CALENDAR_ICS_URLS` | Google Calendar: *Settings → (your calendar) → Integrate calendar → Secret address in iCal format*. Separate several links with commas. |
| `SITE_KEY` | *(Recommended)* Any random word like `k7m2xq9`. Your dashboard image is then served from a hidden address that nobody can guess. |

6. Open the **Actions** tab, click **Build dashboard → Run workflow**. After about 2 minutes your dashboard is live at
   `https://YOUR-USERNAME.github.io/kobo-dash/SITE_KEY/dashboard.png`. Leave out `SITE_KEY/` if you didn't set one.

After that it rebuilds itself every 15 minutes.

## Part 2: Phone settings page

1. Make a token at **github.com → Settings → Developer settings → Fine-grained tokens → Generate new token**:
   * Repository access: **Only select repositories → kobo-dash**
   * Permissions: **Contents: Read and write**, **Actions: Read and write**
2. On your phone, open `https://YOUR-USERNAME.github.io/kobo-dash/settings.html`, paste the token, and tap Connect. If you set a `SITE_KEY`, add it under *Advanced*.
3. Use **Share → Add to Home Screen** so it opens like an app.

From the settings page you can change the location, units, widget order, commute routes, news feeds, calendar range, refresh rate and screen rotation. Saving commits `config.json` and a new screen appears about 2 minutes later.

## Part 3: Set up the Kobo Mini (about 15 minutes)

> The Kobo Mini keeps its system on an internal microSD card. If you're comfortable opening it, copy that card first and you can always restore it. Otherwise these mods are easy to undo: delete the files and reboot.

1. **Update the Kobo** to its latest firmware by syncing it over Wi-Fi first, and make sure Wi-Fi is set up.
2. Download the files listed in the [trmnl-kobo readme](https://github.com/usetrmnl/trmnl-kobo). Its repo bundles copies under `doc/distrib/`, or get them from each project:
   * **NickelMenu** (`KoboRoot.tgz`)
   * **kobo-stuff** (`kobo-stuff-*.tar.xz`, which contains a `KoboRoot.tgz`)
   * the latest **trmnl-kobo release** (a `TRMNL` folder plus `TRMNL.ini`)
3. Plug the Kobo into your computer. Turn on hidden files on your computer so you can see the `.kobo` and `.adds` folders.
4. Copy NickelMenu's `KoboRoot.tgz` into `.kobo/`, then eject. The Kobo installs it and reboots.
5. Plug it in again. Extract `KoboRoot.tgz` from the kobo-stuff archive, copy it into `.kobo/`, then eject and let it reboot.
6. Plug it in again. Copy the `TRMNL` folder to `.adds/TRMNL/` and `TRMNL.ini` to `.adds/nm/`.
7. Replace `.adds/TRMNL/config.json` with `kobo-config.json` from this repo (rename it to `config.json`), and edit **TrmnlApiUrl**:
   * `https://YOUR-USERNAME.github.io/kobo-dash/SITE_KEY` (or without `/SITE_KEY` if you didn't set one)
   * No slash at the end. The Kobo adds `/display` itself.
8. Eject. On the Kobo, tap the new **NickelMenu** menu (bottom-right on the home screen) → **TRMNL**.

**To stop the dashboard:** press the power button to wake it, then hold power until the light flashes blue. The Kobo reboots into normal reading mode.

**Power:** Between refreshes the Kobo sleeps with Wi-Fi off, so a 30- or 60-minute refresh lasts much longer on battery. For an always-on wall display, keep it plugged in.

**Screen sideways or upside-down?** Change **Rotation** in the settings page.

## Customizing further

* `config.json` holds all settings. You can edit it on github.com or through the settings page.
* `template.mjs` controls the layout and styles (600×800 px). Try a layout locally with `npm install && npm run demo` (uses sample data), then open `site/dashboard.png`.
* `weather.mjs`, `commute.mjs`, `calendar.mjs` and `news.mjs` each fetch one data source, so adding a new widget (TTC arrivals, stocks, sports scores) means a new source file plus a block in the template.

## Things to know

* GitHub's 15-minute schedule is best-effort and runs can be 5–15 minutes late at busy times. Combined with Pages caching, the screen can be up to about 30 minutes behind.
* GitHub pauses scheduled workflows on repos with no commits for 60 days. The workflow adds an empty commit about once a month so this never happens.
* Anything in `config.json` is public. Keep addresses in secrets and use `$HOME_ADDRESS` / `$WORK_ADDRESS` in routes.
