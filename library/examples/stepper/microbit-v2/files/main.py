from microbit import *

# the ULN2003's IN1–IN4; each half step turns on the next coil, or two (4096 half steps a turn)
coils = [pin0, pin1, pin2, pin8]
HALF = ((1, 0, 0, 0), (1, 1, 0, 0), (0, 1, 0, 0), (0, 1, 1, 0),
        (0, 0, 1, 0), (0, 0, 1, 1), (0, 0, 0, 1), (1, 0, 0, 1))


def coils_to(pattern):
    for coil, on in zip(coils, pattern):
        coil.write_digital(on)


coils_to(HALF[0])            # it starts on coil A
for i in range(1, 1025):     # 1024 half steps: a quarter turn
    sleep(2)
    coils_to(HALF[i % 8])
sleep(2)
coils_to((0, 0, 0, 0))       # let it rest: no current
sleep(500)
