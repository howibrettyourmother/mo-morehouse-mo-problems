# Renders the MMP crest app icon (canvas in headless Chrome) -> apple-touch-icon / 192 / 512 / favicons, og.png and icon-preview.png
import asyncio,base64,os
from playwright.async_api import async_playwright
from PIL import Image
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS=r"""
function crest(ctx,S){const k=S/512;ctx.save();ctx.scale(k,k);
 const bg=ctx.createRadialGradient(256,230,40,256,256,380);bg.addColorStop(0,'#3b1060');bg.addColorStop(1,'#0b0314');ctx.fillStyle=bg;ctx.fillRect(0,0,512,512);
 // gold rays
 ctx.save();ctx.translate(256,250);for(let i=0;i<16;i++){ctx.rotate(Math.PI/8);ctx.fillStyle=i%2?'rgba(255,212,0,.10)':'rgba(255,47,168,.08)';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-40,-400);ctx.lineTo(40,-400);ctx.fill()}ctx.restore();
 // shield
 function shield(){ctx.beginPath();ctx.moveTo(256,92);ctx.quadraticCurveTo(340,120,420,112);ctx.lineTo(420,250);ctx.quadraticCurveTo(416,380,256,462);ctx.quadraticCurveTo(96,380,92,250);ctx.lineTo(92,112);ctx.quadraticCurveTo(172,120,256,92);ctx.closePath()}
 ctx.save();ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=24;ctx.shadowOffsetY=10;shield();const g=ctx.createLinearGradient(0,92,0,462);g.addColorStop(0,'#ff3b3b');g.addColorStop(1,'#8a0c12');ctx.fillStyle=g;ctx.fill();ctx.restore();
 shield();ctx.lineWidth=18;const gg=ctx.createLinearGradient(0,90,0,460);gg.addColorStop(0,'#fff2a0');gg.addColorStop(.5,'#ffc400');gg.addColorStop(1,'#b07800');ctx.strokeStyle=gg;ctx.stroke();ctx.lineWidth=4;ctx.strokeStyle='#5a3a00';ctx.stroke();
 // crown
 ctx.save();ctx.translate(256,72);ctx.beginPath();ctx.moveTo(-70,30);ctx.lineTo(-80,-34);ctx.lineTo(-38,-2);ctx.lineTo(0,-50);ctx.lineTo(38,-2);ctx.lineTo(80,-34);ctx.lineTo(70,30);ctx.closePath();ctx.fillStyle=gg;ctx.fill();ctx.lineWidth=6;ctx.strokeStyle='#5a3a00';ctx.stroke();
 ctx.fillStyle='#e3262e';for(const[x,y]of[[-80,-34],[0,-50],[80,-34]]){ctx.beginPath();ctx.arc(x,y,9,0,7);ctx.fill();ctx.stroke()}ctx.restore();
 // MMP
 ctx.save();ctx.translate(256,232);ctx.rotate(-0.06);ctx.font='900 150px Impact, "Arial Black", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.lineJoin='round';ctx.lineWidth=22;ctx.strokeStyle='#000';ctx.strokeText('MMP',0,0);ctx.fillStyle='#fff';ctx.fillText('MMP',0,0);ctx.restore();
 // football
 ctx.save();ctx.translate(256,360);ctx.rotate(-0.35);ctx.beginPath();ctx.ellipse(0,0,78,44,0,0,7);const fb=ctx.createLinearGradient(0,-44,0,44);fb.addColorStop(0,'#a4572a');fb.addColorStop(1,'#5a2a0e');ctx.fillStyle=fb;ctx.fill();ctx.lineWidth=7;ctx.strokeStyle='#2a1204';ctx.stroke();
 ctx.strokeStyle='#fff';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-30,0);ctx.lineTo(30,0);ctx.stroke();for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*12,-11);ctx.lineTo(i*12,11);ctx.stroke()}
 ctx.beginPath();ctx.moveTo(-62,-18);ctx.quadraticCurveTo(-56,0,-62,18);ctx.moveTo(62,-18);ctx.quadraticCurveTo(56,0,62,18);ctx.stroke();ctx.restore();
 // big tear
 ctx.save();ctx.translate(392,300);ctx.beginPath();ctx.moveTo(0,-62);ctx.bezierCurveTo(16,-30,40,0,40,22);ctx.arc(0,22,40,0,Math.PI);ctx.bezierCurveTo(-40,0,-16,-30,0,-62);ctx.closePath();
 const tg=ctx.createLinearGradient(-30,-60,30,60);tg.addColorStop(0,'#bff4ff');tg.addColorStop(1,'#1e9bff');ctx.fillStyle=tg;ctx.fill();ctx.lineWidth=7;ctx.strokeStyle='#05305a';ctx.stroke();
 ctx.fillStyle='rgba(255,255,255,.85)';ctx.beginPath();ctx.ellipse(-14,14,7,13,0.3,0,7);ctx.fill();ctx.restore();
 ctx.restore()}
"""
PAGE="<html><body style='margin:0;background:#000'><canvas id=c></canvas><script>"+JS+"</script></body></html>"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome');pg=await b.new_page();await pg.set_content(PAGE)
        async def icon(S,name):
            d=await pg.evaluate("S=>{const c=document.getElementById('c');c.width=c.height=S;crest(c.getContext('2d'),S);return c.toDataURL('image/png')}",S)
            open(os.path.join(ROOT,name),'wb').write(base64.b64decode(d.split(',')[1]))
        for S,n in [(512,'icon-512.png'),(192,'icon-192.png'),(180,'apple-touch-icon.png'),(32,'favicon-32.png')]:await icon(S,n)
        # og.png: logo left + real title screenshot right
        title='data:image/png;base64,'+base64.b64encode(open(os.path.join(ROOT,'screenshot-title.png'),'rb').read()).decode()
        og=f"""<html><body style='margin:0'><canvas id=o width=1200 height=630></canvas><script>{JS}
        const o=document.getElementById('o'),x=o.getContext('2d');const bg=x.createLinearGradient(0,0,1200,630);bg.addColorStop(0,'#2a0c44');bg.addColorStop(1,'#0b0314');x.fillStyle=bg;x.fillRect(0,0,1200,630);
        const ic=document.createElement('canvas');ic.width=ic.height=360;crest(ic.getContext('2d'),360);x.save();x.beginPath();x.roundRect(40,40,360,360,60);x.clip();x.drawImage(ic,40,40);x.restore();
        x.textAlign='center';x.lineJoin='round';x.font='900 58px Impact,"Arial Black",sans-serif';x.lineWidth=10;x.strokeStyle='#000';x.strokeText('MOREHOUSE',220,470,400);x.fillStyle='#ff3b3b';x.fillText('MOREHOUSE',220,470,400);
        x.strokeText('MORE PROBLEMS',220,535,400);x.fillStyle='#ffd400';x.fillText('MORE PROBLEMS',220,535,400);x.font='700 24px Arial';x.fillStyle='#fff';x.fillText("SURVIVE JOE'S REBUILD",220,580);
        const im=new Image();im.onload=()=>{{const h=580,w=im.width*h/im.height;x.save();x.shadowColor='rgba(0,0,0,.7)';x.shadowBlur=30;x.fillStyle='#000';x.fillRect(1160-w-6,19,w+12,h+12);x.restore();x.drawImage(im,1160-w,25,w,h);document.title='ok'}};im.src='{title}';</script></body></html>"""
        open('/tmp/og.html','w').write(og);pg2=await b.new_page();await pg2.goto('file:///tmp/og.html');await pg2.wait_for_function("document.title==='ok'")
        d=await pg2.evaluate("document.getElementById('o').toDataURL('image/png')");open(os.path.join(ROOT,'og.png'),'wb').write(base64.b64decode(d.split(',')[1]))
        await b.close()
    for n in ['icon-512.png','icon-192.png','apple-touch-icon.png','favicon-32.png','og.png']:
        im=Image.open(os.path.join(ROOT,n)).convert('RGB');im.save(os.path.join(ROOT,n),optimize=True)  # strip alpha (iOS needs opaque)
    Image.open(os.path.join(ROOT,'icon-512.png')).save(os.path.join(ROOT,'favicon.ico'),sizes=[(16,16),(32,32),(48,48)])
    # preview sheet: sizes + a fake iOS home-screen tile
    big=Image.open(os.path.join(ROOT,'icon-512.png'));sheet=Image.new('RGB',(900,560),(24,24,30));x=20
    for S in [512,180,120,60,32]:
        im=big.resize((S,S),Image.LANCZOS);mask=Image.new('L',(S,S),0)
        from PIL import ImageDraw;ImageDraw.Draw(mask).rounded_rectangle([0,0,S-1,S-1],radius=int(S*0.22),fill=255);sheet.paste(im,(x,20+(512-S)//2 if S<512 else 20),mask);x+=S+20
    from PIL import ImageDraw;dr=ImageDraw.Draw(sheet);dr.text((20,540),'MMP app icon: 512 / 180 (apple-touch) / 120 / 60 / 32, rounded like iOS',fill=(220,220,220))
    sheet.save(os.path.join(ROOT,'icon-preview.png'))
asyncio.run(main())
