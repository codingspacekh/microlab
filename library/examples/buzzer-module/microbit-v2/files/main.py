from microbit import *
import music

# the module's I/O on pin 0: it plays what music plays
for note in (262, 294, 330, 392):   # C D E G
    music.pitch(note, 250)
sleep(500)
