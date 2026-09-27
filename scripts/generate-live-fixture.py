"""Controlled test speech, not a human recording. Reuses committed synthetic word audio."""
import array,json,wave,pathlib
p=pathlib.Path('public/samples')
fixture=json.loads((p/'attempt-1.json').read_text())
with wave.open(str(p/'attempt-1.wav'),'rb') as w: raw=array.array('h',w.readframes(w.getnframes()));rate=w.getframerate()
lookup={w['text'].lower().strip('.,'):w for w in fixture['transcript']['words']}
# Deliberate filled pauses at transitions, followed by enough ongoing speech to prove pre-stop cues.
phrases=['Um we help small teams', 'Uh our product turns meeting notes', 'Um into a shared decision log', 'People can see what was decided and who owns the next step', 'We are testing it with five teams this month', 'We want to learn whether it saves time before we grow', 'So that is what we are building thank you']
out=array.array('h',[0]*int(rate*.4))
for phrase in phrases:
 for token in phrase.split():
  word=lookup[token.lower()];out.extend(raw[int(word['start']*rate):int(word['end']*rate)]);out.extend([0]*int(rate*.055))
 out.extend([0]*int(rate*.8))
# Repeat natural non-filler phrases; no synthetic cue events or transcript are provided to the app.
for phrase in phrases[3:]:
 for token in phrase.split():
  word=lookup[token.lower()];out.extend(raw[int(word['start']*rate):int(word['end']*rate)]);out.extend([0]*int(rate*.08))
 out.extend([0]*int(rate*.9))
if len(out)<rate*60:out.extend([0]*(rate*60-len(out)))
with wave.open(str(p/'live-controlled.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(out.tobytes())
print('Controlled speech duration:',len(out)/rate)

# Repeat real synthetic filler audio after the 20-second reminder of a 45s take.
countdown = out[:rate * 45]
countdown[27 * rate:36 * rate] = out[:rate * 9]
with wave.open(str(p/'live-countdown.wav'), 'wb') as w:
 w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(countdown.tobytes())
print('Countdown speech duration:', len(countdown)/rate)
