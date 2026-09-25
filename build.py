import glob, os, re, sys
src = sorted(glob.glob('src/*.js')); css = sorted(glob.glob('src/*.css'))
shell = open('shell.html').read()
js = '\n'.join(open(f).read() for f in src) + '\nApp.start();\n'
js = js.replace('if (typeof module !== \'undefined\') module.exports = PipeSim;', '')
cs = '\n'.join(open(f).read() for f in css)
out = shell.replace('/*CHAPTER_CSS*/', cs).replace('/*JS*/', js)
dst = sys.argv[1] if len(sys.argv) > 1 else 'memory_end_to_end.html'
open(dst, 'w').write(out)
print('built', dst, len(out)//1024, 'KB from', len(src), 'js +', len(css), 'css')
