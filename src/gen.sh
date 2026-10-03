set -e
cd /tmp/ntw
V=(joe ryan kusal amy)
i=0
while IFS='|' read -r k t tts g ch; do
  [ -z "$k" ] && continue
  [ -z "$tts" ] && tts="$t"
  if [[ $k == a_* ]]; then v=ryan; ls=1.0; else v=${V[$((i%4))]}; i=$((i+1)); ls=$(python3 -c "import random;print(round(random.uniform(0.82,0.95),2))"); fi
  [ -f $k.mp3 ] && [ "$FORCE" != 1 ] && continue
  echo "$tts" | /tmp/tts/bin/piper -m /tmp/voices/en_US-$v-medium.onnx -f raw_$k.wav --length-scale $ls --noise-scale 0.8 >/dev/null 2>&1
  ffmpeg -y -loglevel error -i raw_$k.wav -af "highpass=f=140,lowpass=f=7000,acompressor=threshold=-18dB:ratio=4:attack=5:release=80,volume=2.0,alimiter=limit=0.95" -ac 1 -ar 24000 -b:a 32k $k.mp3
  echo "$k $v $(stat -c%s $k.mp3)"
done < /workspace/notorious-weasel/src/heckles.txt
