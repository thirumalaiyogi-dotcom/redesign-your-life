from PIL import Image, ImageDraw, ImageFilter
src=Image.open('/mnt/user-data/attachments/e350d3ca-7650-581b-a00c-03e3abbbeeea/400ecc9d-image.png').convert('RGBA')
box=(95,200,1195,880); L=src.crop(box); lw,lh=L.size
m=Image.new('L',(lw,lh),0); f=40
ImageDraw.Draw(m).rectangle((f,f,lw-f,lh-f),fill=255); m=m.filter(ImageFilter.GaussianBlur(f/2.5))
def bg(size):
    im=Image.new('RGBA',(size,size)); px=im.load(); c=size/2
    for y in range(size):
        for x in range(size):
            d=min(1,((x-c)**2+(y-c*1.05)**2)**.5/(size*0.62))
            a=(10,72,32); b=(1,30,14)
            px[x,y]=tuple(int(a[i]+(b[i]-a[i])*d) for i in range(3))+(255,)
    return im
def make(size,width):
    im=bg(size); s=width/lw; l=L.resize((int(lw*s),int(lh*s)),Image.LANCZOS); mm=m.resize(l.size,Image.LANCZOS)
    im.paste(l,((size-l.size[0])//2,(size-l.size[1])//2),mm); return im
def rounded(im,r):
    mk=Image.new('L',im.size,0); ImageDraw.Draw(mk).rounded_rectangle((0,0,im.size[0]-1,im.size[1]-1),radius=r,fill=255); im.putalpha(mk); return im
O='/home/claude/redesign-your-life/assets/icons/'
make(512,420).save(O+'maskable-512.png')
make(180,168).convert('RGB').save(O+'apple-touch-icon.png')
rounded(make(512,450),110).save(O+'icon-512.png')
rounded(make(192,170),42).save(O+'icon-192.png')
rounded(make(96,92),20).save(O+'logo-96.png')
p=Image.new('RGB',(700,230),(200,180,230)); mk=make(512,420).resize((200,200))
c=Image.new('L',(200,200),0); ImageDraw.Draw(c).ellipse((0,0,199,199),fill=255); p.paste(mk,(10,15),c)
q=Image.new('L',(200,200),0); ImageDraw.Draw(q).rounded_rectangle((0,0,199,199),radius=50,fill=255); p.paste(mk,(240,15),q)
a=Image.open(O+'icon-512.png').resize((200,200)); p.paste(a,(470,15),a)
p.save('maskprev.png')
