"""Package the existing frontend for a repository subpath, without changing its templates or design."""
from pathlib import Path
import shutil,sys,zipfile
source,out=map(Path,sys.argv[1:3])
out.mkdir(parents=True,exist_ok=True)
assets=out/'assets'
assets.mkdir(exist_ok=True)
for file in (source/'web').iterdir():
    if not file.is_file() or file.name=='index.html':
        continue
    if file.suffix in ('.css','.js'):
        # URLs are relative to the document in HTML markup, and to assets/ in the stylesheet.
        prefix='./' if file.suffix=='.css' else './assets/'
        (assets/file.name).write_text(file.read_text().replace('/assets/',prefix))
    else:
        shutil.copyfile(file,assets/file.name)
html=(source/'web/index.html').read_text().replace('/assets/','./assets/').replace('src="./assets/app.js"','src="./host.js"')
(out/'index.html').write_text(html)
here=Path(__file__).parent
for f in ('host.js','queries.js'):
    shutil.copyfile(here/f,out/f)
(out/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
with zipfile.ZipFile(out/'reports.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
    for name in ('__init__','common','catalog','lessons','settlements','reports','public_view'):
        z.write(source/f'server/{name}.py',f'server/{name}.py')
