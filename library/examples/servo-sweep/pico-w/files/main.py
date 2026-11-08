from machine import Pin, PWM
import time

servo = PWM(Pin(16), freq=50)   # a pulse every 20 ms


def turn(angle):
    # 0.5 ms of the 20 is 0°, 2.5 ms is 180°
    servo.duty_u16(1638 + angle * 6553 // 180)


while True:
    for angle in (0, 90, 180):
        turn(angle)
        time.sleep(1)
