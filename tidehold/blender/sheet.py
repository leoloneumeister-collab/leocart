"""Stitch preview PNGs into a grid:  python sheet.py out.png [cols=N] a.png b.png ..."""
import sys
from PIL import Image

args = sys.argv[1:]
out = args[0]
cols = 0
names = []
for a in args[1:]:
    if a.startswith('cols='):
        cols = int(a[5:])
    else:
        names.append(a)
ims = [Image.open(n).convert('RGB') for n in names]
cols = cols or len(ims)
rows = (len(ims) + cols - 1) // cols
cw = max(i.width for i in ims)
ch = max(i.height for i in ims)
sheet = Image.new('RGB', (cw * cols, ch * rows))
for k, im in enumerate(ims):
    sheet.paste(im, ((k % cols) * cw, (k // cols) * ch))
sheet.save(out)
print(out, sheet.size)
