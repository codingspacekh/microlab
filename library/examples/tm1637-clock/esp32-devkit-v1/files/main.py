from machine import Pin
import tm1637
import time

clock = tm1637.TM1637(clk=Pin(25), dio=Pin(26))
s = 0
while True:
    clock.numbers(s // 60, s % 60)   # mm:ss, its colon on
    s += 1
    time.sleep(1)
