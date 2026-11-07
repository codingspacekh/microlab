from microbit import *
import music

# a passive buzzer on pin 0 plays what the speaker plays
for note in (262, 294, 330, 392):   # C D E G
    music.pitch(note, 250)
sleep(500)
