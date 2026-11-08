from microbit import *

pin0.set_analog_period(20)   # a pulse every 20 ms, from the GPIO board's 5V the servo turns


def turn(angle):
    # 0.5 ms of the 20 is 0°, 2.5 ms is 180° (write_analog: 0–1023 of the 20 ms)
    pin0.write_analog(26 + angle * 102 // 180)


while True:
    for angle in (0, 90, 180):
        turn(angle)
        sleep(1000)
