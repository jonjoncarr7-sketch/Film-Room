# usage: python3 site_wrap.py in.html out.html
# Adds the document head a standalone host needs (doctype, charset, phone viewport).
# The Claude artifact host adds these itself; Netlify does not.
import sys
src, dst = sys.argv[1:3]
html = open(src, encoding='utf-8').read()
if '<!doctype' not in html[:200].lower():
    head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<meta name="theme-color" content="#0d0f12">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-title" content="Film Room">\n</head>\n<body>\n')
    html = head + html + '\n</body>\n</html>\n'
open(dst, 'w', encoding='utf-8').write(html)
