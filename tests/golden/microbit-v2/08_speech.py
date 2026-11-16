# speech (1.0.2): the phonemes SAM's reciter makes of words, and its errors — the simulator's port of the firmware's
# lib/sam must give the same. Makes no sound; nothing wired; the micro:bit can lie anywhere.
import speech

WORDS = [
    "hello", "Hello, World", "my name is sam", "the quick brown fox jumps over the lazy dog",
    "micro:bit", "python", "I am a robot", "how are you today?", "one two three four five six seven eight nine ten",
    "1 2 3", "10 20 100", "3.14", "temperature is 25 degrees", "button A was pressed", "goodbye!",
    "electricity", "circuit", "resistor", "light emitting diode", "ultrasonic sensor", "Cambodia", "school",
    "exterminate", "it's", "a-b", "A", "",
]
for w in WORDS:
    try:
        print(repr(w), '->', repr(speech.translate(w)))
    except Exception as e:
        print(repr(w), '->', type(e).__name__ + ':', e)

for bad in ["x" * 81, 42]:
    try:
        speech.translate(bad)
        print('no error')
    except Exception as e:
        print(type(e).__name__ + ':', e)

for phonemes in ["X", "AA9", "#"]:
    try:
        speech.pronounce(phonemes, pin=None)
        print(repr(phonemes), 'said')
    except Exception as e:
        print(repr(phonemes), '->', type(e).__name__ + ':', e)
