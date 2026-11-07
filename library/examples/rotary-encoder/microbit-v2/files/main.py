from microbit import *

for p in (pin8, pin12):
    p.set_pull(p.NO_PULL)   # CLK and DT have pull-ups on the module
n, last = 0, 1
while True:
    clk = pin8.read_digital()
    if last and not clk:            # CLK falls: DT says which way
        n += 1 if pin12.read_digital() else -1
        print('steps', n)
    last = clk
    sleep(1)
