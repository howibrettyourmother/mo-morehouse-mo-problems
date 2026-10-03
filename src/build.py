import base64,json,os
D=os.path.dirname(os.path.abspath(__file__));H='/tmp/ntw';OUT=f'{D}/../index.html'
t=open(f'{D}/template.html').read();eng=open(f'{D}/engine.js').read()
rows=[l.split('|') for l in open(f'{D}/heckles.txt').read().strip().split('\n') if l.strip()]
HK=[];clips={}
for k,txt,tts,g,ch in rows:
    e={'k':k,'t':txt,'g':g}
    if tts: e['s']=tts
    if ch: e['chant']=1
    HK.append(e)
    clips[k]=base64.b64encode(open(f'{H}/{k}.mp3','rb').read()).decode()
silent=base64.b64encode(open(f'{H}/silent.mp3','rb').read()).decode()
audio=('const HECKLE_CLIPS='+json.dumps(clips,separators=(',',':'))+';\nconst SILENT_MP3="data:audio/mpeg;base64,'+silent+'";\nconst HECKLES='+json.dumps(HK,separators=(',',':'))+';\n'+eng+'''
const muteBtn=document.getElementById('muteBtn'),musicBtn=document.getElementById('musicBtn');
function updMute(){muteBtn.innerHTML=AUD.muted?'&#128263;':'&#128266;';muteBtn.style.opacity=AUD.muted?0.6:1;musicBtn.style.opacity=AUD.musicOn&&!AUD.muted?1:0.4;musicBtn.style.textDecoration=AUD.musicOn?'none':'line-through'}
muteBtn.addEventListener('click',e=>{e.stopPropagation();AUD.unlock();AUD.setMuted(!AUD.muted);updMute()});
musicBtn.addEventListener('click',e=>{e.stopPropagation();AUD.unlock();AUD.setMusic(!AUD.musicOn);updMute()});
['pointerdown','touchstart'].forEach(ev=>{muteBtn.addEventListener(ev,e=>e.stopPropagation());musicBtn.addEventListener(ev,e=>e.stopPropagation())});
updMute();
''')
t=t.replace('/*__AUDIO__*/',audio).replace('__PHOTO__',base64.b64encode(open(f'{D}/photo.jpg','rb').read()).decode()).replace('__FACE__',base64.b64encode(open(f'{D}/weasel_sprite.png','rb').read()).decode())
open(OUT,'w').write(t);print(len(t),'bytes,',len(clips),'clips')
