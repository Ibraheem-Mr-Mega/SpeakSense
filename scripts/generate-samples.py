"""Synthetic AUDIO fixtures, not transcripts posing as recordings.
Each spoken word is rendered with macOS say, silence-trimmed, and assembled.
Timestamps are exact sample offsets into the assembled WAV, not ASR guesses.
The cadence is deliberately artificial; this is a deterministic metric test.
"""
import subprocess, wave, array, json, pathlib, re
out=pathlib.Path('public/samples');out.mkdir(exist_ok=True)
cache=pathlib.Path('/tmp/speaksense-words');cache.mkdir(exist_ok=True)
scripts=[
'Um, we help small teams find the decisions buried in their meetings. Our product turns meeting notes into a shared decision log. Uh, people can see what was decided and who owns the next step. Um, we are testing it with five teams this month. We want to learn whether it saves time before we grow. So, uh, that is what we are building. Thank you.',
'We help small teams find the decisions buried in their meetings. Our product turns meeting notes into a shared decision log, with an owner for every next step. Um, we are testing it with five teams this month to learn whether it saves time. We are asking for introductions to two team leaders who will try it for one week. Will you introduce us?'
]
for n,script in enumerate(scripts,1):
 frames=array.array('h',[0]*int(.45*22050)); words=[]
 for token in script.split():
  name=re.sub(r'[^a-z0-9]','',token.lower());p=cache/(name+'.wav')
  if not p.exists():subprocess.run(['say','-v','Samantha','-r','195','-o',str(p),'--file-format=WAVE','--data-format=LEI16@22050',re.sub(r'[^a-zA-Z0-9]','',token)],check=True,stdout=subprocess.DEVNULL)
  with wave.open(str(p),'rb') as w: data=array.array('h',w.readframes(w.getnframes()))
  active=[i for i,v in enumerate(data) if abs(v)>180]
  if not active:raise RuntimeError('No spoken audio for '+token)
  lo=max(0,active[0]-220);hi=min(len(data),active[-1]+441);data=data[lo:hi]
  start=len(frames)/22050;frames.extend(data);end=len(frames)/22050
  words.append(dict(text=token,start=round(start,5),end=round(end,5),type='word'))
  pause=.12 if n==1 else .055
  if token.endswith('.'):pause=.65 if n==1 else .35
  if n==1 and token=='Uh,':pause=1.15
  frames.extend([0]*int(pause*22050))
 frames.extend([0]*int(.3*22050))
 with wave.open(str(out/f'attempt-{n}.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(22050);w.writeframes(frames.tobytes())
 result=dict(id=f'sample-{n}',kind='sample',exercise='investor',audience='Seed investors · earn a follow-up meeting',duration=len(frames)/22050,audioUrl=f'/samples/attempt-{n}.wav',transcript=dict(text=script,words=words,language_code='en'),provenance='Synthetic macOS Samantha speech; each word individually rendered and assembled. Timestamps are assembly offsets. Not ElevenLabs output or a human performance.')
 (out/f'attempt-{n}.json').write_text(json.dumps(result,indent=2))
 print(f'Fixture {n}: {len(words)} words, {result["duration"]:.2f} seconds')
