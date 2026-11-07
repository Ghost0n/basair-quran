# Wraps the artifact-form index.html in a full document for local preview (local.html).
s = open('index.html', encoding='utf-8').read()
head, _, body = s.partition('<div class="app"')
out = ('<!doctype html>\n<html dir="rtl" lang="ar"><head><meta charset="utf-8">'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
       '<link rel="icon" href="data:,"><style>body{margin:0}</style>\n' + head + '</head><body>\n<div class="app"' + body + '\n</body></html>\n')
open('local.html', 'w', encoding='utf-8').write(out)
