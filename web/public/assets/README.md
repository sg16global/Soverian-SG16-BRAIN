# Brand assets — verbatim delivery

Every file in this directory is served byte-for-byte by the sovereign host
(`/assets/<name>`). Nothing is cropped, filtered or restyled by the UI.

## Drop-in mapping for the official artwork

Place the original files here (any of the names in each row work — the UI
probes them in order and uses the first one that exists):

| Original file | Served as | Used for |
|---|---|---|
| `IMG_2768.PNG` | `logo.png` (or keep its own name) | top-centre emblem, top bar, footer |
| `IMG_2764.JPEG` | `stage.jpg` (or keep its own name) | full-screen cinematic crimson stage matrix |
| `IMG_2765.PNG` | any name | official public dashboard design reference |

The current `logo.png` / `stage.jpg` are faithful recreations used only until
the originals are dropped in. Once an original lands under either name, it
renders exactly as provided — the CSS applies size only, never style.
