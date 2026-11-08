from microbit import *

# the HC-05: P1 to its RXD, P0 from its TXD; connect the phone on its card
uart.init(baudrate=9600, tx=pin1, rx=pin0)

while True:
    if uart.any():
        sleep(10)
        msg = uart.read().decode().strip()
        if msg == 'on':
            display.show(Image.HEART)
            uart.write('Heart on\n')
        elif msg == 'off':
            display.clear()
            uart.write('Off\n')
    sleep(20)
