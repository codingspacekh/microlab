from machine import Pin, PWM
import time

# the L9110S's A-IA and A-IB: one on, the other off turns MOTOR A one way; how much of the time, how fast
ia = PWM(Pin(25), freq=1000, duty_u16=0)
ib = PWM(Pin(26), freq=1000, duty_u16=0)


def drive(a, b):   # 0–65535 on A-IA and A-IB
    ia.duty_u16(a)
    ib.duty_u16(b)


while True:
    drive(45875, 0)   # forward at 70 %
    time.sleep(1)
    drive(0, 0)       # stopped
    time.sleep(0.5)
    drive(0, 65535)   # backward at full speed
    time.sleep(1)
    drive(0, 0)
    time.sleep(0.5)
