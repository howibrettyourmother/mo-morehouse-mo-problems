const AUD=(()=>{
  let C=null,master,comp,musicBus,musicDuck,sfxBus,crowdBus,voiceBus,verb,verbSend,delay,noiseBuf,pinkBuf;
  let unlocked=false,muted=localStorage.getItem('nw_muted')==='1',musicOn=localStorage.getItem('nw_music')!=='0';
  let stats={n:0,clip:0,speech:0,last:''},unlockedAt=0,silentEl=null,clips={},clipsLoading=false,speechPrimed=false,lastHeckle=0,recent=[],errors=0;
  const R=Math.random,rr=(a,b)=>a+R()*(b-a),pick=a=>a[(R()*a.length)|0];
  const now=()=>C?C.currentTime:0;
  try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}
  function safe(fn){return function(){try{if(!C||muted)return;return fn.apply(null,arguments)}catch(e){errors++;if(errors<5)console.warn('audio',e)}}}
  function build(){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    C=new AC();
    master=C.createGain();master.gain.value=muted?0:0.9;
    comp=C.createDynamicsCompressor();comp.threshold.value=-14;comp.knee.value=12;comp.ratio.value=4;comp.attack.value=0.004;comp.release.value=0.2;
    master.connect(comp);comp.connect(C.destination);
    const bus=v=>{const g=C.createGain();g.gain.value=v;g.connect(master);return g};
    musicBus=bus(musicOn?0.42:0);musicDuck=C.createGain();musicDuck.connect(musicBus);
    sfxBus=bus(0.75);crowdBus=bus(0.85);voiceBus=bus(1.1);
    // noise buffers
    const sr=C.sampleRate;noiseBuf=C.createBuffer(1,sr*2,sr);let d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=R()*2-1;
    pinkBuf=C.createBuffer(1,sr*4,sr);d=pinkBuf.getChannelData(0);let b0=0,b1=0,b2=0;
    for(let i=0;i<d.length;i++){const w=R()*2-1;b0=0.997*b0+w*0.029591;b1=0.985*b1+w*0.032534;b2=0.95*b2+w*0.048056;d[i]=(b0+b1+b2+w*0.1)*0.9}
    // stadium reverb
    verb=C.createConvolver();const L=Math.floor(sr*1.8),ir=C.createBuffer(2,L,sr);
    for(let c=0;c<2;c++){const x=ir.getChannelData(c);for(let i=0;i<L;i++)x[i]=(R()*2-1)*Math.pow(1-i/L,3.2)*(i<sr*0.012?0:1)}
    verb.buffer=ir;verbSend=C.createGain();verbSend.gain.value=0.5;verbSend.connect(verb);verb.connect(master);
    // music echo
    delay=C.createDelay(1);delay.delayTime.value=0.3;const fb=C.createGain();fb.gain.value=0.25;const dm=C.createGain();dm.gain.value=0.18;
    musicDuck.connect(delay);delay.connect(fb);fb.connect(delay);delay.connect(dm);dm.connect(musicBus);
    startAmbience();
    {const L=sr*3,cb=C.createBuffer(1,L,sr),x=cb.getChannelData(0);for(let i=0;i<L;i++){x[i]=(R()*2-1)*0.02;if(R()<0.0009)x[i]+=(R()*2-1)*0.9}
     crackleG=C.createGain();crackleG.gain.value=0;crackleG.connect(musicBus);const cs=C.createBufferSource();cs.buffer=cb;cs.loop=true;cs.connect(filt('highpass',900,0.7,crackleG));cs.start()}
    setInterval(schedule,25);
  }
  // ---- iOS-safe unlock: call from every gesture (touchstart/touchend/click/keydown) ----
  function unlock(){
    try{
      if(!C)build();if(!C)return;
      try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}
      if(C.state!=='running')C.resume().catch(()=>{});
      // silent buffer kick (old iOS needs a source started inside the gesture)
      const s=C.createBufferSource();s.buffer=C.createBuffer(1,1,22050);s.connect(C.destination);s.start(0);
      // looping silent <audio> forces the 'playback' audio session => plays even with the ringer/silent switch on
      if(!silentEl){silentEl=document.createElement('audio');silentEl.setAttribute('playsinline','');silentEl.setAttribute('webkit-playsinline','');
        silentEl.setAttribute('x-webkit-airplay','deny');silentEl.preload='auto';silentEl.loop=true;silentEl.src=SILENT_MP3;silentEl.volume=0.01;}
      if(silentEl.paused&&!document.hidden){const p=silentEl.play();if(p&&p.catch)p.catch(()=>{})}
      // prime speechSynthesis inside the gesture (iOS requires the first speak() be user-initiated)
      if(!speechPrimed&&'speechSynthesis' in window){speechPrimed=true;try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u);speechSynthesis.getVoices()}catch(e){}}
      if(!unlocked){unlocked=true;unlockedAt=performance.now();loadClips()}
    }catch(e){console.warn('unlock',e)}
  }
  ['touchstart','touchend','pointerdown','mousedown','click','keydown'].forEach(ev=>window.addEventListener(ev,unlock,{capture:true,passive:true}));
  document.addEventListener('visibilitychange',()=>{
    if(!C)return;
    if(document.hidden){C.suspend&&C.suspend().catch(()=>{});silentEl&&silentEl.pause();try{speechSynthesis.cancel()}catch(e){}}
    else if(unlocked){C.resume().catch(()=>{});if(silentEl){const p=silentEl.play();p&&p.catch&&p.catch(()=>{})}}
  });
  function loadClips(){
    if(clipsLoading)return;clipsLoading=true;
    for(const k in HECKLE_CLIPS){
      try{const bin=atob(HECKLE_CLIPS[k]);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
        const ok=b=>{clips[k]=b},bad=()=>{};
        const p=C.decodeAudioData(u.buffer,ok,bad);if(p&&p.catch)p.catch(bad);
      }catch(e){}
    }
  }
  // ---- primitives ----
  function env(g,t,a,h,r,v){g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.setValueAtTime(v,t+a+h);g.gain.exponentialRampToValueAtTime(0.0001,t+a+h+r)}
  function osc(type,f,t,dur,out){const o=C.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);o.connect(out);o.start(t);o.stop(t+dur+0.05);return o}
  function gain(v,out){const g=C.createGain();g.gain.value=v;g.connect(out);return g}
  function filt(type,f,q,out){const x=C.createBiquadFilter();x.type=type;x.frequency.value=f;x.Q.value=q||0.7;x.connect(out);return x}
  function noiseSrc(t,dur,out,buf){const s=C.createBufferSource();s.buffer=buf||noiseBuf;s.loop=true;s.connect(out);s.start(t,R()*1.5);s.stop(t+dur+0.05);return s}
  function shaper(amt,out){const w=C.createWaveShaper(),n=1024,cv=new Float32Array(n);for(let i=0;i<n;i++){const x=i/n*2-1;cv[i]=Math.tanh(x*amt)}w.curve=cv;w.connect(out);return w}
  const toneRaw=(f,d0,type,v,slide,delay,out)=>{const d=d0||0.1;const t=now()+(delay||0);const g=gain(0,out||sfxBus);env(g,t,0.004,d*0.3,d*0.7,v||0.06);
    const o=osc(type||'square',f,t,d,g);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t+d)};
  const noiseRaw=(d,v,ft,freq,delay,q,out)=>{const t=now()+(delay||0);const g=gain(0,out||sfxBus);env(g,t,d*0.15,0,d*0.85,v);noiseSrc(t,d,filt(ft||'bandpass',freq||1000,q||0.8,g))};
  // ---- crowd voices: band-limited buzz through vowel formants ----
  const VOWEL={oo:[[310,7,1],[780,8,0.35],[2300,9,0.05]],ah:[[760,5,1],[1250,6,0.6],[2600,8,0.2]],oh:[[480,6,1],[880,7,0.45],[2500,9,0.08]],eh:[[560,6,1],[1800,8,0.5],[2600,9,0.2]]};
  function formantBank(vowel,out){const inp=C.createGain();for(const[f,q,g]of VOWEL[vowel]){const x=filt('bandpass',f,q,gain(g*3.2,out));inp.connect(x)}return inp}
  function crowdVoices(o){
    const t0=now()+(o.delay||0),out=gain(o.vol,crowdBus);out.connect(verbSend);
    const bank=formantBank(o.vowel,out);
    for(let i=0;i<o.n;i++){
      const st=t0+R()*o.spread,f=rr(o.fmin,o.fmax),dur=o.dur*rr(0.75,1.2);
      const g=C.createGain();g.connect(bank);env(g,st,o.attack*rr(0.7,1.3),dur*0.55,dur*0.45,rr(0.5,1));
      const v=osc('sawtooth',f*(o.start||1),st,dur+o.attack,g);
      v.frequency.linearRampToValueAtTime(f,st+o.attack);v.frequency.linearRampToValueAtTime(f*(o.glide||1),st+o.attack+dur);
      const l=C.createOscillator(),lg=C.createGain();l.frequency.value=rr(4,6.5);lg.gain.value=f*0.025;l.connect(lg);lg.connect(v.frequency);l.start(st);l.stop(st+dur+o.attack+0.1);
    }
    if(o.breath){const ng=gain(0,out);env(ng,t0,o.attack,o.dur*0.5,o.dur*0.6,o.breath);noiseSrc(t0,o.dur*1.4,filt('bandpass',VOWEL[o.vowel][0][0]*1.4,1.2,ng),pinkBuf)}
  }
  let crackleG=null,booBedT=0,ambG,ambF,booBed,ambLevel=0.5,ambTarget=0.5,hypeT=0;
  function startAmbience(){
    ambG=gain(0,crowdBus);ambF=filt('bandpass',900,0.6,ambG);const s=C.createBufferSource();s.buffer=pinkBuf;s.loop=true;s.connect(ambF);
    const hf=filt('bandpass',2400,1.5,gain(0.25,ambG));s.connect(hf);s.start();
    // low murmur babble voices
    const mg=gain(0.0,ambG);booBed=mg;const bank=formantBank('oh',mg);
    for(let i=0;i<7;i++){const o=C.createOscillator();o.type='sawtooth';o.frequency.value=rr(100,240);o.connect(bank);
      const l=C.createOscillator(),lg=C.createGain();l.frequency.value=rr(0.15,0.6);lg.gain.value=rr(10,30);l.connect(lg);lg.connect(o.frequency);o.start();l.start()}
  }
  const SFXi={
    chomp:safe(()=>{const t=now(),hi=(SFXi._f=!SFXi._f);const g=gain(0,sfxBus);env(g,t,0.003,0.03,0.05,0.09);
      const o=osc('square',hi?520:360,t,0.09,filt('lowpass',2400,1,g));o.frequency.exponentialRampToValueAtTime(hi?260:180,t+0.08);
      noiseRaw(0.04,0.06,'highpass',3000)}),
    airhorn:safe(()=>{const t0=now();[[0,0.16],[0.21,0.16],[0.42,0.75]].forEach(([s,d])=>{const t=t0+s;const g=gain(0,sfxBus);env(g,t,0.015,d,0.12,0.11);g.connect(verbSend);
      const pk=filt('peaking',1600,1,filt('highpass',260,0.7,g));pk.gain.value=6;const sh=shaper(2.5,pk);
      [349,353,440,446,523].forEach(f=>{const o=osc('sawtooth',f*0.9,t,d+0.15,sh);o.frequency.exponentialRampToValueAtTime(f,t+0.05)})})}),
    cheer:safe((amt)=>{amt=amt||1;hypeT=Math.max(hypeT,2.5);
      crowdVoices({n:(14*amt)|0,fmin:160,fmax:420,vowel:'ah',dur:1.3,attack:0.18,spread:0.35,glide:0.85,start:0.9,vol:0.05*amt,breath:0.12});
      crowdVoices({n:(8*amt)|0,fmin:200,fmax:380,vowel:'eh',dur:0.9,attack:0.12,spread:0.5,glide:1.1,vol:0.035*amt,delay:0.25});
      const t=now();const ng=gain(0,crowdBus);env(ng,t,0.35,0.6,1.2,0.35*amt);noiseSrc(t,2.4,filt('bandpass',1400,0.5,ng),pinkBuf);
      for(let i=0;i<2;i++){const ws=t+rr(0.1,0.8);const wg=gain(0,crowdBus);env(wg,ws,0.05,0.25,0.15,0.03);const w=osc('sine',rr(1900,2400),ws,0.5,wg);w.frequency.linearRampToValueAtTime(rr(2800,3400),ws+0.3)}
      for(let i=0;i<(26*amt|0);i++){const ct=t+rr(0.05,1.8);const cg=gain(0,crowdBus);env(cg,ct,0.002,0.005,0.03,rr(0.05,0.12));noiseSrc(ct,0.05,filt('bandpass',rr(1000,2200),1.2,cg))}}),
    boo:safe((amt)=>{amt=amt||1;booBedT=3;
      crowdVoices({n:(16*amt)|0,fmin:85,fmax:230,vowel:'oo',dur:1.6,attack:0.3,spread:0.4,glide:0.88,start:1.04,vol:0.07*Math.min(amt,1.6),breath:0.18*amt})}),
    ohh:safe(()=>crowdVoices({n:16,fmin:150,fmax:300,vowel:'oh',dur:1.0,attack:0.12,spread:0.2,glide:0.62,start:1.15,vol:0.06,breath:0.1})),
    laugh:safe((amt)=>{amt=amt||1;const out=gain(0.1*amt,crowdBus);out.connect(verbSend);const bank=formantBank('ah',out);
      for(let i=0;i<(12*amt|0);i++){const f=rr(170,380),st=now()+rr(0,0.6),n=(rr(5,10))|0,per=rr(0.12,0.19);
        const g=C.createGain();g.gain.value=0;g.connect(bank);const o=osc('sawtooth',f*1.2,st,n*per+0.2,g);o.frequency.linearRampToValueAtTime(f*0.8,st+n*per);
        for(let j=0;j<n;j++){const s=st+j*per;const v=rr(0.5,1)*(1-j/n*0.6);g.gain.setValueAtTime(0.0001,s);g.gain.linearRampToValueAtTime(v,s+0.025);g.gain.exponentialRampToValueAtTime(0.0001,s+per*0.85);
          o.frequency.setValueAtTime(f*(1.25-j*0.04),s);o.frequency.exponentialRampToValueAtTime(f*(1.05-j*0.04),s+per*0.8)}}
      const ng=gain(0,crowdBus);env(ng,now(),0.2,1,0.8,0.15*amt);noiseSrc(now(),2.2,filt('bandpass',1100,0.7,ng),pinkBuf)}),
    ghostEat:safe(()=>{const t=now();[0,1,2,3,4,5].forEach(i=>toneRaw(330*Math.pow(1.26,i),0.07,'square',0.06,0,i*0.035));
      const g=gain(0,sfxBus);env(g,t,0.002,0.02,0.18,0.25);noiseSrc(t,0.2,filt('lowpass',1800,2,g));
      const k=gain(0,sfxBus);env(k,t+0.22,0.003,0.04,0.25,0.14);const o=osc('triangle',1400,t+0.22,0.3,k);o.frequency.exponentialRampToValueAtTime(2800,t+0.3)}),
    death:safe(()=>{const t=now();const g=gain(0,sfxBus);env(g,t,0.01,1.1,0.4,0.09);const o=osc('square',700,t,1.5,filt('lowpass',2200,1,g));
      o.frequency.exponentialRampToValueAtTime(70,t+1.4);const l=C.createOscillator(),lg=C.createGain();l.frequency.value=11;lg.gain.value=40;l.connect(lg);lg.connect(o.frequency);l.start(t);l.stop(t+1.5);
      const b=gain(0,sfxBus);env(b,t+1.35,0.005,0.05,0.3,0.25);const bo=osc('sine',120,t+1.35,0.4,b);bo.frequency.exponentialRampToValueAtTime(40,t+1.7)}),
    power:safe(()=>{const t=now();const g=gain(0,sfxBus);env(g,t,0.02,0.35,0.3,0.07);const f=filt('lowpass',400,8,g);f.frequency.exponentialRampToValueAtTime(6000,t+0.5);
      const o=osc('sawtooth',110,t,0.7,f);o.frequency.exponentialRampToValueAtTime(880,t+0.5);
      [523,659,784,1046].forEach(fq=>toneRaw(fq,0.35,'square',0.03,0,0.5))}),
    intThrow:safe(()=>{const t=now();const g=gain(0,sfxBus);env(g,t,0.05,0.15,0.2,0.3);const f=filt('bandpass',500,3,g);f.frequency.exponentialRampToValueAtTime(4000,t+0.35);noiseSrc(t,0.45,f);
      const w=gain(0,sfxBus);env(w,t+0.15,0.01,0.45,0.08,0.06);w.connect(verbSend);const o=osc('sine',2950,t+0.15,0.6,w);const l=C.createOscillator(),lg=C.createGain();l.frequency.value=32;lg.gain.value=180;l.connect(lg);lg.connect(o.frequency);l.start(t+0.15);l.stop(t+0.75)}),
    bossHit:safe(()=>{const t=now();const g=gain(0,sfxBus);env(g,t,0.002,0.08,0.5,0.6);const o=osc('sine',160,t,0.6,g);o.frequency.exponentialRampToValueAtTime(38,t+0.45);
      const n=gain(0,sfxBus);env(n,t,0.002,0.05,0.35,0.5);noiseSrc(t,0.4,shaper(4,filt('lowpass',1500,1,n)));
      const m=gain(0,sfxBus);env(m,t,0.002,0.02,0.9,0.08);m.connect(verbSend);[523,1307,1871,2389].forEach(f=>osc('square',f,t,1,filt('bandpass',f,12,m)))}),
    bonus:safe(()=>{[784,988,1175,1568,1976].forEach((f,i)=>{toneRaw(f,0.12,'triangle',0.08,0,i*0.06);toneRaw(f*2,0.08,'square',0.015,0,i*0.06)})}),
    start:safe(()=>{[392,523,659,784,659,784,1046].forEach((f,i)=>toneRaw(f,i==6?0.4:0.12,'square',0.05,0,i*0.11))}),
    bossSting:safe(()=>{const t=now();[110,104,98,92].forEach((f,i)=>{const g=gain(0,sfxBus);env(g,t+i*0.32,0.01,0.2,0.25,0.12);osc('sawtooth',f,t+i*0.32,0.5,shaper(3,filt('lowpass',900,4,g)));osc('sawtooth',f*1.01,t+i*0.32,0.5,shaper(3,filt('lowpass',900,4,g)))})}),
    trombone:safe((delay)=>{const t0=now()+(delay||0);const notes=[[233.1,0.5],[220,0.5],[207.7,0.5],[196,1.7]];let t=t0;
      notes.forEach(([f,d],i)=>{const g=gain(0,sfxBus);g.connect(verbSend);env(g,t,0.04,d-0.15,0.18,0.25);
        const fl=filt('lowpass',300,6,g);fl.frequency.setValueAtTime(300,t);fl.frequency.linearRampToValueAtTime(1800,t+0.12);fl.frequency.linearRampToValueAtTime(500,t+d);
        if(i===3)for(let k=0;k<6;k++){fl.frequency.setValueAtTime(500,t+0.2+k*0.24);fl.frequency.linearRampToValueAtTime(1500,t+0.32+k*0.24)}
        [1,1.006,0.5].forEach(m=>{const o=osc('sawtooth',f*m*0.97,t,d+0.2,fl);o.frequency.linearRampToValueAtTime(f*m,t+0.06);
          if(i===3){const l=C.createOscillator(),lg=C.createGain();l.frequency.value=5.5;lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(f*m*0.03,t+0.5);l.connect(lg);lg.connect(o.frequency);l.start(t);l.stop(t+d+0.2);o.frequency.linearRampToValueAtTime(f*m*0.9,t+d)}});
        t+=d})}),
    // crowd "SACK! SACK! SACK!" chant: 3 short shouted syllables + stomps/claps
    sackChant:safe((reps)=>{reps=reps||3;hypeT=Math.max(hypeT,3);
      for(let i=0;i<reps;i++){const d=i*0.52;
        crowdVoices({n:14,fmin:150,fmax:330,vowel:'ah',dur:0.22,attack:0.03,spread:0.06,glide:0.8,start:1.1,vol:0.075,breath:0.22,delay:d});
        const t=now()+d;const ng=gain(0,crowdBus);env(ng,t,0.005,0.05,0.12,0.45);noiseSrc(t,0.2,filt('bandpass',3200,1.4,ng));         // the 'S'/'CK'
        const k=gain(0,crowdBus);env(k,t+0.26,0.003,0.03,0.18,0.5);const o=osc('sine',110,t+0.26,0.25,k);o.frequency.exponentialRampToValueAtTime(45,t+0.4); // stomp
        for(let j=0;j<10;j++){const ct=t+0.26+rr(0,0.05);const cg=gain(0,crowdBus);env(cg,ct,0.002,0.005,0.03,rr(0.06,0.12));noiseSrc(ct,0.05,filt('bandpass',rr(1000,2200),1.2,cg))}}}),
    // crowd layer for "EAT! SHIT! JOE!" - 3 shouted beats on the same grid as the voice clip (0.12/0.70/1.28s) + stomp-stomp-clap
    eatShitChant:safe((delay)=>{const d0=(delay||0);hypeT=Math.max(hypeT,4);
      [['eh',0.12,0.18],['eh',0.70,0.2],['oh',1.28,0.45]].forEach(([vw,b,dur],i)=>{
        crowdVoices({n:16,fmin:140,fmax:320,vowel:vw,dur,attack:0.03,spread:0.05,glide:i===2?0.75:0.9,start:1.1,vol:0.06,breath:0.2,delay:d0+b});
        const t=now()+d0+b;if(i===1){const ng=gain(0,crowdBus);env(ng,t-0.06,0.01,0.06,0.08,0.4);noiseSrc(t-0.06,0.18,filt('highpass',3500,0.8,ng))}
        const k=gain(0,crowdBus);env(k,t,0.003,0.03,0.2,0.55);const o=osc('sine',105,t,0.28,k);o.frequency.exponentialRampToValueAtTime(42,t+0.2);
        for(let j=0;j<12;j++){const ct=t+0.29+rr(0,0.04);const cg=gain(0,crowdBus);env(cg,ct,0.002,0.005,0.03,rr(0.06,0.13));noiseSrc(ct,0.05,filt('bandpass',rr(1000,2200),1.2,cg))}});
      const ng=gain(0,crowdBus);env(ng,now()+d0+1.3,0.3,0.8,1.4,0.35);noiseSrc(now()+d0+1.3,2.6,filt('bandpass',1400,0.5,ng),pinkBuf)}),
    // crowd layer for "MORE! HOUSE! MORE! PROBLEMS!" - 4 shouted beats + stomp/clap
    mmpChant:safe((delay)=>{const d0=(delay||0);hypeT=Math.max(hypeT,4);
      [['oh',0.1,0.22],['ah',0.55,0.25],['oh',1.0,0.22],['ah',1.45,0.5]].forEach(([vw,b,dur],i)=>{
        crowdVoices({n:16,fmin:140,fmax:320,vowel:vw,dur,attack:0.03,spread:0.05,glide:i===3?0.75:0.9,start:1.1,vol:0.06,breath:0.2,delay:d0+b});
        const t=now()+d0+b;const k=gain(0,crowdBus);env(k,t,0.003,0.03,0.2,0.55);const o=osc('sine',105,t,0.28,k);o.frequency.exponentialRampToValueAtTime(42,t+0.2);
        for(let j=0;j<12;j++){const ct=t+0.25+rr(0,0.04);const cg=gain(0,crowdBus);env(cg,ct,0.002,0.005,0.03,rr(0.06,0.13));noiseSrc(ct,0.05,filt('bandpass',rr(1000,2200),1.2,cg))}});
      const ng=gain(0,crowdBus);env(ng,now()+d0+1.5,0.3,0.8,1.4,0.35);noiseSrc(now()+d0+1.5,2.6,filt('bandpass',1400,0.5,ng),pinkBuf)}),
    // sad foghorn "wah... waaaah" (lower + longer than the trombone)
    sadHorn:safe((delay)=>{const t0=now()+(delay||0);[[155.6,0.45,0],[146.8,0.45,0.5],[116.5,1.6,1.0]].forEach(([f,d,s],i)=>{const t=t0+s;
      const g=gain(0,sfxBus);g.connect(verbSend);env(g,t,0.05,d-0.1,0.3,0.22);const fl=filt('lowpass',500,3,g);fl.frequency.linearRampToValueAtTime(1100,t+0.1);fl.frequency.linearRampToValueAtTime(380,t+d);
      [1,1.008,0.5,2.003].forEach((m,k)=>{const o=osc('sawtooth',f*m,t,d+0.35,gain(k===3?0.25:1,fl));
        if(i===2){o.frequency.linearRampToValueAtTime(f*m*0.86,t+d);const l=C.createOscillator(),lg=C.createGain();l.frequency.value=4.5;lg.gain.value=f*m*0.025;l.connect(lg);lg.connect(o.frequency);l.start(t);l.stop(t+d+0.35)}})})}),
    stamp:safe((delay)=>{const t=now()+(delay||0);const g=gain(0,sfxBus);env(g,t,0.002,0.04,0.25,0.5);const o=osc('sine',120,t,0.3,g);o.frequency.exponentialRampToValueAtTime(40,t+0.2);
      const n=gain(0,sfxBus);env(n,t,0.001,0.02,0.12,0.35);noiseSrc(t,0.15,filt('lowpass',2200,1,n))}),
    throwF:safe(()=>{const t=now();const g=gain(0,sfxBus);env(g,t,0.004,0.02,0.06,0.05);const f=filt('bandpass',1800,1.5,g);f.frequency.exponentialRampToValueAtTime(4000,t+0.08);noiseSrc(t,0.1,f)}),
    splat:safe((big)=>{const t=now();const g=gain(0,sfxBus);env(g,t,0.002,0.02,big?0.3:0.14,big?0.5:0.28);noiseSrc(t,0.35,filt('lowpass',big?2500:4000,0.8,g));
      const p=gain(0,sfxBus);env(p,t,0.002,0.01,0.1,0.18);const o=osc('square',big?260:520,t,0.12,filt('lowpass',3000,1,p));o.frequency.exponentialRampToValueAtTime(big?60:140,t+0.1)}),
    flush:safe(()=>{const t=now();const g=gain(0,sfxBus);env(g,t,0.05,0.7,0.6,0.4);const f=filt('bandpass',600,2,g);f.frequency.setValueAtTime(400,t);f.frequency.linearRampToValueAtTime(1400,t+0.4);f.frequency.exponentialRampToValueAtTime(250,t+1.3);
      const l=C.createOscillator(),lg=C.createGain();l.frequency.value=9;lg.gain.value=300;l.connect(lg);lg.connect(f.frequency);l.start(t);l.stop(t+1.4);noiseSrc(t,1.4,f,pinkBuf);
      for(let i=0;i<6;i++)toneRaw(rr(200,500),0.06,'sine',0.08,rr(-150,200),0.5+i*0.11)}),
    squeak:safe((p)=>{toneRaw(500+p*900,0.08,'triangle',0.05,200)}),
    bigPop:safe(()=>{const t=now();const g=gain(0,sfxBus);env(g,t,0.001,0.04,0.6,0.8);g.connect(verbSend);noiseSrc(t,0.7,filt('lowpass',5000,0.6,g));
      const b=gain(0,sfxBus);env(b,t,0.001,0.06,0.5,0.7);const o=osc('sine',110,t,0.6,b);o.frequency.exponentialRampToValueAtTime(30,t+0.5)}),
    scratch:safe(()=>{const t=now();for(let i=0;i<3;i++){const s=t+i*0.11;const g=gain(0,sfxBus);env(g,s,0.005,0.05,0.04,0.35);const f=filt('bandpass',800,5,g);
      f.frequency.setValueAtTime(i%2?2400:500,s);f.frequency.exponentialRampToValueAtTime(i%2?500:2600,s+0.09);noiseSrc(s,0.12,f)}}),
    hurt:safe(()=>{const t=now();const g=gain(0,sfxBus);env(g,t,0.003,0.15,0.25,0.12);const o=osc('sawtooth',400,t,0.45,filt('lowpass',1600,2,g));o.frequency.exponentialRampToValueAtTime(70,t+0.4)}),
    slowmo:safe(()=>{const t=now();const g=gain(0,sfxBus);env(g,t,0.05,0.6,0.8,0.35);g.connect(verbSend);const o=osc('sawtooth',220,t,1.5,filt('lowpass',900,3,g));o.frequency.exponentialRampToValueAtTime(40,t+1.4);
      const n=gain(0,sfxBus);env(n,t,0.2,0.6,0.7,0.25);noiseSrc(t,1.5,filt('lowpass',600,1,n),pinkBuf)}),
    sniff:safe(()=>{const t=now();[0,0.18].forEach(d=>{const g=gain(0,sfxBus);env(g,t+d,0.03,0.06,0.08,0.18);noiseSrc(t+d,0.2,filt('bandpass',2600,2,g))})}),
    tone:safe((f,d,type,v,slide,delay)=>toneRaw(f,d,type,v,slide,delay))
  };
  // ---- SFX limiter: per-sound throttles, one BIG sound at a time, max 6 SFX per 150ms ----
  {const TH={airhorn:900,bigPop:450,splat:45,chomp:40,throwF:80,bossHit:250,cheer:1100,boo:1100,laugh:1400,ohh:900,flush:700,scratch:350,slowmo:1200,eatShitChant:1800,mmpChant:1800,sackChant:1800,
     power:300,bonus:200,ghostEat:300,intThrow:250,squeak:60,sniff:400,hurt:300,death:800,trombone:2000,sadHorn:2000,stamp:200,start:300,bossSting:800};
   const BIG={airhorn:1.25,bigPop:0.6,slowmo:1.4,bossHit:0.5,flush:1.3,bossSting:1.3,death:1.4};const last={};let win=[],bigUntil=0;
   for(const k of Object.keys(SFXi)){if(k==='tone')continue;const f=SFXi[k];SFXi[k]=function(){const n=performance.now();if(n-(last[k]||-1e9)<(TH[k]||60)){stats.sfxDrop=(stats.sfxDrop||0)+1;return}
     win=win.filter(x=>n-x<150);if(win.length>=6){stats.sfxDrop=(stats.sfxDrop||0)+1;return}
     if(BIG[k]){if(n<bigUntil){stats.sfxDrop=(stats.sfxDrop||0)+1;return}bigUntil=n+BIG[k]*1000}
     last[k]=n;win.push(n);return f.apply(null,arguments)}}}
    // ---------- music sequencer ----------
  const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  function nf(s){const m=/^([A-G])(#|b)?(\d)$/.exec(s);if(!m)return 0;const n=NOTE[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0)+(+m[3]+1)*12;return 440*Math.pow(2,(n-69)/12)}
  function parse(str){const tk=str.trim().split(/\s+/),ev=[];for(let i=0;i<tk.length;i++){const x=tk[i];if(x==='-'){if(ev.length&&ev[ev.length-1].end===i)ev[ev.length-1].end=i+1;continue}
      if(x==='.')continue;ev.push({i,f:nf(x),end:i+1})}const by={};for(const e of ev){by[e.i]=e}return{len:tk.length,by}}
  function song(o){o.mel=parse(o.m);o.bas=parse(o.b);o.drm=o.d.trim().split(/\s+/);o.harm=o.h?parse(o.h):null;o.len=o.len||o.mel.len;o.div=o.div||2;if(o.crh)o.crh=o.crh.trim().split(/\s+/);return o}
  // ---- boom-bap: 16th grid (div 4), swing, rhodes chords per bar ----
  const BA='kh . h . sh . h k h . kh . sh . h .',BB='kh . h k sh . h . kh . h k sh . o x',BF='kh . h . sh . h k h . kh . sh s s s';
  const SONGS={
    title:song({bpm:88,div:4,swing:0.14,lead:'whistle',bass:'sub',len:64,
      m:`. . . . . . . . . . . . . . . .  . . . . . . . . . . . . . . . .  . . . . . . . . . . . . . . . .  . . . . . . . . . . . . E5 D5 C5 B4`,
      b:`A1 - - - . . . A1 - - E2 - . . G1 -  F1 - - - . . . F1 - - C2 - . . E1 -  D2 - - - . . . D2 - - A1 - . . C2 -  E1 - - - . . . E1 - - B1 - . G#1 E1 -`,
      d:`${BA} ${BB} ${BA} ${BF}`,ch:[['A3','C4','E4','G4','B4'],['F3','A3','C4','E4','G4'],['D3','F3','A3','C4','E4'],['E3','G#3','B3','D4','F4']],crh:'x - - - - - - x - - - - . . x -'}),
    main:song({bpm:94,div:4,swing:0.12,lead:'whistle',bass:'sub',len:64,
      m:`A5 - - - . . E5 . G5 - A5 - . . . .  F5 - - - . . C5 . . . E5 . D5 . C5 .  D5 - - - C5 . A4 . C5 - D5 - . . F5 E5  E5 - - - . . B4 . D5 - - - C5 B4 G#4 .`,
      b:`A1 - - A2 . . . A1 - - E2 - . A1 G1 -  F1 - - F2 . . . F1 - - C2 - . F1 E1 -  D2 - - D1 . . . D2 - - A1 - . D2 C2 -  E1 - - E2 . . . E1 - - B1 - . G#1 E1 -`,
      d:`${BA} ${BB} ${BA} ${BF}`,ch:[['A3','C4','E4','G4','B4'],['F3','A3','C4','E4','G4'],['D3','F3','A3','C4','E4'],['E3','G#3','B3','D4','F4']],crh:'x - - - - - x - - - x - . . x -'}),
    boss:song({bpm:98,div:4,swing:0.08,lead:'horn',bass:'sub',len:64,
      m:`E5 . . E5 . . G5 . . . F5 . E5 . . .  F5 . . F5 . . A5 . . . G5 . F5 . . .  E5 . . E5 . . G5 . . . B5 . A5 . G5 .  F5 - - - E5 - - - D5 - - - E5 . . .`,
      b:`E1 - - E1 . . E2 . E1 - - . G1 - . .  F1 - - F1 . . F2 . F1 - - . A1 - . .  E1 - - E1 . . E2 . E1 - - . G1 - . .  F1 - - - . . . . E1 - - - . . . .`,
      d:`kh . h k sh . h k kh . h . sh . kh x  kh . h k sh . h k kh . h . sh . kh .  kh . h k sh . h k kh . h . sh . kh x  kh . kh . sh . kh . sh sh sh sh sh s s x`,
      ch:[['E3','G3','B3','D4'],['F3','A3','C4','E4'],['E3','G3','B3','D4'],['F3','A3','C4','E4']],crh:'x - - . . . . . x - - . . . . .'}),
    ending:song({bpm:112,lead:'kazoo',bass:'tuba',hat16:false,
      m:`G5 - E5 - A5 G5 E5 -  G5 - E5 - A5 G5 E5 -  G5 G5 E5 E5 A5 A5 G5 E5  D5 - E5 - C5 - - -`,
      b:`C3 . G2 . C3 . G2 .  C3 . G2 . C3 . G2 .  C3 . G2 . F2 . G2 .  G2 . G2 . C3 . . .`,
      d:`k . c . k . c .  k . c . k . c .  k . c . k . c .  k . c . k c c c`})
  };
  let cur=null,curName=null,step=0,nextT=0,pendingName=null,startDelay=0;
  function setTheme(n){if(n===curName&&!pendingName)return;if(n===pendingName)return;pendingName=n;
    if(!C)return;
    if(musicDuck){const t=now();musicDuck.gain.cancelScheduledValues(t);musicDuck.gain.setTargetAtTime(0.0001,t,0.05);}
    switchAt=now()+0.18}
  let switchAt=0;
  function schedule(){
    try{
      if(!C||C.state!=='running')return;
      const t=now();
      // ambience follow
      if(ambG){const tgt=muted?0:ambTarget*(hypeT>0?1.7:1);ambG.gain.setTargetAtTime(tgt*0.18,t,0.4);ambF.frequency.setTargetAtTime(hypeT>0?1300:850,t,0.5);
        booBed.gain.setTargetAtTime(booBedT>0?0.035:0.008,t,0.6);hypeT=Math.max(0,hypeT-0.025);booBedT=Math.max(0,booBedT-0.025)}
      if(pendingName!==null&&t>=switchAt){curName=pendingName;if(crackleG)crackleG.gain.setTargetAtTime(curName&&curName!=='ending'?0.5:0.15,t,0.2);pendingName=null;cur=curName?SONGS[curName]:null;step=0;nextT=t+0.05+(curName==='ending'?startDelay:0);startDelay=0;
        musicDuck.gain.cancelScheduledValues(t);musicDuck.gain.setValueAtTime(0.0001,t);musicDuck.gain.linearRampToValueAtTime(1,t+0.1)}
      if(!cur||!musicOn||muted){if(cur)nextT=Math.max(nextT,t);return}
      const sp=60/cur.bpm/cur.div;
      if(nextT<t-0.3)nextT=t+0.02;
      while(nextT<t+0.12){playStep(cur,step,nextT,sp);const sw=cur.swing||0;nextT+=sp*(step%2===0?1+sw:1-sw);step=(step+1)%cur.len}
    }catch(e){errors++;if(errors<5)console.warn('sched',e)}
  }
  function playStep(s,i,t,sp){
    const m=s.mel.by[i];if(m)inst(s.lead,m.f,t,(m.end-m.i)*sp,0.11);
    if(s.harm){const h=s.harm.by[i];if(h){inst('arp',h.f*2,t,sp*0.45,0.035);inst('arp',h.f*2.52,t+sp/2,sp*0.4,0.025)}}
    const b=s.bas.by[i];if(b)inst(s.bass,b.f,t,(b.end-b.i)*sp*0.9,0.16);
    if(s.ch){const pos=i%16,bar=((i/16)|0)%s.ch.length;if(s.crh[pos]==='x'){let n=1;while(pos+n<16&&s.crh[pos+n]==='-')n++;s.ch[bar].forEach((nt,k)=>inst('rhodes',nf(nt),t+k*0.006,n*sp,0.05))}}
    const d=s.drm[i%s.drm.length];
    if(d.includes('k'))drum('k',t);if(d.includes('s'))drum('s',t);if(d.includes('c'))drum('c',t);
    if(d.includes('h')||s.hat16)drum('h',t+(s.hat16?sp/2:0));if(d.includes('o'))drum('o',t);if(d.includes('x'))drum('x',t);
  }
  function inst(type,f,t,d,v){
    if(!f)return;const g=C.createGain();g.connect(musicDuck);
    switch(type){
      case 'sq':case 'sq2':{env(g,t,0.005,d*0.6,d*0.4+0.04,v*0.6);const o=osc(type==='sq2'?'sawtooth':'square',f,t,d+0.05,filt('lowpass',type==='sq2'?3000:4200,1,g));
        if(d>0.25){const l=C.createOscillator(),lg=C.createGain();l.frequency.value=6;lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(f*0.012,t+d);l.connect(lg);lg.connect(o.frequency);l.start(t);l.stop(t+d+0.05)}break}
      case 'saw':{env(g,t,0.005,d*0.7,d*0.3+0.03,v*0.55);const fl=filt('lowpass',1200,6,g);fl.frequency.setValueAtTime(3500,t);fl.frequency.exponentialRampToValueAtTime(700,t+d);
        osc('sawtooth',f,t,d+0.05,fl);osc('sawtooth',f*1.007,t,d+0.05,fl);break}
      case 'arp':{env(g,t,0.003,d*0.3,d*0.7,v);osc('square',f,t,d,g);break}
      case 'organ':{env(g,t,0.01,d*0.85,0.06,v*0.45);g.connect(verbSend);[1,2,3,4,6].forEach((h,k)=>osc('sine',f*h,t,d+0.1,gain([1,0.6,0.35,0.25,0.12][k],g)));break}
      case 'bass':{env(g,t,0.004,d*0.6,d*0.4,v*0.9);osc('triangle',f,t,d+0.05,g);osc('square',f,t,d+0.05,filt('lowpass',600,1,gain(0.25,g)));break}
      case 'dist':{env(g,t,0.004,d*0.6,d*0.4,v*0.55);const sh=shaper(5,filt('lowpass',1100,2,g));osc('sawtooth',f,t,d+0.05,sh);osc('square',f/2,t,d+0.05,gain(0.4,sh));break}
      case 'kazoo':{env(g,t,0.02,d*0.7,d*0.3+0.03,v*0.55);const fl=filt('bandpass',1100,2,gain(2,g));const o=osc('sawtooth',f*0.98,t,d+0.05,fl);o.frequency.linearRampToValueAtTime(f,t+0.05);
        const l=C.createOscillator(),lg=C.createGain();l.frequency.value=7;lg.gain.value=f*0.02;l.connect(lg);lg.connect(o.frequency);l.start(t);l.stop(t+d+0.05);break}
      case 'rhodes':{env(g,t,0.008,d*0.5,d*0.5+0.25,v);g.connect(verbSend);const fl=filt('lowpass',1800,0.7,g);const tr=C.createGain();tr.connect(fl);
        osc('sine',f,t,d+0.35,tr);osc('sine',f*2,t,d*0.4,gain(0.18,tr));osc('triangle',f*1.002,t,d+0.35,gain(0.35,tr));
        const l=C.createOscillator(),lg=C.createGain();l.frequency.value=4.2;lg.gain.value=0.25;l.connect(lg);lg.connect(tr.gain);l.start(t);l.stop(t+d+0.4);break}
      case 'whistle':{env(g,t,0.03,d*0.7,d*0.3+0.06,v*0.5);g.connect(verbSend);const o=osc('sine',f*0.97,t,d+0.1,g);o.frequency.linearRampToValueAtTime(f,t+0.05);
        osc('triangle',f,t,d+0.1,gain(0.25,g));const l=C.createOscillator(),lg=C.createGain();l.frequency.value=5.5;lg.gain.setValueAtTime(0,t);lg.gain.linearRampToValueAtTime(f*0.018,t+Math.max(0.1,d));l.connect(lg);lg.connect(o.frequency);l.start(t);l.stop(t+d+0.1);break}
      case 'horn':{env(g,t,0.01,d*0.5,d*0.4+0.08,v*0.6);g.connect(verbSend);const fl=filt('lowpass',600,2,g);fl.frequency.setValueAtTime(600,t);fl.frequency.linearRampToValueAtTime(3200,t+0.04);fl.frequency.exponentialRampToValueAtTime(900,t+d+0.1);
        const sh=shaper(1.6,fl);[1,1.006,0.994,0.5].forEach(m=>osc('sawtooth',f*m,t,d+0.12,sh));break}
      case 'sub':{env(g,t,0.005,d*0.7,d*0.3+0.04,v*1.15);osc('sine',f,t,d+0.08,g);osc('triangle',f*2,t,d+0.08,filt('lowpass',500,1,gain(0.22,g)));break}
      case 'tuba':{env(g,t,0.02,d*0.5,d*0.5,v*1.1);osc('triangle',f,t,d+0.05,g);osc('sawtooth',f,t,d+0.05,filt('lowpass',400,1,gain(0.3,g)));break}
    }
  }
  function drum(k,t){
    const g=C.createGain();g.connect(musicDuck);
    if(k==='k'&&curName&&curName!=='ending'){env(g,t,0.002,0.05,0.28,0.75);const o=osc('sine',125,t,0.38,shaper(1.8,gain(1,g)));o.frequency.exponentialRampToValueAtTime(44,t+0.22);
      const c=gain(0,musicDuck);env(c,t,0.001,0.004,0.02,0.18);noiseSrc(t,0.03,filt('highpass',2500,0.7,c))}
    else if(k==='s'&&curName&&curName!=='ending'){g.connect(verbSend);env(g,t,0.002,0.03,0.2,0.42);noiseSrc(t,0.26,filt('bandpass',1700,0.6,g));const tg=gain(0,musicDuck);env(tg,t,0.002,0.02,0.09,0.25);osc('triangle',200,t,0.12,tg)}
    else if(k==='o'){env(g,t,0.001,0.06,0.16,0.06);noiseSrc(t,0.25,filt('highpass',6500,0.7,g))}
    else if(k==='x'){env(g,t,0.005,0.1,0.06,0.22);const f=filt('bandpass',700,4,g);f.frequency.setValueAtTime(500,t);f.frequency.exponentialRampToValueAtTime(2600,t+0.07);f.frequency.exponentialRampToValueAtTime(700,t+0.16);noiseSrc(t,0.2,f)}
    else if(k==='k'){env(g,t,0.002,0.02,0.22,0.5);const o=osc('sine',150,t,0.3,g);o.frequency.exponentialRampToValueAtTime(42,t+0.18)}
    else if(k==='s'){env(g,t,0.002,0.01,0.14,0.22);noiseSrc(t,0.2,filt('bandpass',1900,0.8,g));const tg=gain(0,musicDuck);env(tg,t,0.002,0.01,0.08,0.12);osc('triangle',190,t,0.1,tg)}
    else if(k==='h'){env(g,t,0.001,0.005,0.035,0.06);noiseSrc(t,0.06,filt('highpass',7500,0.7,g))}
    else if(k==='c'){g.connect(verbSend);for(let i=0;i<3;i++){const cg=gain(0,g);env(cg,t+i*0.009,0.001,0.003,0.06,0.25);noiseSrc(t+i*0.009,0.08,filt('bandpass',1300,1.5,cg))}}
  }
  // ---------- heckles ----------
  let voicesCache=[];
  function voices(){try{const v=speechSynthesis.getVoices();if(v&&v.length)voicesCache=v.filter(x=>/^en/i.test(x.lang))}catch(e){}return voicesCache}
  try{if('speechSynthesis' in window)speechSynthesis.onvoiceschanged=voices}catch(e){}
  function say(text){
    if(!('speechSynthesis' in window)||!speechPrimed)return false;
    try{if(speechSynthesis.speaking)return false;const u=new SpeechSynthesisUtterance(text.toUpperCase());const vs=voices();if(vs.length)u.voice=pick(vs);
      u.pitch=rr(0.55,1.7);u.rate=rr(1.0,1.35);u.volume=1;u.lang=u.voice?u.voice.lang:'en-US';speechSynthesis.speak(u);return true}catch(e){return false}
  }
  function playClip(k,chant,delay,vol,rate0){
    const b=clips[k];if(!b)return false;const t=now()+0.02+(delay||0);
    const out=gain((chant?0.55:1)*(vol||1),voiceBus);out.connect(verbSend);const hp=filt('highpass',160,0.7,out);
    const copies=chant?[[1,0,1],[0.93,0.03,0.7],[1.08,0.05,0.7],[0.97,0.08,0.6],[1.04,0.11,0.55]]:rate0?[[rate0,0,1],[rate0*0.5,0,0.5]]:[[rr(0.96,1.06),0,1]];
    for(const[rate,dl,v]of copies){const s=C.createBufferSource();s.buffer=b;s.playbackRate.value=rate;s.connect(gain(v,hp));s.start(t+dl)}
    // duck music while the fan yells
    // duck music + SFX + crowd ~55% while the voice line plays
    const dur=b.duration/(rate0||1)+0.15,T=now();for(const[bus,v]of[[musicBus,musicOn?0.42:0],[sfxBus,0.75],[crowdBus,0.85]]){bus.gain.cancelScheduledValues(T);bus.gain.setTargetAtTime(v*0.45,T,0.04);bus.gain.setTargetAtTime(v,t+dur,0.25)}
    if(chant)SFXi.cheer(0.6);
    return true;
  }
  // ---- SINGLE VOICE QUEUE: one line at a time, short gap, 2.5-4s cooldown for random heckles, priorities, stale low-prio lines dropped ----
  const stingLast={};let onSay=null;const Q=[];let busyUntil=0,lastEnd=-1e9,cool=3000,curLine=null;
  const P3=new Set(['waah','bitch','nohouse','wilson','wilson2','bestteam','boss8','a_over','a_best','a_eatshit','a_joewin','poppa','boss1','bossdie']);
  function prioOf(h,base){if(P3.has(h.k))return 3;if(h.g.split(' ').some(g=>g==='BOSS'||g==='BOSSHIT'||g==='BOSSDIE'||g==='WILSON'||g==='end'))return Math.max(base,2);return base}
  function startLine(e){const h=e.h;let ok=false,dur=1.8;
    if(C&&!muted){try{if('speechSynthesis' in window)speechSynthesis.cancel()}catch(x){}
      if(clips[h.k]){ok=playClip(h.k,!!(e.o.chant||h.chant),0,e.o.vol,e.o.rate);dur=clips[h.k].duration/(e.o.rate||1)}else ok=say(h.s||h.t)}
    const n=performance.now();busyUntil=n+dur*1000;lastEnd=busyUntil;cool=rr(2500,4000);
    stats.n++;const kind=ok?(clips[h.k]?'clip':'speech'):'text';stats[kind]=(stats[kind]||0)+1;if(e.sting)stats.sting=(stats.sting||0)+1;stats[h.k]=(stats[h.k]||0)+1;stats.last=h.t;
    stats.maxQ=Math.max(stats.maxQ||0,Q.length);curLine={k:h.k,t:h.t,until:busyUntil};
    if(onSay)try{onSay(h.t,h.g.includes('ANNOUNCE'),dur)}catch(x){}}
  function canStart(e,n){if(n<busyUntil+300||n<e.at)return false;if(e.p<=1&&n<lastEnd+cool)return false;return true}
  function request(h,o,p,isSting){if(document.hidden)return false;o=o||{};const n=performance.now(),d=(o.delay||0)*1000;
    const e={h,o,p,at:n+d,exp:n+d+(p>=3?6000:p>=2?3200:0),sting:isSting};
    if(!Q.length&&canStart(e,n)){startLine(e);return true}
    if(p<=1){stats.dropped=(stats.dropped||0)+1;return false}   // stale low-priority lines are dropped, never queued
    for(let i=Q.length-1;i>=0;i--)if(Q[i].h.k===h.k)Q.splice(i,1);
    Q.push(e);Q.sort((a,b)=>b.p-a.p||a.at-b.at);while(Q.length>3){Q.pop();stats.dropped=(stats.dropped||0)+1}return Q.includes(e)}
  function pump(){if(!Q.length)return;const n=performance.now();for(let i=Q.length-1;i>=0;i--)if(n>Q[i].exp){Q.splice(i,1);stats.dropped=(stats.dropped||0)+1}
    const i=Q.findIndex(e=>canStart(e,n));if(i>=0)startLine(Q.splice(i,1)[0])}
  setInterval(()=>{try{pump()}catch(e){}},40);
  function sting(k,o){try{o=o||{};const n=performance.now();if(n-(stingLast[k]||-1e9)<(o.throttle||0))return false;const h=HECKLES.find(x=>x.k===k);if(!h)return false;
      const ok=request(h,o,o.prio||(P3.has(k)?3:2),true);if(ok)stingLast[k]=n;return ok}catch(e){console.warn('sting',e);return false}}
  function heckle(ev){try{if(document.hidden)return null;let pool=HECKLES.filter(h=>h.g.split(' ').includes(ev));if(!pool.length)return null;
      const fresh=pool.filter(h=>!recent.includes(h));if(fresh.length)pool=fresh;const h=pick(pool);
      if(!request(h,{},prioOf(h,ev==='ambient'?0:1),false))return null;recent.push(h);if(recent.length>10)recent.shift();return h.t}catch(e){console.warn('heckle',e);return null}}
  function setMuted(m){muted=m;localStorage.setItem('nw_muted',m?'1':'0');if(C){master.gain.setTargetAtTime(m?0:0.9,now(),0.03)}if(m){try{speechSynthesis.cancel()}catch(e){}}}
  function setMusic(on){musicOn=on;localStorage.setItem('nw_music',on?'1':'0');if(C)musicBus.gain.setTargetAtTime(on?0.42:0,now(),0.05)}
  return{unlock,heckle,sting,setTheme,setMuted,setMusic,SFX:SFXi,
    get unlocked(){return unlocked&&!!C},get running(){return !!C&&C.state==='running'},get muted(){return muted},get musicOn(){return musicOn},
    get theme(){return curName},get queueLen(){return Q.length},get current(){return curLine&&performance.now()<curLine.until?curLine:null},stats:()=>stats,get clipCount(){return Object.keys(clips).length},get errors(){return errors},
    set ambience(v){ambTarget=v},set onSay(f){onSay=f},unlockAge:()=>performance.now()-unlockedAt,endingDelay(s){startDelay=s},ctx:()=>C};
})();