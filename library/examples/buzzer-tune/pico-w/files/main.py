from machine import Pin, PWM
import time

buzzer = PWM(Pin(15))   # a passive buzzer: the PWM's frequency is the note
for note in (262, 294, 330, 392):   # C D E G
    buzzer.freq(note)
    buzzer.duty_u16(32768)   # half on, half off: the loudest
    time.sleep(0.25)
buzzer.duty_u16(0)           # silence
time.sleep(0.5)
