from microbit import *
import tm1637

clock = tm1637.TM1637(clk=pin1, dio=pin2)
s = 0
while True:
    clock.numbers(s // 60, s % 60)   # mm:ss, its colon on
    s += 1
    sleep(1000)
