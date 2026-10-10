import sys
# usage: python3 assemble.py shell.html film.json app.js out.html
shell, data, app, out = sys.argv[1:5]
h = open(shell).read()
h = h.replace('__DATA__', open(data).read().replace('</', '<\\/'), 1).replace('__APP__', open(app).read(), 1)
open(out, 'w').write(h)
print('wrote', out, len(h))
