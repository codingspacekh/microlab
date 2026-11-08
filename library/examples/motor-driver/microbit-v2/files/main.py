from microbit import *

# the L9110S's A-IA and A-IB: one on, the other off turns MOTOR A one way; how much of the time, how fast


def drive(a, b):   # 0–1023 on A-IA and A-IB
    pin1.write_analog(a)
    pin2.write_analog(b)


while True:
    drive(716, 0)    # forward at 70 %
    sleep(1000)
    drive(0, 0)      # stopped
    sleep(500)
    drive(0, 1023)   # backward at full speed
    sleep(1000)
    drive(0, 0)
    sleep(500)
