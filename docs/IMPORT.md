# Import projects from JSON

Write a project as a JSON file instead of typing it into the editor. The command runs **on the server**, so there is no login or token: whoever can run it already controls the box. Every value goes through the same checks and the same HTML cleaner as the editor, and the result opens and edits in the editor like a project typed by hand.

## Where to put the files (on the server)

Compose mounts the folder `import/` next to `devops/` into the app container as `/import` (read-only).

```bash
mkdir -p ~/vie-portfolio-v2/import/images      # once, as your normal user (not root)
cd ~/vie-portfolio-v2/devops && docker compose up -d   # once: picks up the new mount
```

Upload with WinSCP into `/home/<user>/vie-portfolio-v2/import/`:

```
import/
  pocketwise.json
  images/
    cover.jpg
    sketch.jpg
    screen-1.jpg
```

The `import/` folder is git-ignored and kept out of the Docker build, so pictures and drafts never end up in the repo or the image.

## Run it

Check first (reads everything, writes nothing):

```bash
cd ~/vie-portfolio-v2/devops
docker compose exec -T app node scripts/import-project.ts /import/pocketwise.json --dry-run
```

Then for real:

```bash
docker compose exec -T app node scripts/import-project.ts /import/pocketwise.json
```

It prints one line per project (`created` or `updated`, the slug, its status, how many pictures) and then the URLs to purge in Cloudflare. Public pages are cached for a day, so purge `/`, `/projects`, `/projects/<slug>` and `/sitemap.xml` (Caching > Configuration > Purge Cache), then run the **Warm CDN cache** workflow.

From your own computer, without uploading anything to the server first (pictures must already be on the server, named by their path inside the container):

```bash
ssh malviexd@139.190.106.68 "cd ~/vie-portfolio-v2/devops && docker compose exec -T app node scripts/import-project.ts - --media-dir /import" < pocketwise.json
```

## Rules

- A file is one project, a list of projects, or `{"projects": [...]}`.
- **Re-running is safe.** Projects are matched by `slug` (made from the title when you leave it out), so the same file updates the same project. The same picture is stored once, however many times it is named.
- **Only the fields you write change.** `{"slug": "pocketwise", "status": "draft"}` unpublishes it and leaves everything else alone. A new project needs a `title`.
- New projects are **drafts** unless you write `"status": "published"`.
- A misspelt field is refused with a suggestion (`smmary` → did you mean `summary`?). Nothing is written for a project that fails; the other projects before it in the file stay done.
- Pictures are looked up **relative to the JSON file** (or `--media-dir`). They are checked, shrunk to WebP and stripped of location data, like an upload. You can also name a picture already in the media library by its stored file name.

## Fields

| Field | Notes |
|---|---|
| `slug` | page address, letters, numbers and dashes |
| `title` | up to 120 characters |
| `summary` | up to 140 characters |
| `kind`, `role` | up to 120 characters each |
| `stack` | up to 200 characters |
| `tags` | up to 12, each up to 30 characters |
| `live_url`, `src_url` | must start with `http://` or `https://` |
| `started`, `finished` | a month, like `2026-04` |
| `featured` | `true` or `false` |
| `status` | `draft` or `published` |
| `cover`, `cover_alt` | picture file for the project card, and its description (`"cover": null` removes it) |
| `story` | a list of blocks (below) |
| `story_html` | ready-made HTML instead of `story`; cleaned like the editor's. Use one or the other |

## Story blocks

Each block has exactly one main key. Text accepts a little Markdown: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `==highlight==` and `[link](https://example.com)`. Everything else is plain text, so `<` and `&` are safe.

| Block | Example |
|---|---|
| heading | `{"h2": "The problem"}`, `{"h3": "A smaller heading"}` |
| paragraph | `{"p": "Text with **bold** and a [link](https://example.com)."}` |
| list | `{"ul": ["one", "two"]}`, `{"ol": ["first", "second"]}` |
| quote | `{"quote": "Just tell me if we can afford dinner."}` |
| big number | `{"stat": "40%", "text": "fewer people leave in week one"}` |
| callout | `{"callout": "Open source.", "kind": "tip"}` (`note`, `tip`, `warn`; a list of strings makes several paragraphs) |
| code | `{"code": "const x = 1", "lang": "ts"}` |
| picture | `{"image": "images/a.jpg", "alt": "what it shows", "caption": "optional", "narrow": true}` |
| gallery | `{"gallery": ["images/a.jpg", {"image": "images/b.jpg", "alt": "…"}]}` (1 to 12) |
| table | `{"table": {"head": ["A", "B"], "rows": [["1", "2"]]}}` |
| divider | `{"rule": true}` |
| raw HTML | `{"html": "<p>…</p>"}` (cleaned like everything else) |

Give every picture an `alt` (or a `caption`): the import prints a warning for pictures without one. Videos are not supported yet; add them in the editor.

A complete example with every block type is in [`examples/project.example.json`](examples/project.example.json).

## If something goes wrong

- `Import stopped: … unknown field` / `… needs text` / `… not found`: the message names the project and the block (`story[3]`) to fix.
- `no such file`: the path is the one **inside the container**, so `/import/…`, not your home folder.
- Nothing shows on the site after a successful import: the page is cached; purge it.
