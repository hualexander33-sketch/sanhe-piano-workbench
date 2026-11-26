"""Package the existing frontend for a repository subpath, without changing its templates or design."""
from pathlib import Path
import os,re,shutil,sys,zipfile
source,out=map(Path,sys.argv[1:3])
out.mkdir(parents=True,exist_ok=True)
assets=out/'assets'
assets.mkdir(exist_ok=True)
commit=os.environ.get('GITHUB_SHA','')
version='?v='+commit if re.fullmatch(r'[0-9a-f]{7,64}',commit) else ''
for file in (source/'web').iterdir():
    if not file.is_file() or file.name=='index.html':
        continue
    if file.suffix in ('.css','.js'):
        # URLs are relative to the document in HTML markup, and to assets/ in the stylesheet.
        prefix='./' if file.suffix=='.css' else './assets/'
        content=file.read_text().replace('/assets/',prefix)
        if version and file.suffix=='.js':
            content=re.sub(r"""((?:from|import)\s*['"]\./[\w.-]+\.js)(['"])""",
                           lambda match: match[1]+version+match[2],content)
        (assets/file.name).write_text(content)
    else:
        shutil.copyfile(file,assets/file.name)
html=(source/'web/index.html').read_text().replace('/assets/','./assets/').replace('src="./assets/app.js"','src="./host.js"')
html=html.replace('./host.js"', './host.js'+version+'"').replace('./assets/style.css"', './assets/style.css'+version+'"')
html=html.replace('./assets/workspace.css"', './assets/workspace.css'+version+'"')
(out/'index.html').write_text(html)
pointer=source/'editor-endpoint.json'
if pointer.is_file():
    shutil.copyfile(pointer,out/pointer.name)
here=Path(__file__).parent
for f in ('host.js','queries.js'):
    shutil.copyfile(here/f,out/f)
(out/'robots.txt').write_text('User-agent: *\nDisallow: /\n')
with zipfile.ZipFile(out/'reports.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
    for name in ('__init__','common','catalog','lessons','settlements','reports','public_view'):
        z.write(source/f'server/{name}.py',f'server/{name}.py')
