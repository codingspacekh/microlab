from machine import Pin
import time

# the ULN2003's IN1–IN4; each half step turns on the next coil, or two (4096 half steps a turn)
coils = [Pin(n, Pin.OUT) for n in (19, 18, 5, 4)]
HALF = ((1, 0, 0, 0), (1, 1, 0, 0), (0, 1, 0, 0), (0, 1, 1, 0),
        (0, 0, 1, 0), (0, 0, 1, 1), (0, 0, 0, 1), (1, 0, 0, 1))


def coils_to(pattern):
    for coil, on in zip(coils, pattern):
        coil.value(on)


coils_to(HALF[0])            # it starts on coil A
for i in range(1, 1025):     # 1024 half steps: a quarter turn
    time.sleep_ms(2)
    coils_to(HALF[i % 8])
time.sleep_ms(2)
coils_to((0, 0, 0, 0))       # let it rest: no current
time.sleep(0.5)
